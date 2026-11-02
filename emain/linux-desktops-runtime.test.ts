import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { LinuxDesktopFleetRuntime } from "./linux-desktops-runtime";

it("routes independent registered computers to provider plugins and persists configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "computer-registry-"));
    const factory = vi.fn(
        (config) =>
            ({
                list: async () => [{ id: config.id, name: config.name, provider: config.provider, status: "stopped" }],
                perform: vi.fn(async (action) => ({ desktop: { id: action.desktopId } })),
            }) as any
    );
    try {
        const file = join(dir, "plugins.json");
        const fleet = new LinuxDesktopFleetRuntime(file, factory);
        expect((await fleet.list()).map((desktop) => desktop.provider)).toEqual(["cua-qemu", "openmaus-container"]);
        const state = await fleet.manage({ action: "create", provider: "openmaus-container", name: "Research" });
        const added = state.computers.find((computer) => computer.name === "Research");
        expect(added.id).toMatch(/^linux-container:/);
        const result = await fleet.perform({ desktopId: added.id, action: "start" });
        expect(result.desktop.id).toBe(added.id);
        expect(factory).toHaveBeenCalledTimes(3);
        expect(new LinuxDesktopFleetRuntime(file, factory).state()).toEqual(state);
        await fleet.manage({ action: "plugin", provider: "openmaus-container", enabled: false });
        expect((await fleet.list()).map((desktop) => desktop.id)).toEqual(["linux-vm:ubuntu"]);
        expect(() => fleet.perform({ desktopId: added.id, action: "start" })).toThrow("unavailable");
        expect(() => fleet.perform({ desktopId: "../../host", action: "start" })).toThrow("unavailable");
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
