import { describe, expect, it, vi } from "vitest";
import { DeviceFarmBatches } from "./device-farm-batches";

const devices = Array.from({ length: 5 }, (_, index) => ({
    targetId: `phone-${index}`,
    expectedGeneration: 0,
    assignee: `bot-${index}`,
}));

describe("fleet boot queues", () => {
    it("bounds concurrent starts and cancels queued work without hiding in-flight results", async () => {
        const releases: (() => void)[] = [];
        const assign = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
        const batches = new DeviceFarmBatches(assign);
        const job = batches.start(devices, 2, "parent");
        expect(assign).toHaveBeenCalledTimes(2);
        expect(() => batches.status(job.id, "stranger")).toThrow("not found");
        const cancelled = batches.cancel(job.id, "parent");
        expect(cancelled.items.filter((item) => item.status === "cancelled")).toHaveLength(3);
        releases.forEach((release) => release());
        await vi.waitFor(() => expect(batches.status(job.id, "parent").status).toBe("cancelled"));
        expect(assign).toHaveBeenCalledTimes(2);
        expect(batches.status(job.id, "parent").items.filter((item) => item.status === "succeeded")).toHaveLength(2);
    });
    it("retains per-device failures without replaying side effects", async () => {
        const assign = vi.fn(async (device) => {
            if (device.targetId === "phone-1") throw new Error("Runtime missing");
            return { assigned: device.assignee };
        });
        const batches = new DeviceFarmBatches(assign);
        const job = batches.start(devices, 2, "parent");
        await vi.waitFor(() => expect(batches.status(job.id, "parent").status).toBe("completed"));
        expect(batches.status(job.id, "parent").items[1]).toMatchObject({ status: "failed", error: "Runtime missing" });
        expect(assign).toHaveBeenCalledTimes(5);
        expect(() => batches.start([devices[0], devices[0]], 2, "parent")).toThrow("unique");
    });
});
