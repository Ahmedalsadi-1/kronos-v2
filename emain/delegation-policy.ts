// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import type { LinuxDesktop } from "../frontend/types/linux-desktops";
import { sandboxComputerForTab } from "./computer-access-policy";
import type { HermesSurfaceContext } from "./hermes-runtime";

export type DelegationScope = "sandbox" | "widgets" | "inherit";
type Lease = {
    context: HermesSurfaceContext;
    scope: DelegationScope;
    computerId?: string;
    generation?: number;
    expiresAt: number;
    remaining: number;
    completed: Set<string>;
};
export class DelegationPolicy {
    private leases = new Map<string, Lease>();
    constructor(
        private inspect: (id: string) => Promise<LinuxDesktop>,
        private now = Date.now
    ) {}
    private prune() {
        for (const [token, lease] of this.leases) if (lease.expiresAt <= this.now()) this.leases.delete(token);
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
        if (effective === "sandbox" && tasks !== 1)
            throw new Error("Delegate one sandbox task at a time to avoid simultaneous input on one computer.");
        const computerId = context.sandboxComputerId;
        let desktop: LinuxDesktop;
        if (effective === "sandbox") {
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
                        lease.scope === "sandbox" &&
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
        this.leases.set(token, {
            context: structuredClone(context),
            scope: effective,
            computerId,
            generation: desktop?.controlGeneration,
            expiresAt: this.now() + 15 * 60_000,
            remaining: tasks,
            completed: new Set(),
        });
        return {
            token,
            scope: effective,
            desktopId: computerId,
            expiresAt: this.leases.get(token).expiresAt,
            tools: available,
        };
    }
    async resolve(token: string, callerId?: string): Promise<HermesSurfaceContext> {
        this.prune();
        const lease = this.leases.get(token);
        if (!lease || lease.context.nativeCallerId !== callerId)
            throw new Error(
                "Delegated job scope expired or was revoked. Ask the parent to delegate again; do not use host tools."
            );
        if (lease.computerId && sandboxComputerForTab(lease.context.tabId) !== lease.computerId)
            throw new Error("The parent changed or disabled its computer. This delegated job is no longer authorized.");
        if (lease.generation != null) {
            const desktop = await this.inspect(lease.computerId);
            if (desktop?.controlGeneration !== lease.generation || desktop.controlOwner !== "agent")
                throw new Error("Sandbox control changed after delegation. This worker must stop.");
        }
        return { ...lease.context, delegationScope: lease.scope };
    }
    finish(token: string, childId?: string, callerId?: string) {
        const lease = this.leases.get(token);
        if (!lease || lease.context.nativeCallerId !== callerId) return;
        if (!childId) {
            this.leases.delete(token);
            return;
        }
        if (lease.completed.has(childId)) return;
        lease.completed.add(childId);
        if (--lease.remaining <= 0) this.leases.delete(token);
    }
}
