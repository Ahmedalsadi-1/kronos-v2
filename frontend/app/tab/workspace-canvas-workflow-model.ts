// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WorkflowDefinition, WorkflowTarget } from "@/types/workflow";
import type { WorkflowGraph, WorkflowNode } from "@/types/workflow-graph";
import { compileWorkflowGraph } from "@/types/workflow-graph";
import type { WorkspaceCanvasRect } from "./workspace-canvas-utils";

export type CanvasWorkflowDraft = {
    title: string;
    graph: WorkflowGraph;
    target?: Pick<WorkflowTarget, "environment" | "computerId" | "repository">;
    savedWorkflow?: { id: string; version: number; dirty?: boolean };
};

export function emptyCanvasWorkflow(): CanvasWorkflowDraft {
    return { title: "Workspace workflow", graph: { version: 1, nodes: [], edges: [] } };
}

export function makeCanvasWorkflowDefinition(
    draft: CanvasWorkflowDraft,
    target: WorkflowTarget,
    liveBlockIds: string[],
    saved?: WorkflowDefinition
): WorkflowDefinition {
    if (!draft.title.trim()) throw new Error("Give this workflow a name before saving or running.");
    if (draft.graph.nodes.some((node) => node.blockId && !liveBlockIds.includes(node.blockId)))
        throw new Error("A bound widget was closed. Remove or rebind its node before running.");
    if (
        saved &&
        (target.workspaceId !== saved.target.workspaceId ||
            target.tabId !== saved.target.tabId ||
            target.environment !== saved.target.environment ||
            target.computerId !== (saved.target.computerId || undefined) ||
            target.repository !== (saved.target.repository || undefined) ||
            target.blockIds.some((id) => !saved.target.blockIds.includes(id)))
    ) {
        throw new Error("The execution scope changed. Save as a new workflow to use these targets.");
    }
    const executionTarget = saved?.target ?? target;
    return {
        id: saved?.id ?? `canvas-${crypto.randomUUID()}`,
        title: draft.title,
        kind: saved?.kind ?? "automation",
        target: executionTarget,
        parameters: saved?.parameters ?? { task: draft.title },
        graph: structuredClone(draft.graph),
        steps: compileWorkflowGraph(draft.graph, executionTarget),
    };
}

export function canvasWorkflowNodeRect(
    node: WorkflowNode,
    rects: Record<string, WorkspaceCanvasRect>
): WorkspaceCanvasRect {
    if (node.blockId && rects[node.blockId]) return rects[node.blockId];
    return { x: node.position?.x ?? 80, y: node.position?.y ?? 80, width: 280, height: 116 };
}

export function connectCanvasWorkflow(
    graph: WorkflowGraph,
    source: string,
    target: string,
    transferOutput = false
): WorkflowGraph {
    if (source === target) throw new Error("A node cannot connect to itself.");
    if (!graph.nodes.some((node) => node.id === source) || !graph.nodes.some((node) => node.id === target))
        throw new Error("Choose two existing workflow nodes.");
    const existing = graph.edges.find((edge) => edge.source === source && edge.target === target);
    if (existing && !!existing.sourcePort === transferOutput) return graph;
    const sourcePort = graph.nodes.find((node) => node.id === source).outputs?.[0]?.id;
    const targetPort = graph.nodes.find((node) => node.id === target).inputs?.[0]?.id;
    if (transferOutput) {
        if (!sourcePort || !targetPort)
            throw new Error("These nodes need text input and output ports to transfer results.");
        if (graph.edges.some((edge) => edge.target === target && edge.targetPort === targetPort && edge !== existing))
            throw new Error("This input already has a result connection.");
    }
    const reachable = new Set<string>();
    const visit = (id: string) => {
        if (reachable.has(id)) return;
        reachable.add(id);
        graph.edges.filter((edge) => edge.source === id).forEach((edge) => visit(edge.target));
    };
    visit(target);
    if (reachable.has(source)) throw new Error("This connection would create a cycle.");
    return {
        ...graph,
        edges: [
            ...graph.edges.filter((edge) => edge !== existing),
            {
                id: existing?.id ?? `edge-${crypto.randomUUID()}`,
                source,
                target,
                ...(transferOutput ? { sourcePort, targetPort } : {}),
            },
        ],
    };
}

export function removeCanvasWorkflowNode(graph: WorkflowGraph, id: string): WorkflowGraph {
    return {
        ...graph,
        nodes: graph.nodes.filter((node) => node.id !== id),
        edges: graph.edges.filter((edge) => edge.source !== id && edge.target !== id),
    };
}

export function canvasWorkflowEdgePath(source: WorkspaceCanvasRect, target: WorkspaceCanvasRect): string {
    const start = { x: source.x + source.width + 12, y: source.y + source.height / 2 };
    const end = { x: target.x - 12, y: target.y + target.height / 2 };
    if (end.x < start.x) {
        const corridor =
            target.y >= source.y + source.height
                ? (source.y + source.height + target.y) / 2
                : source.y >= target.y + target.height
                  ? (target.y + target.height + source.y) / 2
                  : Math.max(source.y + source.height, target.y + target.height) + 40;
        return `M ${start.x} ${start.y} H ${start.x + 36} V ${corridor} H ${end.x - 36} V ${end.y} H ${end.x}`;
    }
    const distance = Math.max(60, Math.abs(end.x - start.x) / 2);
    return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`;
}
