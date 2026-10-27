import { describe, expect, it, vi } from "vitest";
import type { ComputerTarget } from "../../../types/computer-targets";
import { ComputersController, normalizedCapturePoint, type ComputersApi } from "./computers-state";

const Target: ComputerTarget = {
    id: "one",
    name: "iPhone",
    kind: "ios-simulator",
    status: "booted",
    runtime: "iOS 18",
    capabilities: ["boot", "open", "screenshot", "shutdown"],
    controlOwner: "user",
    controlGeneration: 2,
    labs: true,
};
function api(): ComputersApi {
    return {
        listComputerTargets: vi.fn().mockResolvedValue({ success: true, data: [Target] }),
        performComputerTargetAction: vi.fn().mockResolvedValue({ success: true, data: { target: Target } }),
        takeOverComputerTarget: vi.fn().mockResolvedValue({
            success: true,
            data: { target: { ...Target, controlGeneration: 3, automationPaused: true } },
        }),
        resumeComputerTarget: vi.fn().mockResolvedValue({
            success: true,
            data: { target: { ...Target, controlGeneration: 4, automationPaused: false } },
        }),
    };
}

describe("ComputersController", () => {
    it("keeps automation paused through user actions until explicit resume", async () => {
        const client = api();
        const paused = { ...Target, controlGeneration: 3, automationPaused: true };
        vi.mocked(client.performComputerTargetAction).mockResolvedValue({ success: true, data: { target: paused } });
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        await controller.act("takeover");
        await controller.act("type", { text: "human input" });
        expect(controller.state.targets[0].automationPaused).toBe(true);
        expect(client.resumeComputerTarget).not.toHaveBeenCalled();
        await controller.act("resume");
        expect(client.resumeComputerTarget).toHaveBeenCalledWith("one", 3);
        expect(controller.state.targets[0].automationPaused).toBe(false);
        expect(controller.state.snapshot).toBeUndefined();
    });
    it("clears old frames when ownership changes during discovery", async () => {
        const client = api();
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        vi.mocked(client.performComputerTargetAction).mockResolvedValueOnce({
            success: true,
            data: { target: Target, imageDataUrl: "data:image/png;base64,abc" },
        });
        await controller.act("screenshot");
        vi.mocked(client.listComputerTargets).mockResolvedValueOnce({
            success: true,
            data: [{ ...Target, controlGeneration: 3, controlOwner: "agent" }],
        });
        await controller.refresh();
        expect(controller.state.snapshot).toBeUndefined();
    });

    it("clears old frames when switching devices", async () => {
        const client = api();
        vi.mocked(client.listComputerTargets).mockResolvedValueOnce({
            success: true,
            data: [Target, { ...Target, id: "two" }],
        });
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        vi.mocked(client.performComputerTargetAction).mockResolvedValueOnce({
            success: true,
            data: { target: Target, imageDataUrl: "data:image/png;base64,abc" },
        });
        await controller.act("screenshot");
        controller.select("two");
        expect(controller.state.selectedId).toBe("two");
        expect(controller.state.snapshot).toBeUndefined();
    });

    it("normalizes the displayed image bounds and ignores surrounding clicks", () => {
        const bounds = { left: 100, top: 40, width: 200, height: 400 };
        expect(normalizedCapturePoint(bounds, 150, 340)).toEqual({ x: 0.25, y: 0.75 });
        expect(normalizedCapturePoint(bounds, 50, 340)).toBeNull();
        expect(normalizedCapturePoint({ ...bounds, width: 0 }, 150, 340)).toBeNull();
    });

    it.each(["takeover", "tap", "type", "back"] as const)("invalidates captured evidence after %s", async (action) => {
        const client = api();
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        vi.mocked(client.performComputerTargetAction).mockResolvedValueOnce({
            success: true,
            data: { target: Target, imageDataUrl: "data:image/png;base64,abc" },
        });
        await controller.act("screenshot");
        expect(controller.state.snapshot).toBeTruthy();
        await controller.act(action);
        expect(controller.state.snapshot).toBeUndefined();
    });
    it("forwards normalized device input only for the selected ownership generation", async () => {
        const client = api();
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        await controller.act("tap", { x: 0.25, y: 0.75 });
        expect(client.performComputerTargetAction).toHaveBeenCalledWith({
            targetId: "one",
            action: "tap",
            expectedGeneration: 2,
            x: 0.25,
            y: 0.75,
        });
        await controller.act("takeover");
        await controller.act("type", { text: "hello" });
        expect(client.performComputerTargetAction).toHaveBeenLastCalledWith({
            targetId: "one",
            action: "type",
            expectedGeneration: 3,
            text: "hello",
        });
    });
    it("keeps the newest discovery result when older requests finish late", async () => {
        const client = api();
        let finish: (result: unknown) => void;
        vi.mocked(client.listComputerTargets).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const controller = new ComputersController(client, vi.fn());
        const old = controller.refresh();
        await controller.refresh();
        finish({ success: true, data: [] });
        await old;
        expect(controller.state.targets).toEqual([Target]);
        expect(controller.state.loading).toBe(false);
    });

    it("passes the ownership generation and prevents duplicate device actions", async () => {
        const client = api();
        let finish: (result: unknown) => void;
        vi.mocked(client.performComputerTargetAction).mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        const pending = controller.act("screenshot");
        await controller.act("shutdown");
        expect(client.performComputerTargetAction).toHaveBeenCalledTimes(1);
        expect(client.performComputerTargetAction).toHaveBeenCalledWith({
            targetId: "one",
            action: "screenshot",
            expectedGeneration: 2,
        });
        finish({ success: true, data: { target: Target, imageDataUrl: "data:image/png;base64,abc", capturedAt: 1 } });
        await pending;
        expect(controller.state.snapshot?.imageDataUrl).toBeTruthy();
    });

    it("reads live frames serially and preserves them through touch input", async () => {
        vi.useFakeTimers();
        try {
            const client = api();
            client.startComputerTargetSession = vi.fn().mockResolvedValue({
                success: true,
                data: { id: "live", targetId: "one", controlGeneration: 2, live: true },
            });
            client.stopComputerTargetSession = vi.fn().mockResolvedValue({ success: true });
            let finish: (result: unknown) => void;
            client.readComputerTargetFrame = vi
                .fn()
                .mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            finish = resolve;
                        })
                )
                .mockResolvedValue({
                    success: true,
                    data: { sessionId: "live", sequence: 2, imageDataUrl: "frame2", capturedAt: 2 },
                });
            const controller = new ComputersController(client, vi.fn());
            await controller.refresh();
            await controller.connect();
            await vi.advanceTimersByTimeAsync(1000);
            expect(client.readComputerTargetFrame).toHaveBeenCalledTimes(1);
            finish({ success: true, data: { sessionId: "live", sequence: 1, imageDataUrl: "frame1", capturedAt: 1 } });
            await vi.advanceTimersByTimeAsync(0);
            expect(controller.state.snapshot.imageDataUrl).toBe("frame1");
            await controller.act("tap", { x: 0.5, y: 0.5 });
            expect(controller.state.snapshot.imageDataUrl).toBe("frame1");
            await vi.advanceTimersByTimeAsync(100);
            expect(controller.state.snapshot.imageDataUrl).toBe("frame2");
            controller.dispose();
            await vi.advanceTimersByTimeAsync(1000);
            expect(client.readComputerTargetFrame).toHaveBeenCalledTimes(2);
            expect(client.stopComputerTargetSession).toHaveBeenCalledWith("live");
        } finally {
            vi.useRealTimers();
        }
    });

    it("reconnects the live screen under the new generation after takeover", async () => {
        const client = api();
        client.startComputerTargetSession = vi.fn().mockImplementation(async (targetId, controlGeneration) => ({
            success: true,
            data: { id: `live-${controlGeneration}`, targetId, controlGeneration, live: true },
        }));
        client.stopComputerTargetSession = vi.fn().mockResolvedValue({ success: true });
        client.readComputerTargetFrame = vi.fn().mockImplementation(async (sessionId) => ({
            success: true,
            data: { sessionId, sequence: 1, imageDataUrl: sessionId, capturedAt: 1 },
        }));
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        await controller.connect();
        await controller.act("takeover");
        expect(client.stopComputerTargetSession).toHaveBeenCalledWith("live-2");
        expect(client.startComputerTargetSession).toHaveBeenLastCalledWith("one", 3);
        expect(controller.state.session.controlGeneration).toBe(3);
        expect(controller.state.targets[0].automationPaused).toBe(true);
        controller.dispose();
    });

    it("stops a session that connects after the user switches devices", async () => {
        const client = api();
        vi.mocked(client.listComputerTargets).mockResolvedValue({
            success: true,
            data: [Target, { ...Target, id: "two" }],
        });
        let finish: (result: unknown) => void;
        client.startComputerTargetSession = vi.fn().mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        client.stopComputerTargetSession = vi.fn().mockResolvedValue({ success: true });
        client.readComputerTargetFrame = vi.fn();
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        const pending = controller.connect();
        await Promise.resolve();
        controller.select("two");
        finish({ success: true, data: { id: "stale", targetId: "one", controlGeneration: 2, live: true } });
        await pending;
        expect(controller.state.session).toBeUndefined();
        expect(client.stopComputerTargetSession).toHaveBeenCalledWith("stale");
        expect(client.readComputerTargetFrame).not.toHaveBeenCalled();
    });

    it("discards late frames after disconnect", async () => {
        const client = api();
        client.startComputerTargetSession = vi.fn().mockResolvedValue({
            success: true,
            data: { id: "live", targetId: "one", controlGeneration: 2, live: true },
        });
        client.stopComputerTargetSession = vi.fn().mockResolvedValue({ success: true });
        let finish: (result: unknown) => void;
        client.readComputerTargetFrame = vi.fn().mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                })
        );
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        await controller.connect();
        controller.disconnect();
        finish({ success: true, data: { sessionId: "live", sequence: 1, imageDataUrl: "stale", capturedAt: 1 } });
        await Promise.resolve();
        expect(controller.state.snapshot).toBeUndefined();
        expect(controller.state.session).toBeUndefined();
    });

    it("displays adapter errors and releases busy state", async () => {
        const client = api();
        vi.mocked(client.performComputerTargetAction).mockResolvedValue({
            success: false,
            error: { code: "unavailable", message: "Install Xcode" },
        });
        const controller = new ComputersController(client, vi.fn());
        await controller.refresh();
        await controller.act("boot");
        expect(controller.state.error).toBe("Install Xcode");
        expect(controller.state.busy).toBe(false);
    });

    it("does not publish late discovery after disposal", async () => {
        const client = api();
        const changed = vi.fn();
        const controller = new ComputersController(client, changed);
        const pending = controller.refresh();
        controller.dispose();
        await pending;
        expect(changed).toHaveBeenCalledTimes(1);
    });
});

it("queues rapid device input instead of dropping it while an earlier input is running", async () => {
    const client = api();
    let release: () => void;
    const blocked = new Promise<void>((resolve) => {
        release = resolve;
    });
    vi.mocked(client.performComputerTargetAction).mockImplementationOnce(async () => {
        await blocked;
        return { success: true, data: { target: Target } };
    });
    const controller = new ComputersController(client, vi.fn());
    await controller.refresh();
    const first = controller.act("type", { text: "hello" });
    await Promise.resolve();
    expect(controller.state.busy).toBe(true);
    const second = controller.act("key", { key: "Enter" });
    expect(client.performComputerTargetAction).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(vi.mocked(client.performComputerTargetAction).mock.calls.map(([input]) => input.action)).toEqual([
        "type",
        "key",
    ]);
});
