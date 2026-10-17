// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WorkflowGraph } from "@/types/workflow-graph";
import { describe, expect, it } from "vitest";
import {
    canvasWorkflowNodeRect,
    connectCanvasWorkflow,
    removeCanvasWorkflowNode,
} from "./workspace-canvas-workflow-model";

const graph: WorkflowGraph = {
    version: 1,
    nodes: ["a", "b", "c"].map((id) => ({ id, kind: "agent", title: id, instruction: id })),
    edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c" },
    ],
};

describe("canvas workflow connections", () => {
    it("validates a single text result binding and can upgrade an order edge", () => {
        const ports = {
            inputs: [{ id: "input", type: "text" as const }],
            outputs: [{ id: "output", type: "text" as const }],
        };
        const typed = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, ...ports })) };
        const connected = connectCanvasWorkflow(typed, "a", "b", true);
        expect(connected.edges.find((edge) => edge.id === "ab")).toMatchObject({
            sourcePort: "output",
            targetPort: "input",
        });
        expect(() => connectCanvasWorkflow(connected, "c", "b", true)).toThrow("already");
        expect(() => connectCanvasWorkflow(graph, "a", "b", true)).toThrow("ports");
    });
    it("uses the declared ports of an imported graph", () => {
        const imported = {
            ...graph,
            nodes: graph.nodes.map((node) => ({
                ...node,
                inputs: [{ id: "evidence", type: "text" as const }],
                outputs: [{ id: "summary", type: "text" as const }],
            })),
        };
        expect(connectCanvasWorkflow(imported, "a", "b", true).edges.find((edge) => edge.id === "ab")).toMatchObject({
            sourcePort: "summary",
            targetPort: "evidence",
        });
    });
    it("rejects cycles and retains an existing connection", () => {
        expect(() => connectCanvasWorkflow(graph, "c", "a")).toThrow("cycle");
        expect(() => connectCanvasWorkflow(graph, "a", "a")).toThrow("itself");
        expect(connectCanvasWorkflow(graph, "a", "b")).toBe(graph);
    });
    it("removes incident edges without changing other nodes", () => {
        expect(removeCanvasWorkflowNode(graph, "b")).toMatchObject({
            nodes: [graph.nodes[0], graph.nodes[2]],
            edges: [],
        });
        expect(graph.edges).toHaveLength(2);
    });
    it("anchors a widget connection to its current canonical bounds", () => {
        const node = { ...graph.nodes[0], blockId: "terminal", position: { x: 0, y: 0 } };
        const rect = { x: 400, y: 100, width: 800, height: 500 };
        expect(canvasWorkflowNodeRect(node, { terminal: rect })).toBe(rect);
        expect(canvasWorkflowNodeRect(graph.nodes[1], {})).toMatchObject({ width: 280, height: 116 });
    });
});
