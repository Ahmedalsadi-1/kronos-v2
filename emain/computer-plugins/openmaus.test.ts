import { afterEach, expect, it, vi } from "vitest";
import {
    containerComputerAction,
    containerComputerStatus,
} from "../linux-desktop/upstream/openmaus/container-computer";
import { OpenMausComputerPlugin } from "./openmaus";
vi.mock("../linux-desktop/upstream/openmaus/container-computer", async (importActual) => {
    const actual = await importActual<any>();
    return {
        ...actual,
        containerComputerStatus: vi.fn(async () => ({
            runtime: "docker",
            daemonUp: true,
            container: "running",
            ready: true,
            image: true,
            viewer_url: "http://127.0.0.1:12345/vnc.html#password=fixture",
            workspace_path: "/fixture",
            driver_version: "0.37.0",
        })),
        containerComputerAction: vi.fn(async () => ({})),
    };
});
afterEach(() => vi.clearAllMocks());
it("uses independent immutable container targets and generation checks", async () => {
    const runner = vi.fn(async (_command: string, _args: string[]) => ({ stdout: "{}" }));
    const first = new OpenMausComputerPlugin("linux-container:one", "One", runner);
    const second = new OpenMausComputerPlugin("linux-container:two", "Two", runner);
    const one = (await first.list())[0];
    await second.list();
    const targets = vi.mocked(containerComputerStatus).mock.calls.map((call) => call[2]);
    expect(targets[0].containerName).not.toBe(targets[1].containerName);
    expect(targets[0].workspaceDir).not.toBe(targets[1].workspaceDir);
    const assigned = await first.assign(one.id, "agent-a", 0);
    await first.performAgent({
        desktopId: one.id,
        action: "type",
        text: "quote ' $(echo no)",
        assignedAgentId: "agent-a",
        expectedGeneration: assigned.controlGeneration,
    });
    const args = runner.mock.calls[0][1];
    expect(args).toContain(JSON.stringify({ text: "quote ' $(echo no)" }));
    await first.takeover(one.id);
    await expect(
        first.performAgent({
            desktopId: one.id,
            action: "stop",
            assignedAgentId: "agent-a",
            expectedGeneration: assigned.controlGeneration,
        })
    ).rejects.toThrow("control changed");
    expect(containerComputerAction).not.toHaveBeenCalled();
});
