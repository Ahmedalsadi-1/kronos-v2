import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bindSandboxComputer, sandboxComputerForTab } from "./computer-access-policy";
import { registerLinuxDesktopsIpc } from "./linux-desktops-ipc";
const fixture = vi.hoisted(() => ({
    handlers: new Map<string, (...args: any[]) => any>(),
    activeExternal: false,
    desktop: { id: "linux-vm:ubuntu", controlOwner: "user", controlGeneration: 0, assignedAgentId: "" },
}));
const fleet = vi.hoisted(() => ({
    list: vi.fn(async () => [fixture.desktop]),
    assign: vi.fn(async (_id, label, _generation) => {
        fixture.desktop.controlOwner = "agent";
        fixture.desktop.assignedAgentId = label;
        fixture.desktop.controlGeneration++;
        return fixture.desktop;
    }),
    takeover: vi.fn(async () => {
        fixture.desktop.controlOwner = "user";
        return fixture.desktop;
    }),
    manage: vi.fn(),
    perform: vi.fn(),
    resume: vi.fn(),
}));
vi.mock("electron", () => ({ ipcMain: { handle: (name, handler) => fixture.handlers.set(name, handler) } }));
vi.mock("./emain-tabview", () => ({
    getWaveTabViewByWebContentsId: (id) => (id === 1 ? { waveTabId: "sandbox-tab" } : undefined),
}));
vi.mock("./emain-hud", () => ({ isTrustedNativeHudSender: () => false, nativeHudTaskContext: () => undefined }));
vi.mock("./acp/acp-agent-manager", () => ({ hasRunningExternalAgentForTab: () => fixture.activeExternal }));
vi.mock("./linux-desktops-runtime", () => ({ getLinuxDesktopsRuntime: () => fleet }));
const frame = {};
const event = { sender: { id: 1, mainFrame: frame }, senderFrame: frame };
beforeEach(() => {
    fixture.activeExternal = false;
    fixture.desktop.controlOwner = "user";
    fixture.desktop.assignedAgentId = "";
    fixture.handlers.clear();
    registerLinuxDesktopsIpc();
});
afterEach(() => {
    bindSandboxComputer("sandbox-tab");
    vi.clearAllMocks();
});
it("grants the selected VM to its owning workspace and revokes it on disable", async () => {
    const call = fixture.handlers.get("computer-access");
    expect(await call(event, { enabled: true, desktopId: "linux-vm:ubuntu" })).toEqual({
        enabled: true,
        desktopId: "linux-vm:ubuntu",
    });
    expect(fleet.assign).toHaveBeenCalledWith("linux-vm:ubuntu", "sandbox:sandbox-tab", expect.any(Number));
    expect(sandboxComputerForTab("sandbox-tab")).toBe("linux-vm:ubuntu");
    expect(await call(event, { enabled: false })).toEqual({ enabled: false, desktopId: "" });
    expect(fleet.takeover).toHaveBeenCalled();
});
it("rejects subframes, unknown computers, running external agents and another workspace's reservation", async () => {
    const call = fixture.handlers.get("computer-access");
    await expect(call({ ...event, senderFrame: {} }, { enabled: true, desktopId: "linux-vm:ubuntu" })).rejects.toThrow(
        "Only a workspace"
    );
    await expect(call(event, { enabled: true, desktopId: "unknown" })).rejects.toThrow("Choose an available");
    fixture.activeExternal = true;
    await expect(call(event, { enabled: true, desktopId: "linux-vm:ubuntu" })).rejects.toThrow("external ACP");
    fixture.activeExternal = false;
    fixture.desktop.controlOwner = "agent";
    fixture.desktop.assignedAgentId = "sandbox:other";
    await expect(call(event, { enabled: true, desktopId: "linux-vm:ubuntu" })).rejects.toThrow("another workspace");
    expect(fleet.assign).not.toHaveBeenCalled();
});
