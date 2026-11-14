// Copyright 2026, KronOS. SPDX-License-Identifier: Apache-2.0

import { registerSwarmWorkerStop } from "@hermes/lib/subagent-surface";
import { removeQueuedSubagent, upsertSubagent } from "@hermes/store/subagents";
import { JsonRpcGatewayClient } from "../../../hermes-shared/json-rpc-gateway";
import {
    agentActivityTimeline,
    subscribeAgentActivityStream,
    type AgentActivityEvent,
} from "../../../types/agent-activity";

const WorkerStatuses = {
    pending: "queued",
    running: "running",
    succeeded: "completed",
    cancelled: "interrupted",
    blocked: "failed",
    uncertain: "failed",
    failed: "failed",
} as const;

const TerminalSummaries: Partial<Record<keyof typeof WorkerStatuses, string>> = {
    blocked: "The worker was blocked.",
    uncertain: "The worker's result could not be confirmed.",
    failed: "The worker failed.",
};

let installed = false;

export function projectSwarmActivity(activity: AgentActivityEvent): void {
    const swarm = activity.swarm;
    if (!swarm?.parentSessionId || !swarm.runId || !swarm.nodeId) return;
    const id = `${swarm.runId}:${swarm.nodeId}`;
    if (swarm.removed) {
        removeQueuedSubagent(swarm.parentSessionId, id);
        return;
    }
    if (!Object.hasOwn(WorkerStatuses, swarm.status)) return;
    const workerStatus = swarm.status as keyof typeof WorkerStatuses;
    const status = WorkerStatuses[workerStatus];
    const terminal = status !== "queued" && status !== "running";
    const summary = swarm.summary?.trim() || TerminalSummaries[workerStatus];
    const childSessionId =
        status !== "queued" && swarm.childSessionId !== swarm.parentSessionId ? swarm.childSessionId : undefined;
    upsertSubagent(
        swarm.parentSessionId,
        {
            subagent_id: id,
            child_session_id: childSessionId,
            goal: swarm.goal,
            status,
            model: "MACU · KronOS Agent",
            summary,
            swarm_worker: true,
            swarm_outcome: swarm.status,
            tool_name: swarm.toolName,
            tool_preview: swarm.toolPreview,
        },
        true,
        terminal ? "subagent.complete" : undefined
    );
}

export async function stopSwarmChild(sessionId: string, getGatewayWsUrl: () => Promise<string>): Promise<void> {
    const gateway = new JsonRpcGatewayClient({ connectTimeoutMs: 5000 });
    try {
        await gateway.connect(await getGatewayWsUrl());
        const result = await gateway.request<{ status?: string }>("session.interrupt", { session_id: sessionId }, 5000);
        if (result?.status !== "interrupted") throw new Error("Hermes did not confirm the worker interrupt.");
    } finally {
        gateway.close();
    }
}

export function installSwarmSubagentSource(getGatewayWsUrl: () => Promise<string>): void {
    registerSwarmWorkerStop((sessionId) => stopSwarmChild(sessionId, getGatewayWsUrl));
    if (installed || typeof window === "undefined") return;
    installed = true;
    subscribeAgentActivityStream(projectSwarmActivity);
    for (const activity of agentActivityTimeline.getAll()) projectSwarmActivity(activity);
}
