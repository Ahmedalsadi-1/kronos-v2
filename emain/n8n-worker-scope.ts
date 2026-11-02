// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { registerComputerChats } from "./computer-access-policy";
import type { HermesSurfaceContext } from "./hermes-runtime";

const Workers = new Map<string, HermesSurfaceContext>();

export function registerWorkflowWorker(ids: string[], context: HermesSurfaceContext): () => void {
    if (!context?.tabId || !context.workspaceId || ids.some((id) => !id || id.length > 256))
        throw new Error("Workflow worker scope is invalid.");
    const snapshot = structuredClone(context);
    for (const id of ids) {
        if (Workers.has(id)) throw new Error("Workflow worker already exists.");
    }
    registerComputerChats(context.tabId, ids, context.workspaceId);
    for (const id of ids) Workers.set(id, snapshot);
    return () => {
        for (const id of ids) Workers.delete(id);
    };
}

export function workflowWorkerContext(
    fallback: HermesSurfaceContext,
    sessionId?: string,
    taskId?: string
): HermesSurfaceContext {
    const session = Workers.get(sessionId);
    const task = Workers.get(taskId);
    if (session && task && session !== task) throw new Error("Workflow worker identities do not match.");
    const context = session ?? task;
    return context
        ? { ...context, agentRuntime: "hermes", nativeCallerId: fallback?.nativeCallerId, toolSessionId: sessionId }
        : fallback;
}

export function selectWorkflowWorkerTarget(workerId: string, workflowId: string): void {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(workflowId)) throw new Error("Invalid worker workflow ID.");
    for (const worker of Workers.values()) {
        if (worker.n8nWorkerId === workerId) worker.n8nWorkflowId = workflowId;
    }
}
