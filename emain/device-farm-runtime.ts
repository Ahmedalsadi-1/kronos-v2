// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { ComputerTargetAction } from "../frontend/types/computer-targets";
import type { ComputerTargetsRuntime } from "./computer-targets-runtime";
import { DeviceFarmBatches } from "./device-farm-batches";

type Assignment = { targetId: string; assignee: string; requester: string; controlGeneration: number };

export class DeviceFarmRuntime {
    private revisions = new Map<string, number>();
    private batches = new DeviceFarmBatches((job, caller) => this.assign(job, caller, true));
    private observations = new Map<
        string,
        { targetId: string; caller: string; generation: number; expiresAt: number; revision: number }
    >();
    private assignments = new Map<string, Assignment>();
    private busy = new Set<string>();
    constructor(private computers: ComputerTargetsRuntime) {}

    async authorize(targetId: string, caller: string, requireAssigned = false) {
        const assignment = this.assignments.get(targetId);
        if (!assignment) {
            if (requireAssigned) throw new Error("Assign this device to the parent agent before starting a swarm.");
            return;
        }
        const target = (await this.computers.list()).find((item) => item.id === targetId);
        if (!target || target.automationPaused || target.controlGeneration !== assignment.controlGeneration) {
            this.assignments.delete(targetId);
            throw new Error("Device assignment expired after a control change. Observe the device again.");
        }
        if (assignment.assignee !== caller) throw new Error("Device is assigned to another agent.");
    }

    async perform(action: ComputerTargetAction, caller: string, requireAssigned = false) {
        if (this.busy.has(action.targetId)) throw new Error("Device operation or assignment is already in progress.");
        this.busy.add(action.targetId);
        try {
            await this.authorize(action.targetId, caller, requireAssigned);
            if (action.action !== "screenshot") {
                this.revisions.set(action.targetId, (this.revisions.get(action.targetId) ?? 0) + 1);
                for (const [id, observation] of this.observations)
                    if (observation.targetId === action.targetId) this.observations.delete(id);
            }
            return await this.computers.performAgent(action);
        } finally {
            this.busy.delete(action.targetId);
        }
    }

    async manage(name: string, args: any, requester: string): Promise<any> {
        if (!requester) throw new Error("Device assignments require an authenticated native caller identity.");
        if (name === "device_batch_start") return this.batches.start(args.devices, args.concurrency ?? 2, requester);
        if (name === "device_batch_status") return this.batches.status(args.batchId, requester);
        if (name === "device_batch_cancel") return this.batches.cancel(args.batchId, requester);
        if (name === "device_observe") {
            const revision = this.revisions.get(args.targetId) ?? 0;
            const snapshot = await this.perform({ targetId: args.targetId, action: "screenshot" }, requester);
            for (const [id, observation] of this.observations)
                if (observation.expiresAt <= Date.now()) this.observations.delete(id);
            if (this.observations.size >= 256)
                throw new Error("Too many unconsumed observations. Wait for them to expire.");
            if (revision !== (this.revisions.get(args.targetId) ?? 0))
                throw new Error("Device changed while capturing. Observe again.");
            if (!snapshot.imageDataUrl) throw new Error("Device did not return an image.");
            const observationId = randomUUID();
            const expiresAt = Date.now() + 30000;
            this.observations.set(observationId, {
                targetId: args.targetId,
                caller: requester,
                generation: snapshot.target.controlGeneration,
                expiresAt,
                revision,
            });
            return { ...snapshot, observationId, expiresAt };
        }
        if (name === "device_step") {
            if (!["tap", "type", "key", "back", "home", "swipe", "rotate"].includes(args.action))
                throw new Error("Unsupported observed input action.");
            const observation = this.observations.get(args.observationId);
            if (
                !observation ||
                observation.caller !== requester ||
                observation.targetId !== args.targetId ||
                observation.expiresAt <= Date.now() ||
                observation.generation !== args.expectedGeneration ||
                observation.revision !== (this.revisions.get(args.targetId) ?? 0)
            )
                throw new Error(
                    "Observe this device again. The observation is stale, consumed, or belongs to another caller."
                );
            this.observations.delete(args.observationId);
            const result = await this.perform(args, requester);
            try {
                const snapshot = await this.perform({ targetId: args.targetId, action: "screenshot" }, requester);
                return {
                    ...snapshot,
                    actionCompleted: true,
                    verification:
                        "Inspect the returned image to verify the intended result; no semantic success is inferred.",
                };
            } catch (error) {
                return {
                    target: result.target,
                    actionCompleted: true,
                    verificationRequired: true,
                    observationError: error instanceof Error ? error.message : "Capture failed",
                    note: "Do not retry the action automatically; observe first.",
                };
            }
        }
        if (name === "device_identity") return { nativeCallerId: requester };
        if (name === "device_assignments") {
            const targets = await this.computers.list();
            for (const [id, assignment] of this.assignments) {
                const target = targets.find((item) => item.id === id);
                if (
                    !target ||
                    target.automationPaused ||
                    !["booted", "connected"].includes(target.status) ||
                    target.controlGeneration !== assignment.controlGeneration
                )
                    this.assignments.delete(id);
            }
            return [...this.assignments.values()];
        }
        if (name === "device_release") {
            if (this.busy.has(args.targetId))
                throw new Error("Wait for the pending device assignment to finish before releasing it.");
            const current = this.assignments.get(args.targetId);
            if (current && current.requester !== requester && current.assignee !== requester)
                throw new Error("Only the assigning caller or assigned agent can release this device.");
            this.assignments.delete(args.targetId);
            return { released: args.targetId };
        }
        if (name === "device_batch_boot") {
            if (
                !Array.isArray(args.devices) ||
                args.devices.length < 1 ||
                args.devices.length > 8 ||
                new Set(args.devices.map((item: any) => item.targetId)).size !== args.devices.length
            )
                throw new Error("Select one to eight unique devices.");
            const results = [];
            for (const item of args.devices) {
                try {
                    results.push({ targetId: item.targetId, assignment: await this.assign(item, requester, true) });
                } catch (error) {
                    results.push({ targetId: item.targetId, error: (error as Error).message });
                }
            }
            return { results };
        }
        return this.assign(args, requester, false);
    }

    private async assign(args: any, requester: string, boot: boolean) {
        if (this.busy.has(args.targetId)) throw new Error("Device assignment is already in progress.");
        this.busy.add(args.targetId);
        try {
            const existing = this.assignments.get(args.targetId);
            if (existing && (existing.requester !== requester || existing.assignee !== args.assignee))
                throw new Error("Release the existing device assignment first.");
            let target = (await this.computers.list()).find((item) => item.id === args.targetId);
            if (!target || target.automationPaused || target.controlGeneration !== args.expectedGeneration)
                throw new Error("Device unavailable, paused, or generation changed. Refresh device_list.");
            if (boot && target.status === "shutdown") {
                await this.computers.performAgent({
                    targetId: target.id,
                    action: "boot",
                    expectedGeneration: target.controlGeneration,
                });
                target = (await this.computers.list()).find((item) => item.id === args.targetId);
            }
            if (
                !target ||
                !["booted", "connected"].includes(target.status) ||
                target.automationPaused ||
                target.controlGeneration !== args.expectedGeneration
            )
                throw new Error("Device is not ready; no assignment was created.");
            const assignment = {
                targetId: target.id,
                assignee: args.assignee,
                requester,
                controlGeneration: target.controlGeneration,
            };
            this.assignments.set(target.id, assignment);
            return assignment;
        } finally {
            this.busy.delete(args.targetId);
        }
    }
}
