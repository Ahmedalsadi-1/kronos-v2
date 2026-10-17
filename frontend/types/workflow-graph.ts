// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WorkflowStep, WorkflowTarget } from "./workflow";

export type WorkflowNodeKind = "agent" | "terminal" | "browser" | "computer" | "widget" | "review" | "launch";
export type WorkflowExecutionProfile = "kronoscode" | "computer";
export type WorkflowLaunch = { view: "term" | "web" | "preview"; root?: string; url?: string; connection?: string };

export function validateWorkflowLaunch(launch: WorkflowLaunch): void {
    if (!launch || !["term", "web", "preview"].includes(launch.view)) throw new Error("Invalid launch view");
    for (const value of [launch.root, launch.url, launch.connection]) {
        if (
            value != null &&
            (typeof value !== "string" || !value.trim() || value.length > 4096 || /[\x00-\x1f]/.test(value))
        )
            throw new Error("Invalid launch target");
    }
    if (launch.view === "web") {
        let url: URL;
        try {
            url = new URL(launch.url);
        } catch {
            throw new Error("Launch requires an absolute HTTP URL");
        }
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
            throw new Error("Launch requires an HTTP URL without credentials");
    } else if (launch.url != null) throw new Error("Only browser launches accept URLs");
    if (launch.view === "preview" && !launch.root) throw new Error("Preview launch requires a file path");
    if (launch.root != null && !launch.root.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(launch.root))
        throw new Error("Launch root must be an absolute path");
    if (launch.connection != null && !/^[a-zA-Z0-9_.:@/-]{1,256}$/.test(launch.connection))
        throw new Error("Invalid launch connection");
}

export type WorkflowPort = { id: string; type: "text" };
export type WorkflowNode = {
    id: string;
    kind: WorkflowNodeKind;
    title: string;
    instruction: string;
    blockId?: string;
    engine?: WorkflowExecutionProfile;
    launch?: WorkflowLaunch;
    inputs?: WorkflowPort[];
    outputs?: WorkflowPort[];
    position?: { x: number; y: number };
};
export type WorkflowEdge = { id: string; source: string; target: string; sourcePort?: string; targetPort?: string };
export type WorkflowGraph = { version: 1; nodes: WorkflowNode[]; edges: WorkflowEdge[] };
export type WorkflowExecutionCapabilities = {
    backend: "kronoscode" | "computer-loop";
    profile: WorkflowExecutionProfile;
    separateEngine: boolean;
    structuredOutputs: false;
};

const ValidId = /^[a-zA-Z0-9_-]{1,80}$/;
const NodeKinds = new Set(["agent", "terminal", "browser", "computer", "widget", "review", "launch"]);

export function compileWorkflowGraph(graph: WorkflowGraph, target: WorkflowTarget): WorkflowStep[] {
    if (graph?.version !== 1 || !Array.isArray(graph.nodes) || !graph.nodes.length || graph.nodes.length > 100)
        throw new Error("Workflow graph requires version 1 and between 1 and 100 nodes");
    if (!Array.isArray(graph.edges) || graph.edges.length > 10000) throw new Error("Invalid workflow edges");
    const nodes = new Map<string, WorkflowNode>();
    for (const node of graph.nodes) {
        if (!node || typeof node.id !== "string" || !ValidId.test(node.id) || nodes.has(node.id))
            throw new Error("Workflow node IDs must be valid and unique");
        if (
            typeof node.title !== "string" ||
            !node.title.trim() ||
            node.title.length > 160 ||
            typeof node.instruction !== "string" ||
            !node.instruction.trim() ||
            node.instruction.length > 20000
        )
            throw new Error("Workflow nodes require a title and instruction");
        if (node.kind === "launch") validateWorkflowLaunch(node.launch);
        else if (node.launch != null) throw new Error("Launch configuration requires a launch node");
        if (!NodeKinds.has(node.kind)) throw new Error("Unknown workflow node kind");
        if (node.engine != null && !["kronoscode", "computer"].includes(node.engine))
            throw new Error("Unknown workflow execution profile");
        if (node.blockId != null && !target.blockIds.includes(node.blockId))
            throw new Error("Workflow widget is outside the assigned targets");
        if (["terminal", "browser", "widget"].includes(node.kind) && !node.blockId)
            throw new Error("Widget nodes require an assigned widget");
        if (node.kind === "computer" && (!target.computerId || target.environment === "workspace"))
            throw new Error("Computer nodes require an assigned computer");
        if (node.position && (!Number.isFinite(node.position.x) || !Number.isFinite(node.position.y)))
            throw new Error("Invalid workflow node position");
        for (const ports of [node.inputs ?? [], node.outputs ?? []]) {
            if (!Array.isArray(ports) || ports.length > 100) throw new Error("Invalid workflow ports");
            const ids = new Set<string>();
            for (const port of ports) {
                if (!port || !ValidId.test(port.id) || ids.has(port.id) || port.type !== "text")
                    throw new Error("Workflow ports require unique IDs and text values");
                ids.add(port.id);
            }
        }
        nodes.set(node.id, node);
    }
    const edgeIds = new Set<string>();
    const boundInputs = new Set<string>();
    const dependencies = new Map(graph.nodes.map((node) => [node.id, new Set<string>()]));
    for (const edge of graph.edges) {
        if (!edge || !ValidId.test(edge.id) || edgeIds.has(edge.id))
            throw new Error("Invalid or duplicate workflow edge");
        edgeIds.add(edge.id);
        const source = nodes.get(edge.source);
        const destination = nodes.get(edge.target);
        if (!source || !destination) throw new Error("Workflow edge references a missing node");
        if ((edge.sourcePort != null) !== (edge.targetPort != null))
            throw new Error("Data edges require both source and target ports");
        if (edge.sourcePort != null) {
            if (
                !source.outputs?.some((port) => port.id === edge.sourcePort) ||
                !destination.inputs?.some((port) => port.id === edge.targetPort)
            )
                throw new Error("Workflow edge references a missing port");
            const key = `${edge.target}:${edge.targetPort}`;
            if (boundInputs.has(key)) throw new Error("Each workflow input accepts one connection");
            boundInputs.add(key);
        }
        dependencies.get(edge.target).add(edge.source);
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string) => {
        if (visiting.has(id)) throw new Error("Workflow dependencies contain a cycle");
        if (visited.has(id)) return;
        visiting.add(id);
        for (const dependency of dependencies.get(id)) visit(dependency);
        visiting.delete(id);
        visited.add(id);
    };
    for (const node of graph.nodes) visit(node.id);
    return graph.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        instruction: node.instruction,
        dependsOn: [...dependencies.get(node.id)],
        status: "pending",
        nodeKind: node.kind,
        blockId: node.blockId,
        engine: node.engine,
        launch: node.launch,
    }));
}

export function workflowNodeInputs(
    graph: WorkflowGraph,
    steps: WorkflowStep[],
    nodeId: string
): Record<string, string> {
    const inputs: Record<string, string> = Object.create(null);
    for (const edge of graph.edges.filter((edge) => edge.target === nodeId && edge.targetPort != null)) {
        const source = steps.find((step) => step.id === edge.source);
        if (source?.status !== "succeeded" || typeof source.result !== "string")
            throw new Error("Workflow input is unavailable until its source succeeds");
        inputs[edge.targetPort] = source.result;
    }
    return inputs;
}

export function workflowExecutionCapabilities(step: WorkflowStep): WorkflowExecutionCapabilities {
    return {
        backend:
            (step.engine ?? (step.nodeKind === "computer" ? "computer" : "kronoscode")) === "computer"
                ? "computer-loop"
                : "kronoscode",
        profile: step.engine ?? (step.nodeKind === "computer" ? "computer" : "kronoscode"),
        separateEngine: (step.engine ?? (step.nodeKind === "computer" ? "computer" : "kronoscode")) === "computer",
        structuredOutputs: false,
    };
}
