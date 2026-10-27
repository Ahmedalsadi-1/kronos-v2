import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ToolOperationContext } from "../../mcp-kron-term/src/tool-execution";
import { DATA_DIR } from "./upstream/openmaus/kronterm-adapter";

vi.mock("node:fs/promises", () => ({
    stat: vi.fn(async () => ({ size: 1024 })),
    readFile: vi.fn(async () => "99999"),
    mkdir: vi.fn(),
    rm: vi.fn(),
    writeFile: vi.fn(),
}));

import { QemuLinuxDesktopRuntime } from "./qemu-linux-runtime";

describe("QEMU authority boundaries", () => {
    it("fences an agent start when the user takes over during readiness checks", async () => {
        const runner = vi.fn();
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        vi.spyOn(runtime, "list").mockResolvedValue([]);
        vi.spyOn(runtime as any, "exists").mockResolvedValue(true);
        let release: (pid: number) => void;
        const probe = new Promise<number>((resolve) => {
            release = resolve;
        });
        let entered: () => void;
        const awaitingProbe = new Promise<void>((resolve) => {
            entered = resolve;
        });
        vi.spyOn(runtime as any, "pid").mockImplementation(() => {
            entered();
            return probe;
        });
        await runtime.assign("linux-vm:ubuntu", "agent", 0);
        const pending = runtime.performAgent({
            desktopId: "linux-vm:ubuntu",
            action: "start",
            expectedGeneration: 1,
            assignedAgentId: "agent",
        });
        await awaitingProbe;
        await runtime.takeover("linux-vm:ubuntu");
        release(undefined);
        await expect(pending).rejects.toThrow("Control changed");
        expect(runner).not.toHaveBeenCalled();
    });
    it("denies stale screenshot authorization before contacting the guest", async () => {
        const runner = vi.fn();
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        await expect(
            runtime.performAgent({
                desktopId: "linux-vm:ubuntu",
                action: "screenshot",
                expectedGeneration: 0,
                assignedAgentId: "unknown",
            })
        ).rejects.toThrow("Control changed");
        expect(runner).not.toHaveBeenCalled();
    });
});

describe("QEMU guest input", () => {
    it("passes horizontal scrolling to the guest and leaves zero deltas untouched", async () => {
        const kill = vi.spyOn(process, "kill").mockReturnValue(true);
        const runner = vi.fn(async (command: string, args: string[]) => ({
            stdout:
                command === "ps"
                    ? `qemu-system-aarch64 ${join(DATA_DIR, "qemu", "ubuntu.qcow2")}`
                    : command === "ssh" && args.at(-1).includes("call scroll")
                      ? "{}"
                      : "",
        }));
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        try {
            await runtime.perform({
                desktopId: "linux-vm:ubuntu",
                action: "scroll",
                expectedGeneration: 0,
                deltaX: -200,
                deltaY: 0,
            });
            const inputCalls = runner.mock.calls.filter(
                ([command, args]) => command === "ssh" && args.at(-1).includes("call scroll")
            );
            expect(inputCalls).toHaveLength(1);
            expect(inputCalls[0][1].at(-1)).toContain('"direction":"left"');
            await runtime.perform({
                desktopId: "linux-vm:ubuntu",
                action: "scroll",
                expectedGeneration: 0,
                deltaX: 0,
                deltaY: 0,
            });
            expect(
                runner.mock.calls.filter(([command, args]) => command === "ssh" && args.at(-1).includes("call scroll"))
            ).toHaveLength(1);
        } finally {
            kill.mockRestore();
        }
    });
    it("marks unsupported hosts unavailable before attempting guest commands", async () => {
        const runner = vi.fn();
        const runtime = new QemuLinuxDesktopRuntime(runner, "linux", "x64");
        const desktops = await runtime.list();
        expect(desktops[0].status).toBe("unavailable");
        expect(desktops[0].ready).toBe(false);
        expect(runner).not.toHaveBeenCalled();
    });
});

describe("VM idle shutdown and driver input", () => {
    it("stops an idle VM even while screenshots are being observed", async () => {
        vi.useFakeTimers();
        const kill = vi.spyOn(process, "kill").mockReturnValue(true);
        const runtime = new QemuLinuxDesktopRuntime(
            vi.fn(async () => ({ stdout: "{}" })),
            "darwin",
            "arm64"
        );
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:ubuntu", status: "running", ready: true } as any]);
        vi.spyOn(runtime as any, "pid").mockResolvedValue(12345);
        try {
            await runtime.perform({
                desktopId: "linux-vm:ubuntu",
                action: "key",
                key: "Escape",
                expectedGeneration: 0,
            });
            await vi.advanceTimersByTimeAsync(299_000);
            // Polling readiness and capture never calls the input lease renewal.
            await runtime.list();
            await vi.advanceTimersByTimeAsync(1000);
            expect(kill).toHaveBeenCalledWith(12345, "SIGTERM");
        } finally {
            kill.mockRestore();
            vi.useRealTimers();
        }
    });
    it("renews the idle timeout only when input is sent", async () => {
        vi.useFakeTimers();
        const kill = vi.spyOn(process, "kill").mockReturnValue(true);
        const runtime = new QemuLinuxDesktopRuntime(
            vi.fn(async () => ({ stdout: "{}" })),
            "darwin",
            "arm64"
        );
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:ubuntu", status: "running", ready: true } as any]);
        vi.spyOn(runtime as any, "pid").mockResolvedValue(12345);
        const key = { desktopId: "linux-vm:ubuntu", action: "key" as const, key: "Escape", expectedGeneration: 0 };
        try {
            await runtime.perform(key);
            await vi.advanceTimersByTimeAsync(240_000);
            await runtime.perform(key);
            await vi.advanceTimersByTimeAsync(60_000);
            expect(kill).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(240_000);
            expect(kill).toHaveBeenCalledWith(12345, "SIGTERM");
        } finally {
            kill.mockRestore();
            vi.useRealTimers();
        }
    });
    it("uses the Linux driver's global route and separates shortcut modifiers", async () => {
        const runner = vi.fn(async () => ({ stdout: "{}" }));
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:ubuntu", ready: true } as any]);
        await runtime.perform({
            desktopId: "linux-vm:ubuntu",
            action: "key",
            key: "ctrl+alt+t",
            expectedGeneration: 0,
        });
        const command = runner.mock.calls[0][1].at(-1);
        expect(command).toContain('"scope":"desktop"');
        expect(command).toContain('"key":"t","modifiers":["ctrl","alt"]');
        expect(command).not.toContain('"target"');
    });
    it("reports driver rejection instead of treating rejected input as successful", async () => {
        const runtime = new QemuLinuxDesktopRuntime(
            vi.fn(async () => ({ stdout: '{"code":"invalid_action_target"}' })),
            "darwin",
            "arm64"
        );
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:ubuntu", ready: true } as any]);
        await expect(
            runtime.perform({ desktopId: "linux-vm:ubuntu", action: "click", x: 20, y: 30, expectedGeneration: 0 })
        ).rejects.toThrow("invalid_action_target");
    });
});

describe("VM queue observation ordering", () => {
    it("does not share a screenshot across an intervening queued input", async () => {
        const runtime = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
        let release: () => void;
        const barrier = new Promise<void>((resolve) => {
            release = resolve;
        });
        const calls: string[] = [];
        vi.spyOn(runtime as any, "execute").mockImplementation(async (action: any) => {
            calls.push(action.action);
            if (calls.length === 1) await barrier;
            return { desktop: {}, output: String(calls.length) };
        });
        const initial = runtime.perform({ desktopId: "linux-vm:ubuntu", action: "screenshot" });
        const click = runtime.perform({
            desktopId: "linux-vm:ubuntu",
            action: "click",
            expectedGeneration: 0,
            x: 10,
            y: 20,
        });
        const after = runtime.perform({ desktopId: "linux-vm:ubuntu", action: "screenshot" });
        release();
        const [beforeResult, , afterResult] = await Promise.all([initial, click, after]);
        expect(calls).toEqual(["screenshot", "click", "screenshot"]);
        expect(afterResult.output).not.toBe(beforeResult.output);
    });
    it("freezes queued VM inputs instead of allowing caller retargeting", async () => {
        const runtime = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
        const execute = vi.spyOn(runtime as any, "execute").mockResolvedValue({ desktop: {} });
        const action = { desktopId: "linux-vm:ubuntu", action: "click" as const, expectedGeneration: 0, x: 10, y: 20 };
        const pending = runtime.perform(action);
        action.x = 900;
        await pending;
        expect(execute.mock.calls[0][0]).toMatchObject({ x: 10 });
    });
});

describe("VM input result and shortcut consistency", () => {
    it("rejects explicit guest failure envelopes and malformed scroll origins", async () => {
        const runner = vi.fn(async () => ({ stdout: '{"success":false,"message":"not focused"}' }));
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:ubuntu", ready: true } as any]);
        await expect(
            runtime.perform({ desktopId: "linux-vm:ubuntu", action: "click", expectedGeneration: 0, x: 1, y: 2 })
        ).rejects.toThrow("Guest input failed");
        runner.mockClear();
        await expect(
            runtime.perform({
                desktopId: "linux-vm:ubuntu",
                action: "scroll",
                expectedGeneration: 0,
                x: NaN,
                deltaY: 40,
            })
        ).rejects.toThrow("scroll coordinates");
        expect(runner).not.toHaveBeenCalled();
    });
    it("accepts canonical Control and Meta modifier names from agent shortcuts", async () => {
        const runner = vi.fn(async () => ({ stdout: "{}" }));
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:ubuntu", ready: true } as any]);
        await runtime.perform({
            desktopId: "linux-vm:ubuntu",
            action: "key",
            expectedGeneration: 0,
            key: "Control+Alt+t",
        });
        expect(runner.mock.calls[0][1].at(-1)).toContain('"key":"t","modifiers":["ctrl","alt"]');
    });
});

it("does not execute cancelled VM inputs that were waiting in the queue", async () => {
    const runner = vi.fn();
    const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
    let release: () => void;
    (runtime as any).queue = new Promise<void>((resolve) => {
        release = resolve;
    });
    const controller = new AbortController();
    const pending = ToolOperationContext.run({ signal: controller.signal } as any, () =>
        runtime.perform({
            desktopId: "linux-vm:ubuntu",
            action: "click",
            x: 20,
            y: 30,
            expectedGeneration: 0,
        })
    );
    controller.abort();
    release();
    await expect(pending).rejects.toThrow(/abort/i);
    expect(runner).not.toHaveBeenCalled();
});
