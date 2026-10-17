import { expect, it, vi } from "vitest";
import { LinuxDesktopFleetRuntime } from "./linux-desktops-runtime";

it("exposes one Ubuntu VM and rejects the removed container backend", async () => {
    const runtime = new LinuxDesktopFleetRuntime(vi.fn(), "linux", "x64");
    expect((await runtime.list()).map((desktop) => desktop.id)).toEqual(["linux-vm:ubuntu"]);
    await expect(
        runtime.perform({ desktopId: "linux-desktop:primary", action: "start", expectedGeneration: 0 })
    ).rejects.toThrow("Unknown Linux VM");
});
