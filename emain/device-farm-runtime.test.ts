import { describe, expect, it, vi } from "vitest";
import { DeviceFarmRuntime } from "./device-farm-runtime";

function fixture() {
    const target = { id: "android-avd:pixel", status: "shutdown", automationPaused: false, controlGeneration: 2 };
    const runtime = {
        list: vi.fn(async () => [target]),
        pickElement: vi.fn(async () => ({
            role: "Button",
            name: "Continue",
            frame: { x: 0.2, y: 0.3, width: 0.2, height: 0.1 },
        })),
        performAgent: vi.fn(async () => {
            target.status = "booted";
        }),
    };
    return {
        target,
        runtime,
        farm: new DeviceFarmRuntime(runtime as any),
        args: { targetId: target.id, expectedGeneration: 2, assignee: "bot-one" },
    };
}
describe("device farm assignments", () => {
    it("boots selected devices, assigns them, and fences other callers", async () => {
        const { farm, runtime, args } = fixture();
        const result = await farm.manage("device_batch_boot", { devices: [args] }, "owner");
        expect(result.results[0].assignment.assignee).toBe("bot-one");
        expect(runtime.performAgent).toHaveBeenCalledOnce();
        await expect(farm.authorize(args.targetId, "bot-two")).rejects.toThrow("another agent");
        await expect(farm.authorize(args.targetId, "bot-one")).resolves.toBeUndefined();
        await expect(farm.manage("device_release", args, "bot-two")).rejects.toThrow("Only");
    });
    it("reports partial failures without assigning paused devices", async () => {
        const { farm, target, runtime, args } = fixture();
        target.automationPaused = true;
        const result = await farm.manage("device_batch_boot", { devices: [args] }, "owner");
        expect(result.results[0].error).toContain("paused");
        expect(runtime.performAgent).not.toHaveBeenCalled();
    });
    it("invalidates assignments when a human changes control generation", async () => {
        const { farm, target, args } = fixture();
        target.status = "booted";
        await farm.manage("device_assign", args, "owner");
        target.controlGeneration++;
        await expect(farm.authorize(args.targetId, "bot-one")).rejects.toThrow("expired");
    });
});

it("does not assign a phone after boot fails or allow anonymous reservations", async () => {
    const { farm, runtime, args } = fixture();
    await expect(farm.manage("device_assign", args, "")).rejects.toThrow("authenticated");
    runtime.performAgent.mockRejectedValueOnce(new Error("Boot failed"));
    const result = await farm.manage("device_batch_boot", { devices: [args] }, "owner");
    expect(result.results[0].error).toBe("Boot failed");
    expect(await farm.manage("device_assignments", {}, "owner")).toEqual([]);
});

it("does not reserve a device while another agent input operation is in flight", async () => {
    const { farm, target, runtime, args } = fixture();
    target.status = "booted";
    let finish: () => void;
    runtime.performAgent.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                finish = resolve;
            })
    );
    const pending = farm.perform({ targetId: target.id, action: "home", expectedGeneration: 2 }, "bot-one");
    await vi.waitFor(() => expect(runtime.performAgent).toHaveBeenCalledOnce());
    await expect(farm.manage("device_assign", args, "owner")).rejects.toThrow("in progress");
    finish();
    await pending;
    await expect(farm.manage("device_assign", args, "owner")).resolves.toMatchObject({ assignee: "bot-one" });
});

it("starts the preview only after an authorized device tool succeeds", async () => {
    const { target, runtime } = fixture();
    target.status = "booted";
    const onDeviceUsed = vi.fn();
    const farm = new DeviceFarmRuntime(runtime as any, onDeviceUsed);
    runtime.performAgent.mockRejectedValueOnce(new Error("Device offline"));
    await expect(farm.perform({ targetId: target.id, action: "screenshot" }, "owner")).rejects.toThrow("offline");
    expect(onDeviceUsed).not.toHaveBeenCalled();
    runtime.performAgent.mockResolvedValueOnce({ target } as any);
    await farm.perform({ targetId: target.id, action: "screenshot" }, "owner");
    expect(onDeviceUsed).toHaveBeenCalledExactlyOnceWith(target);
});

it("binds observed actions to a fresh single-use image and returns an after-image", async () => {
    const { farm, target, runtime, args } = fixture();
    target.status = "booted";
    runtime.performAgent.mockImplementation(
        async () => ({ target, imageDataUrl: "data:image/png;base64,aGVsbG8=" }) as any
    );
    const observation = await farm.manage("device_observe", { targetId: target.id }, "bot-one");
    const step = {
        targetId: target.id,
        expectedGeneration: 2,
        action: "home",
        observationId: observation.observationId,
    };
    await expect(farm.manage("device_step", step, "other-bot")).rejects.toThrow("another caller");
    const result = await farm.manage("device_step", step, "bot-one");
    expect(result.actionCompleted).toBe(true);
    expect(result.imageDataUrl).toContain("data:image/png");
    expect(runtime.performAgent).toHaveBeenCalledTimes(3);
    await expect(farm.manage("device_step", step, "bot-one")).rejects.toThrow("consumed");
});

it("inspects a point using captured screen dimensions without consuming the observation", async () => {
    const { farm, target, runtime } = fixture();
    target.status = "booted";
    const pngHeader = Buffer.from("89504e470d0a1a0a0000000d494844520000043800000960", "hex");
    const imageDataUrl = `data:image/png;base64,${pngHeader.toString("base64")}`;
    runtime.performAgent.mockImplementation(async () => ({ target, imageDataUrl }) as any);
    const observation = await farm.manage("device_observe", { targetId: target.id }, "homechat");
    const args = {
        targetId: target.id,
        observationId: observation.observationId,
        expectedGeneration: target.controlGeneration,
        x: 0.3,
        y: 0.35,
    };

    await expect(farm.manage("device_pick_element", args, "other")).rejects.toThrow("another caller");
    await expect(farm.manage("device_pick_element", args, "homechat")).resolves.toMatchObject({
        element: { name: "Continue" },
    });
    expect(runtime.pickElement).toHaveBeenCalledExactlyOnceWith({
        targetId: target.id,
        expectedGeneration: 2,
        x: 0.3,
        y: 0.35,
        width: 1080,
        height: 2400,
    });
    await expect(farm.manage("device_step", { ...args, action: "tap" }, "homechat")).resolves.toMatchObject({
        actionCompleted: true,
        imageDataUrl,
    });
});

it("rejects expired observations and never replays an action after failed verification", async () => {
    const { farm, target, runtime } = fixture();
    const capture = { target, imageDataUrl: "data:image/png;base64,aGVsbG8=" };
    runtime.performAgent.mockImplementation(async () => capture as any);
    const observation = await farm.manage("device_observe", { targetId: target.id }, "bot-one");
    runtime.performAgent.mockResolvedValueOnce(capture as any).mockRejectedValueOnce(new Error("Capture unavailable"));
    const result = await farm.manage(
        "device_step",
        { targetId: target.id, expectedGeneration: 2, action: "home", observationId: observation.observationId },
        "bot-one"
    );
    expect(result).toMatchObject({ actionCompleted: true, verificationRequired: true });
    expect(runtime.performAgent).toHaveBeenCalledTimes(3);
    const next = await farm.manage("device_observe", { targetId: target.id }, "bot-one");
    const now = vi.spyOn(Date, "now").mockReturnValue(next.expiresAt + 1);
    try {
        await expect(
            farm.manage(
                "device_step",
                { targetId: target.id, expectedGeneration: 2, action: "home", observationId: next.observationId },
                "bot-one"
            )
        ).rejects.toThrow("stale");
    } finally {
        now.mockRestore();
    }
});

it("swarm callers cannot use an unassigned device", async () => {
    const runtime = new DeviceFarmRuntime({ list: async () => [] } as any);
    await expect(runtime.authorize("device", "caller", true)).rejects.toThrow("Assign this device");
    await expect(runtime.authorize("device", "caller")).resolves.toBeUndefined();
});
