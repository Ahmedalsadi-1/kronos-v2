import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ToolOperationContext } from "../../mcp-kron-term/src/tool-execution";
import { DATA_DIR } from "./upstream/openmaus/kronterm-adapter";
import { isManagedQemu } from "./vm-process";

vi.mock("./vm-process", () => ({ isManagedQemu: vi.fn(() => true) }));

vi.mock("node:fs/promises", () => ({
    stat: vi.fn(async () => ({ size: 1024 })),
    readFile: vi.fn(async () => "99999"),
    mkdir: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    writeFile: vi.fn(),
}));

import { QemuLinuxDesktopRuntime } from "./qemu-linux-runtime";

describe("QEMU status polling", () => {
    it("uses the native process inspector with the exact configured drive", async () => {
        const runner = vi.fn();
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        await expect((runtime as any).pid()).resolves.toBe(99999);
        expect(isManagedQemu).toHaveBeenCalledWith(
            99999,
            `file=${join(DATA_DIR, "qemu", "ubuntu.qcow2")},format=qcow2,if=virtio`
        );
        vi.mocked(isManagedQemu).mockReturnValueOnce(false);
        await expect((runtime as any).pid()).resolves.toBeUndefined();
        vi.mocked(isManagedQemu).mockImplementationOnce(() => {
            throw new Error("inspection failed");
        });
        await expect((runtime as any).pid()).rejects.toThrow("inspection failed");
        expect(runner).not.toHaveBeenCalled();
    });

    it("ignores a viewer setup that completes after shutdown", async () => {
        const runtime = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
        let finish: (result: { stdout: string }) => void;
        vi.spyOn(runtime as any, "ssh").mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            })
        );
        const open = vi.spyOn((runtime as any).vncBridge, "open");
        (runtime as any).configureViewer();
        const setup = (runtime as any).viewerSetup;
        (runtime as any).resetViewer();
        finish({ stdout: "" });
        await setup;
        expect(open).not.toHaveBeenCalled();
    });

    it("shares a cold readiness probe across concurrent readers", async () => {
        const runtime = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
        const pid = vi.spyOn(runtime as any, "pid").mockResolvedValue(1234);
        const ssh = vi.spyOn(runtime as any, "ssh").mockResolvedValue({ stdout: "" });
        vi.spyOn(runtime as any, "configureViewer").mockImplementation(() => {});
        const desktops = await Promise.all(Array.from({ length: 8 }, () => runtime.list()));
        expect(pid).toHaveBeenCalledTimes(1);
        expect(ssh).toHaveBeenCalledTimes(1);
        expect(desktops.every(([desktop]) => desktop.ready)).toBe(true);
    });

    it("rechecks status if the VM lifecycle changes during a pending probe", async () => {
        const runtime = new QemuLinuxDesktopRuntime(vi.fn(), "darwin", "arm64");
        let resolvePid: (pid: number) => void;
        const pendingPid = new Promise<number>((resolve) => {
            resolvePid = resolve;
        });
        const pid = vi
            .spyOn(runtime as any, "pid")
            .mockReturnValueOnce(pendingPid)
            .mockResolvedValue(undefined);
        const ssh = vi.spyOn(runtime as any, "ssh").mockResolvedValue({ stdout: "" });
        const first = runtime.list();
        (runtime as any).invalidateStatus();
        const second = runtime.list();
        resolvePid(1234);
        expect((await first)[0].status).toBe("stopped");
        expect((await second)[0].status).toBe("stopped");
        expect(pid).toHaveBeenCalledTimes(2);
        expect(ssh).not.toHaveBeenCalled();
    });
});

describe("QEMU authority boundaries", () => {
    it("prepares and starts a new VM only through the user's first-launch action", async () => {
        const runner = vi.fn(async () => ({ stdout: "" }));
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        const desktopId = "linux-vm:ubuntu";
        vi.spyOn(runtime, "list").mockResolvedValue([]);
        vi.spyOn(runtime as any, "pid").mockResolvedValue(undefined);
        const exists = vi.spyOn(runtime as any, "exists").mockResolvedValue(false);
        const prepare = vi.spyOn(runtime as any, "prepare").mockResolvedValue(undefined);

        await runtime.assign(desktopId, "agent-a", 0);
        const agent = { desktopId, assignedAgentId: "agent-a", expectedGeneration: 1 };
        await expect(runtime.performAgent({ ...agent, action: "create" })).rejects.toThrow("management UI");
        await expect(runtime.performAgent({ ...agent, action: "start" })).rejects.toThrow("prepare it first");
        expect(prepare).not.toHaveBeenCalled();
        expect(runner).not.toHaveBeenCalled();

        await runtime.takeover(desktopId);
        await runtime.perform({ desktopId, action: "create", expectedGeneration: 2 });
        expect(prepare).toHaveBeenCalledTimes(1);
        expect(runner).toHaveBeenCalledWith("qemu-system-aarch64", expect.arrayContaining(["-daemonize"]), 30_000);

        exists.mockResolvedValue(true);
        await runtime.perform({ desktopId, action: "start", expectedGeneration: 2 });
        expect(prepare).toHaveBeenCalledTimes(1);
    });

    it("hands back only the current assignment and fences subsequent agent input", async () => {
        const runner = vi.fn();
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        vi.spyOn(runtime, "list").mockResolvedValue([]);
        await runtime.assign("linux-vm:ubuntu", "agent-a", 0);
        await expect(runtime.takeover("linux-vm:ubuntu", { agentId: "agent-b", generation: 1 })).rejects.toThrow(
            "Control changed"
        );
        await expect(runtime.takeover("linux-vm:ubuntu", { agentId: "agent-a", generation: 0 })).rejects.toThrow(
            "Control changed"
        );
        await runtime.takeover("linux-vm:ubuntu", { agentId: "agent-a", generation: 1 });
        await expect(
            runtime.performAgent({
                desktopId: "linux-vm:ubuntu",
                action: "exec",
                command: "printf unexpected",
                assignedAgentId: "agent-a",
                expectedGeneration: 1,
            })
        ).rejects.toThrow("Control changed");
        expect(runner).not.toHaveBeenCalled();
    });
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
    it("returns an accessible hit only for the selected point and current control generation", async () => {
        const desktopId = "linux-vm:ubuntu";
        const element = {
            application: "xfce4-panel",
            role: "push button",
            name: "Browser",
            frame: { x: 449, y: 598, width: 42, height: 42 },
        };
        const runner = vi.fn(async () => ({ stdout: JSON.stringify(element) }));
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: desktopId, ready: true } as any]);
        await runtime.assign(desktopId, "agent", 0);
        const pick = { desktopId, action: "pick-element", expectedGeneration: 1, x: 470, y: 617 } as const;
        await expect(runtime.perform({ ...pick, expectedGeneration: 0 })).rejects.toThrow("Control changed");
        expect(runner).not.toHaveBeenCalled();
        await expect(runtime.perform(pick)).resolves.toMatchObject({ element });
        await expect(runtime.perform({ ...pick, x: 510 })).resolves.not.toHaveProperty("element");
    });
    it("passes horizontal scrolling to the guest and leaves zero deltas untouched", async () => {
        const kill = vi.spyOn(process, "kill").mockReturnValue(true);
        const runner = vi.fn(async (command: string, args: string[]) => ({
            stdout: command === "ssh" && args.at(-1).includes("call scroll") ? "{}" : "",
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
    it("waits for the guest to power off before reporting the VM stopped", async () => {
        const runner = vi.fn(async () => ({ stdout: "" }));
        const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
        const kill = vi.spyOn(process, "kill");
        vi.spyOn(runtime as any, "pid")
            .mockResolvedValueOnce(12345)
            .mockResolvedValue(undefined);
        try {
            const result = await runtime.perform({
                desktopId: "linux-vm:ubuntu",
                action: "stop",
                expectedGeneration: 0,
            });
            expect(result.desktop.status).toBe("stopped");
            expect(runner).toHaveBeenCalledWith(
                "ssh",
                expect.arrayContaining([expect.stringContaining("systemctl poweroff")]),
                5000
            );
            expect(kill).not.toHaveBeenCalled();
        } finally {
            kill.mockRestore();
        }
    });

    it("stops an idle VM even while screenshots are being observed", async () => {
        vi.useFakeTimers();
        const kill = vi.spyOn(process, "kill").mockReturnValue(true);
        const runtime = new QemuLinuxDesktopRuntime(
            vi.fn(async () => ({ stdout: "{}" })),
            "darwin",
            "arm64"
        );
        vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:ubuntu", status: "running", ready: true } as any]);
        vi.spyOn(runtime as any, "pid")
            .mockResolvedValueOnce(12345)
            .mockResolvedValueOnce(12345)
            .mockResolvedValue(undefined);
        const ssh = (runtime as any).ssh.bind(runtime);
        vi.spyOn(runtime as any, "ssh").mockImplementation((command: string) =>
            command.includes("poweroff") ? Promise.reject(new Error("guest unreachable")) : ssh(command)
        );
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
        vi.spyOn(runtime as any, "pid")
            .mockResolvedValueOnce(12345)
            .mockResolvedValueOnce(12345)
            .mockResolvedValue(undefined);
        const ssh = (runtime as any).ssh.bind(runtime);
        vi.spyOn(runtime as any, "ssh").mockImplementation((command: string) =>
            command.includes("poweroff") ? Promise.reject(new Error("guest unreachable")) : ssh(command)
        );
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

it("reuses boot readiness, probes health periodically, and invalidates it when the VM PID changes", async () => {
    let now = 100_000;
    let pid = 99999;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const runner = vi.fn(async () => ({ stdout: "" }));
    const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64");
    vi.spyOn(runtime as any, "pid").mockImplementation(async () => pid);
    vi.spyOn(runtime as any, "configureViewer").mockImplementation(() => {});
    vi.spyOn(runtime as any, "scheduleIdle").mockImplementation(() => {});
    try {
        expect((await runtime.list())[0].ready).toBe(true);
        expect(runner.mock.calls).toHaveLength(1);
        now += 3000;
        expect((await runtime.list())[0].ready).toBe(true);
        expect(runner.mock.calls).toHaveLength(1);
        now += 15_000;
        expect((await runtime.list())[0].ready).toBe(true);
        expect(runner.mock.calls).toHaveLength(2);
        const commands = runner.mock.calls as unknown as [string, string[]][];
        expect(commands[0][1].at(-1)).toContain("cloud-init status");
        expect(commands[1][1].at(-1)).not.toContain("cloud-init");
        pid++;
        now += 3000;
        expect((await runtime.list())[0].ready).toBe(true);
        expect(commands[2][1].at(-1)).toContain("cloud-init status");
    } finally {
        clock.mockRestore();
    }
});

it("preserves both scroll axes instead of silently discarding the smaller movement", async () => {
    const runner = vi.fn(async () => ({ stdout: "{}" }));
    const runtime = new QemuLinuxDesktopRuntime(runner, "darwin", "arm64", "linux-vm:diagonal");
    vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:diagonal", ready: true } as any]);
    await runtime.perform({
        desktopId: "linux-vm:diagonal",
        action: "scroll",
        expectedGeneration: 0,
        deltaX: 80,
        deltaY: 240,
    });
    expect(runner.mock.calls).toHaveLength(2);
    expect((runner.mock.calls[0] as any)[1].at(-1)).toContain('"direction":"right"');
    expect((runner.mock.calls[1] as any)[1].at(-1)).toContain('"direction":"down"');
});

it("fences queued input even when checkpoint restore has an uncertain outcome", async () => {
    const { VmHistoryStore } = await import("./vm-history");
    const restore = vi.spyOn(VmHistoryStore.prototype, "restore").mockRejectedValue(new Error("Monitor disconnected"));
    const runtime = new QemuLinuxDesktopRuntime(
        vi.fn(async () => ({ stdout: "" })),
        "darwin",
        "arm64",
        "linux-vm:restore-fence"
    );
    vi.spyOn(runtime, "list").mockResolvedValue([{ id: "linux-vm:restore-fence", ready: true } as any]);
    try {
        await runtime.assign("linux-vm:restore-fence", "agent", 0);
        const assignment = { desktopId: "linux-vm:restore-fence", assignedAgentId: "agent", expectedGeneration: 1 };
        const restoring = runtime.performAgent({
            ...assignment,
            action: "history",
            historyAction: "restore",
            checkpointId: "checkpoint",
        });
        const queued = runtime.performAgent({ ...assignment, action: "click", x: 1, y: 1 });
        await expect(restoring).rejects.toThrow("Monitor disconnected");
        await expect(queued).rejects.toThrow("Control changed");
    } finally {
        restore.mockRestore();
    }
});
