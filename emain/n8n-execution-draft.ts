// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import type { N8nWorkflowDraft } from "./n8n-builder";

type CapturedItem = { json: Record<string, unknown>; binary?: unknown };
type RunSource = { previousNode: string; previousNodeOutput?: number; previousNodeRun?: number };
type NodeRun = { source?: (RunSource | null)[]; data?: { main?: (CapturedItem[] | null)[] }; error?: unknown };
type ExecutionData = {
    resultData?: {
        lastNodeExecuted?: string;
        error?: { message?: string; node?: { name?: string } };
        runData?: Record<string, NodeRun[]>;
    };
    executionData?: {
        nodeExecutionStack?: { node?: { name?: string }; data?: { main?: (CapturedItem[] | null)[] } }[];
    };
};

export function makeN8nExecutionDraft(executionId: string, workflow: N8nWorkflowDraft, data: ExecutionData) {
    const result = data?.resultData;
    const failedName = result?.error?.node?.name ?? result?.lastNodeExecuted;
    const failed = workflow?.nodes?.find((node) => node.name === failedName);
    if (!failed) throw new Error("This execution did not save its failed node and workflow revision.");
    const failedRuns = result.runData?.[failedName] ?? [];
    const failedRun = failedRuns.findLast((run) => run.error) ?? failedRuns.at(-1);
    const sources = failedRun?.source?.filter((source) => source != null) ?? [];
    const source = sources.length === 1 ? sources[0] : undefined;
    const stackInputs = data.executionData?.nodeExecutionStack?.find((entry) => entry.node?.name === failedName)?.data
        ?.main;
    const stacked = stackInputs?.filter((items) => items != null);
    const captured =
        stacked?.length === 1
            ? stacked[0]
            : source
              ? result.runData?.[source.previousNode]?.[source.previousNodeRun ?? 0]?.data?.main?.[
                    source.previousNodeOutput ?? 0
                ]
              : undefined;
    const items = captured?.filter((item) => item?.json && typeof item.json === "object" && !Array.isArray(item.json));
    if (!items || items.length !== captured.length || !items.length)
        throw new Error("This execution did not save a single JSON input that can be reproduced.");
    if (items.some((item) => item.binary != null))
        throw new Error("This input contains binary data. Reproduction currently supports JSON inputs.");
    const fixture = items.map(({ json }) => ({ json }));
    if (Buffer.byteLength(JSON.stringify(fixture)) > 1_000_000)
        throw new Error("The recorded input is larger than 1 MB.");

    let fixtureName = "Recorded input";
    const names = new Set(workflow.nodes.map((node) => node.name));
    for (let suffix = 2; names.has(fixtureName); suffix++) fixtureName = `Recorded input ${suffix}`;
    const runnable = failed.type === "n8n-nodes-base.set" && !failed.credentials && !failed.disabled;
    const error = typeof result.error?.message === "string" ? result.error.message.slice(0, 500) : "";
    const notes = [
        `From execution #${executionId}`,
        error,
        runnable
            ? "Runs against recorded input. Other nodes are disabled."
            : "Review this node before enabling it. Other nodes are disabled.",
    ]
        .filter(Boolean)
        .join("\n");
    const fixtureNode = {
        id: randomUUID(),
        name: fixtureName,
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        parameters: {},
        position: [failed.position[0] - 260, failed.position[1] + 130],
    };
    const draft = {
        name: `Reproduce #${executionId} · ${workflow.name}`.slice(0, 128),
        nodes: [
            fixtureNode,
            ...workflow.nodes.map(({ credentials: _credentials, webhookId: _webhookId, ...node }) =>
                node.id === failed.id
                    ? { ...node, notes, notesInFlow: true, disabled: !runnable }
                    : { ...node, disabled: true }
            ),
        ],
        // The historical graph remains visible. Isolate the failed node's inputs and outputs from its original route.
        connections: {
            ...Object.fromEntries(
                Object.entries(workflow.connections)
                    .filter(([name]) => name !== failedName)
                    .map(([name, ports]) => [
                        name,
                        Object.fromEntries(
                            Object.entries(ports).map(([port, outputs]) => [
                                port,
                                outputs.map((links) => links.filter((link) => link.node !== failedName)),
                            ])
                        ),
                    ])
            ),
            [fixtureName]: { main: [[{ node: failedName, type: "main", index: 0 }]] },
        },
        settings: { executionOrder: "v1" },
        pinData: { [fixtureName]: fixture },
    };
    return { draft, nodeId: failed.id, nodeName: failedName, itemCount: fixture.length, runnable };
}
