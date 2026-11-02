// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";

type DeviceJob = { targetId: string; expectedGeneration: number; assignee: string };
type Item = {
    targetId: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    result?: unknown;
    error?: string;
};
type Batch = {
    id: string;
    requester: string;
    status: "running" | "completed" | "cancelled";
    createdAt: number;
    finishedAt?: number;
    cancelled: boolean;
    items: Item[];
};

export class DeviceFarmBatches {
    private batches = new Map<string, Batch>();
    constructor(private assign: (job: DeviceJob, caller: string) => Promise<unknown>) {}

    start(devices: DeviceJob[], concurrency: number, requester: string) {
        if (!requester) throw new Error("An authenticated caller is required.");
        if (
            !Array.isArray(devices) ||
            !devices.length ||
            devices.length > 64 ||
            new Set(devices.map((item) => item.targetId)).size !== devices.length
        )
            throw new Error("Choose 1–64 unique devices.");
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
            throw new Error("Concurrency must be 1–4.");
        for (const [id, batch] of this.batches) {
            if (batch.finishedAt && Date.now() - batch.finishedAt > 3600000) this.batches.delete(id);
        }
        if (this.batches.size >= 100) throw new Error("Batch history is full. Wait for completed batches to expire.");
        if ([...this.batches.values()].filter((batch) => batch.status === "running").length >= 4)
            throw new Error("Four batches are already running.");
        const batch: Batch = {
            id: randomUUID(),
            requester,
            status: "running",
            createdAt: Date.now(),
            cancelled: false,
            items: devices.map(({ targetId }) => ({ targetId, status: "queued" })),
        };
        this.batches.set(batch.id, batch);
        let cursor = 0;
        const worker = async () => {
            while (cursor < devices.length && !batch.cancelled) {
                const index = cursor++;
                const item = batch.items[index];
                item.status = "running";
                try {
                    item.result = await this.assign(devices[index], requester);
                    item.status = "succeeded";
                } catch (error) {
                    item.status = "failed";
                    item.error = error instanceof Error ? error.message : "Device assignment failed.";
                }
            }
        };
        void Promise.all(Array.from({ length: Math.min(concurrency, devices.length) }, worker)).finally(() => {
            batch.status = batch.cancelled ? "cancelled" : "completed";
            batch.finishedAt = Date.now();
        });
        return this.status(batch.id, requester);
    }

    status(id: string, requester: string) {
        const batch = this.batches.get(id);
        if (!requester || !batch || batch.requester !== requester) throw new Error("Batch not found for this caller.");
        const { requester: _requester, cancelled: _cancelled, ...snapshot } = batch;
        return structuredClone(snapshot);
    }

    cancel(id: string, requester: string) {
        this.status(id, requester);
        const batch = this.batches.get(id);
        if (batch.status !== "running") return this.status(id, requester);
        batch.cancelled = true;
        for (const item of batch.items) if (item.status === "queued") item.status = "cancelled";
        return {
            ...this.status(id, requester),
            cancellationRequested: true,
            note: "Queued launches are cancelled. In-flight boots finish and report their outcome; already assigned devices remain available.",
        };
    }
}
