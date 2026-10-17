// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { ComputerTarget, ComputerTargetFrame, ComputerTargetSession } from "../frontend/types/computer-targets";
import { LocalVmLeasePool } from "./device-simulator/upstream/openmaus/local-vm-lease";

type LiveRuntime = {
    attachLive(targetId: string, generation: number): Promise<ComputerTarget>;
    liveFrame(targetId: string): Promise<{ imageDataUrl: string; capturedAt: number }>;
    detachLive(targetId: string): Promise<void>;
};
type SessionRecord = {
    session: ComputerTargetSession;
    owner: number;
    touchedAt: number;
    sequence: number;
    reading: boolean;
};
const LeaseMs = 180_000;
const ImagePattern = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export class ComputerTargetSessions {
    private records = new Map<string, SessionRecord>();
    private leases = new LocalVmLeasePool(LeaseMs);
    private closedOwners = new Set<number>();
    private closing = new Set<string>();
    private sweepTimer: ReturnType<typeof setInterval>;

    constructor(private runtime: LiveRuntime) {
        this.sweepTimer = setInterval(() => {
            for (const [id, record] of this.records) {
                if (Date.now() - record.touchedAt > LeaseMs) void this.stop(id, record.owner).catch(() => {});
            }
        }, 10_000);
        this.sweepTimer.unref?.();
    }

    async start(targetId: unknown, generation: unknown, owner: number): Promise<ComputerTargetSession> {
        if (
            typeof targetId !== "string" ||
            targetId.length > 160 ||
            !Number.isSafeInteger(generation) ||
            Number(generation) < 0
        )
            throw new Error("Invalid device connection.");
        const id = randomUUID();
        const session: ComputerTargetSession = { id, targetId, controlGeneration: Number(generation), live: true };
        const record = { session, owner, touchedAt: Date.now(), sequence: 0, reading: true };
        const lease = this.leases.forTarget(targetId);
        if (!lease.claim(id, id, (candidate) => this.records.has(candidate) || this.closing.has(candidate)))
            throw new Error("This device is already open in another window. Disconnect it there first.");
        this.records.set(id, record);
        try {
            await this.runtime.attachLive(targetId, Number(generation));
            if (this.closedOwners.has(owner) || !this.records.has(id)) throw new Error("Device window closed.");
            record.reading = false;
            record.touchedAt = Date.now();
            return session;
        } catch (error) {
            this.records.delete(id);
            lease.release(id);
            await this.runtime.detachLive(targetId).catch(() => {});
            throw error;
        }
    }

    private owned(id: unknown, owner: number): SessionRecord {
        const record = typeof id === "string" ? this.records.get(id) : undefined;
        if (!record || record.owner !== owner) throw new Error("Device connection is unavailable for this window.");
        return record;
    }

    async frame(id: unknown, owner: number): Promise<ComputerTargetFrame> {
        const record = this.owned(id, owner);
        if (record.reading) throw new Error("A device frame is already being read.");
        record.reading = true;
        record.touchedAt = Date.now();
        this.leases.forTarget(record.session.targetId).touch(record.session.id);
        try {
            const frame = await this.runtime.liveFrame(record.session.targetId);
            if (this.records.get(record.session.id) !== record) throw new Error("Device connection closed.");
            if (
                typeof frame.imageDataUrl !== "string" ||
                frame.imageDataUrl.length > 28 * 1024 * 1024 ||
                !ImagePattern.test(frame.imageDataUrl)
            )
                throw new Error("Device returned an invalid live frame.");
            return { ...frame, sessionId: record.session.id, sequence: ++record.sequence };
        } finally {
            record.reading = false;
        }
    }

    async stop(id: unknown, owner: number): Promise<void> {
        const record = this.owned(id, owner);
        this.closing.add(record.session.id);
        this.records.delete(record.session.id);
        try {
            await this.runtime.detachLive(record.session.targetId);
        } finally {
            this.closing.delete(record.session.id);
            this.leases.forTarget(record.session.targetId).release(record.session.id);
        }
    }

    async closeOwner(owner: number): Promise<void> {
        this.closedOwners.add(owner);
        await Promise.allSettled(
            [...this.records.values()]
                .filter((record) => record.owner === owner)
                .map((record) => this.stop(record.session.id, owner))
        );
    }

    async dispose(): Promise<void> {
        clearInterval(this.sweepTimer);
        await Promise.allSettled(
            [...this.records.values()].map((record) => this.stop(record.session.id, record.owner))
        );
    }
}
