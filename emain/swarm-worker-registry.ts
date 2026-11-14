// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { normalizeToolResult } from "../mcp-kron-term/src/tool-execution";
import type { HermesSurfaceContext } from "./hermes-runtime";

type Worker = {
    context: HermesSurfaceContext;
    controller: AbortController;
    pending: Set<Promise<unknown>>;
    evidence: string[];
    uncertain: boolean;
    operations: number;
    mutationsInFlight: number;
    lastMutation: number;
    lastObservation: number;
    exclusive: boolean;
};

const Workers = new Map<string, Worker>();
const PendingAttempts = new Map<string, Worker>();
const RetiredIdentityBytes = 256 * 1024;
const RetiredIdentities = new Map<string, Uint8Array>();
const ObservationTools = new Set([
    "browser_get_html",
    "device_screenshot",
    "linux_desktop_screenshot",
    "widget_element_at",
    "widget_find",
    "widget_get_state",
    "widget_get_value",
    "widget_inspect",
    "widget_screenshot",
    "widget_screenshot_annotated",
    "widget_snapshot",
    "widget_wait_for",
]);

export function isSwarmObservation(name: string, args: Record<string, unknown>): boolean {
    return (
        ObservationTools.has(name) ||
        (name === "sandbox_vm_browser" && ["snapshot", "read", "text", "state"].includes(String(args.action))) ||
        (name === "sandbox_vm_files" && args.action === "read") ||
        (name === "sandbox_vm_desktop" && args.action === "screenshot")
    );
}

export function swarmToolMutates(name: string, args: Record<string, unknown>, readOnlyHint?: unknown): boolean {
    if (isSwarmObservation(name, args)) return false;
    if (name === "sandbox_vm_status" || (name === "sandbox_vm_files" && args.action === "list")) return false;
    return readOnlyHint !== true;
}

function reportsUncertain(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const failure = value as { uncertain?: boolean; outcome?: string };
    return failure.uncertain === true || failure.outcome === "uncertain";
}

function uncertainOutcome(value: any): boolean {
    if (
        reportsUncertain(value?.failure) ||
        reportsUncertain(value?._meta?.failure) ||
        reportsUncertain(value?.structuredContent?.failure)
    )
        return true;
    if (!value?.isError || !Array.isArray(value.content)) return false;
    return value.content.some((item) => {
        if (item?.type !== "text" || typeof item.text !== "string") return false;
        try {
            const failure = JSON.parse(item.text);
            return reportsUncertain(failure) || reportsUncertain(failure?.failure);
        } catch {
            return false;
        }
    });
}

function identityBits(id: string): number[] {
    const hash = createHash("sha256").update(id).digest();
    return [0, 4, 8, 12].map((offset) => hash.readUInt32LE(offset) % (RetiredIdentityBytes * 8));
}

function wasRetired(id?: string): boolean {
    if (typeof id !== "string" || !id || id.length > 256 || !RetiredIdentities.size) return false;
    const bits = identityBits(id);
    // A false positive denies only this identity. A retired worker must never fall back to parent authority.
    for (const filter of RetiredIdentities.values()) {
        if (bits.every((bit) => filter[bit >> 3] & (1 << (bit & 7)))) return true;
    }
    return false;
}

function retire(worker: Worker, id: string): void {
    if (Workers.get(id) !== worker) return;
    Workers.delete(id);
    const caller = worker.context.nativeCallerId;
    const filter = RetiredIdentities.get(caller) ?? new Uint8Array(RetiredIdentityBytes);
    RetiredIdentities.set(caller, filter);
    for (const bit of identityBits(id)) filter[bit >> 3] |= 1 << (bit & 7);
}

export function revokeSwarmCaller(caller: string): void {
    if (!caller) return;
    for (const [id, worker] of Workers) {
        if (worker.context.nativeCallerId !== caller) continue;
        Workers.delete(id);
        worker.controller.abort();
    }
    RetiredIdentities.delete(caller);
}

export function hasUnsettledSwarmAttempt(attemptId: string): boolean {
    return PendingAttempts.has(attemptId);
}

function trackSettlement(worker: Worker, operation: Promise<unknown>, mutating: boolean): void {
    if (worker.pending.has(operation)) return;
    worker.pending.add(operation);
    const attemptId = worker.context.swarmAttemptId;
    if (attemptId) PendingAttempts.set(attemptId, worker);
    const settle = () => {
        worker.pending.delete(operation);
        if (!worker.pending.size && PendingAttempts.get(attemptId) === worker) PendingAttempts.delete(attemptId);
    };
    void operation.then(
        (result) => {
            settle();
            if (mutating && uncertainOutcome(result)) worker.uncertain = true;
        },
        () => {
            settle();
            if (mutating) worker.uncertain = true;
        }
    );
}

export function registerSwarmWorker(ids: string[], context: HermesSurfaceContext) {
    const identities = [...new Set(ids)];
    if (
        !context?.tabId ||
        !context.workspaceId ||
        !context.swarmRunId ||
        !identities.length ||
        identities.some((id) => typeof id !== "string" || !id || id.length > 256 || Workers.has(id) || wasRetired(id)) ||
        Workers.size + identities.length > 4096
    ) {
        throw new Error("Swarm worker identity is unavailable.");
    }
    const worker: Worker = {
        context: { ...structuredClone(context), swarmSessionId: identities[0] },
        controller: new AbortController(),
        pending: new Set(),
        evidence: [],
        uncertain: false,
        operations: 0,
        mutationsInFlight: 0,
        lastMutation: 0,
        lastObservation: 0,
        exclusive: false,
    };
    for (const id of identities) Workers.set(id, worker);
    return {
        revoke() {
            // A delayed request must keep its restricted identity for the life of the shared bearer.
            for (const id of identities) retire(worker, id);
            worker.controller.abort();
        },
        evidence: () => [...worker.evidence],
        observed: () => worker.evidence.length > 0 && !worker.uncertain,
        uncertain: () => worker.uncertain,
        async drain(timeoutMs = 10000) {
            const deadline = Date.now() + timeoutMs;
            while (worker.pending.size) {
                const remaining = deadline - Date.now();
                if (remaining <= 0) throw new Error("Swarm tool effects are still settling; target remains reserved.");
                let timer: ReturnType<typeof setTimeout>;
                try {
                    await Promise.race([
                        Promise.allSettled([...worker.pending]),
                        new Promise<never>((_, reject) => {
                            timer = setTimeout(
                                () =>
                                    reject(
                                        new Error("Swarm tool effects are uncertain; inspect the target before reuse.")
                                    ),
                                remaining
                            );
                        }),
                    ]);
                } finally {
                    clearTimeout(timer);
                }
            }
        },
    };
}

export function resolveSwarmWorker(fallback: HermesSurfaceContext, sessionId?: string, taskId?: string) {
    if (wasRetired(sessionId) || wasRetired(taskId)) throw new Error("This swarm worker's authority has ended.");
    const session = Workers.get(sessionId);
    const task = Workers.get(taskId);
    if (session && task && session !== task) throw new Error("Swarm worker identities do not match.");
    const worker = session ?? task;
    if (!worker) return undefined;
    if (worker.context.nativeCallerId && worker.context.nativeCallerId !== fallback?.nativeCallerId) {
        throw new Error("Swarm worker belongs to another caller.");
    }
    return {
        context: {
            ...structuredClone(worker.context),
            agentRuntime: "hermes" as const,
            toolSessionId: session ? sessionId : taskId,
        },
        signal: worker.controller.signal,
        async runExclusive<T>(start: () => Promise<T>): Promise<T> {
            worker.controller.signal.throwIfAborted();
            if (worker.uncertain)
                throw new Error("A previous tool effect is uncertain; this worker cannot issue more actions.");
            if (worker.exclusive || worker.pending.size) throw new Error("The previous swarm tool is still settling.");
            worker.exclusive = true;
            try {
                return await start();
            } finally {
                worker.exclusive = false;
            }
        },
        trackSettlement(operation: Promise<unknown>, mutating: boolean) {
            trackSettlement(worker, operation, mutating);
        },
        trackOutcome<T>(
            name: string,
            args: Record<string, unknown>,
            mutating: boolean,
            operation: Promise<T>
        ): Promise<T> {
            const ordinal = ++worker.operations;
            if (mutating) {
                worker.lastMutation = ordinal;
                worker.mutationsInFlight++;
                worker.evidence = [];
            }
            const observe = !mutating && worker.mutationsInFlight === 0 && isSwarmObservation(name, args);
            function recordObservation(valid: boolean) {
                if (!observe || ordinal < worker.lastMutation || ordinal < worker.lastObservation) return;
                worker.lastObservation = ordinal;
                if (!valid) {
                    worker.evidence = [];
                    return;
                }
                const attempt = worker.context.swarmAttemptId ?? worker.context.swarmRunId;
                worker.evidence = [
                    ...worker.evidence.slice(-15),
                    `${name} observed ${worker.context.swarmTarget?.id ?? "target"} (${attempt}:${ordinal})`,
                ];
            }
            const recorded = operation.then(
                (result) => {
                    if (mutating) worker.mutationsInFlight--;
                    try {
                        const value = normalizeToolResult(result);
                        if (mutating && (uncertainOutcome(value) || value?.isError)) worker.uncertain = true;
                        recordObservation(
                            value != null &&
                                typeof value === "object" &&
                                !value.isError &&
                                (value.content?.length > 0 || value.structuredContent != null || value.success === true)
                        );
                    } catch {
                        if (mutating) worker.uncertain = true;
                        recordObservation(false);
                    }
                    return result;
                },
                (error) => {
                    if (mutating) worker.mutationsInFlight--;
                    recordObservation(false);
                    throw error;
                }
            );
            trackSettlement(worker, recorded, mutating);
            return recorded;
        },
    };
}
