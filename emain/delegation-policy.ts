// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import type { LinuxDesktop } from "../frontend/types/linux-desktops";
import { sandboxComputerForTab } from "./computer-access-policy";
import type { HermesSurfaceContext } from "./hermes-runtime";

export type DelegationScope = "sandbox" | "widgets" | "inherit";
export const DelegationWallTimeoutSeconds = 300;
const LeaseDurationMs = DelegationWallTimeoutSeconds * 1000;
type Worker = {
    controller: AbortController;
    pending: Set<Promise<unknown>>;
};
type Lease = {
    context: HermesSurfaceContext;
    scope: DelegationScope;
    computerId?: string;
    generation?: number;
    expiresAt: number;
    expiryTimer: NodeJS.Timeout;
    controller: AbortController;
    remaining: number;
    completed: Set<string>;
    workers: Map<string, Worker>;
    pending: Set<Promise<unknown>>;
};
export class DelegationPolicy {
    private leases = new Map<string, Lease>();
    constructor(
        private inspect: (id: string) => Promise<LinuxDesktop>,
        private now = Date.now
    ) {}
    private release(token: string, lease: Lease) {
        clearTimeout(lease.expiryTimer);
        lease.controller.abort();
        if (lease.pending.size === 0) this.leases.delete(token);
    }
    private prune() {
        for (const [token, lease] of this.leases) if (lease.expiresAt <= this.now()) this.release(token, lease);
    }
    async prepare(
        context: HermesSurfaceContext,
        scope: DelegationScope,
        tasks: number,
        required: string[] = [],
        available: string[] = []
    ) {
        this.prune();
        if (
            !context?.tabId ||
            !["sandbox", "widgets", "inherit"].includes(scope) ||
            !Number.isInteger(tasks) ||
            tasks < 1 ||
            tasks > 4
        )
            throw new Error("A registered chat, explicit job scope and 1–4 tasks are required.");
        if (this.leases.size >= 256) throw new Error("Too many active delegated jobs. Finish existing jobs first.");
        if (context.delegationScope && scope !== "inherit" && scope !== context.delegationScope)
            throw new Error("A child cannot broaden its parent's delegation scope.");
        const effective = context.delegationScope || scope;
        const controlsComputer = effective === "sandbox" || (effective === "inherit" && !!context.sandboxComputerId);
        if (controlsComputer && tasks !== 1)
            throw new Error("Delegate one sandbox task at a time to avoid simultaneous input on one computer.");
        const computerId = context.sandboxComputerId;
        let desktop: LinuxDesktop;
        if (controlsComputer) {
            if (!computerId) throw new Error("Enable Computer mode and select a sandbox before delegating this job.");
            desktop = await this.inspect(computerId);
            if (!desktop?.ready || desktop.status !== "running")
                throw new Error(
                    desktop?.problem ||
                        "Start the selected sandbox and wait for its desktop to be ready before delegating."
                );
            if (desktop.controlOwner !== "agent" || desktop.assignedAgentId !== `sandbox:${context.tabId}`)
                throw new Error("The sandbox is not reserved for this workspace. Resume Computer mode first.");
            if (
                [...this.leases.values()].some(
                    (lease) =>
                        lease.generation != null &&
                        lease.computerId === computerId &&
                        lease.generation === desktop.controlGeneration
                )
            )
                throw new Error(
                    "A delegated job already controls this sandbox. Wait for it to finish or stop it first."
                );
        }
        if (
            !Array.isArray(required) ||
            required.length > 32 ||
            required.some((name) => typeof name !== "string" || !available.includes(name))
        )
            throw new Error(
                "A required tool is unavailable in the current job scope. Inspect delegation_status and tool_search before spawning."
            );
        const token = randomBytes(32).toString("hex");
        const lease: Lease = {
            context: structuredClone(context),
            scope: effective,
            computerId,
            generation: desktop?.controlGeneration,
            expiresAt: this.now() + LeaseDurationMs,
            expiryTimer: setTimeout(() => this.release(token, lease), LeaseDurationMs).unref(),
            controller: new AbortController(),
            remaining: tasks,
            completed: new Set(),
            workers: new Map(),
            pending: new Set(),
        };
        this.leases.set(token, lease);
        return {
            token,
            scope: effective,
            desktopId: computerId,
            expiresAt: lease.expiresAt,
            tools: available,
        };
    }
    async resolve(token: string, callerId?: string, childId?: string) {
        this.prune();
        const lease = this.leases.get(token);
        if (!lease || lease.context.nativeCallerId !== callerId)
            throw new Error(
                "Delegated job scope expired or was revoked. Ask the parent to delegate again; do not use host tools."
            );
        if (
            lease.computerId &&
            sandboxComputerForTab(lease.context.tabId, lease.context.chatId || lease.context.toolSessionId) !==
                lease.computerId
        )
            throw new Error("The parent changed or disabled its computer. This delegated job is no longer authorized.");
        if (lease.generation != null) {
            const desktop = await this.inspect(lease.computerId);
            if (desktop?.controlGeneration !== lease.generation || desktop.controlOwner !== "agent")
                throw new Error("Sandbox control changed after delegation. This worker must stop.");
        }
        if (lease.controller.signal.aborted || this.leases.get(token) !== lease || lease.expiresAt <= this.now())
            throw new Error("Delegated job scope expired or was revoked.");
        const worker = childId ? this.worker(lease, childId) : undefined;
        const signal = worker ? AbortSignal.any([lease.controller.signal, worker.controller.signal]) : lease.controller.signal;
        signal.throwIfAborted();
        return {
            context: { ...lease.context, delegationScope: lease.scope },
            signal,
            track: (operation: Promise<unknown>) => {
                lease.pending.add(operation);
                worker?.pending.add(operation);
                const settled = () => {
                    lease.pending.delete(operation);
                    worker?.pending.delete(operation);
                    if (lease.controller.signal.aborted && lease.pending.size === 0) this.leases.delete(token);
                };
                void operation.then(settled, settled);
            },
        };
    }
    private worker(lease: Lease, childId: string): Worker {
        let worker = lease.workers.get(childId);
        if (!worker) {
            worker = { controller: new AbortController(), pending: new Set() };
            lease.workers.set(childId, worker);
        }
        return worker;
    }

    cancel(token: string, childId: string, callerId?: string): number {
        const lease = this.leases.get(token);
        if (!lease || lease.context.nativeCallerId !== callerId) return 0;
        const worker = this.worker(lease, childId);
        worker.controller.abort();
        return worker.pending.size;
    }

    finish(token: string, childId?: string, callerId?: string) {
        const lease = this.leases.get(token);
        if (!lease || lease.context.nativeCallerId !== callerId) return;
        if (!childId) {
            this.release(token, lease);
            return;
        }
        this.cancel(token, childId, callerId);
        if (lease.completed.has(childId)) return;
        lease.completed.add(childId);
        if (--lease.remaining <= 0) this.release(token, lease);
    }
    revokeCaller(callerId: string) {
        for (const [token, lease] of this.leases) {
            if (lease.context.nativeCallerId === callerId) this.release(token, lease);
        }
    }
}
