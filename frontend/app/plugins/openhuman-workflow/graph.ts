// SPDX-License-Identifier: GPL-3.0-only
import type { WorkflowTarget } from "@/types/workflow";
import type { WorkflowGraph, WorkflowNode } from "@/types/workflow-graph";
import { compileWorkflowGraph } from "@/types/workflow-graph";
import { workflowGraphToXyflow, xyflowToWorkflowGraph, type FlowEdge, type FlowNode } from "./upstream/graph-adapter";

export const WorkflowCanvasView = "plugin:kronterm.openhuman-workflow/canvas";

export function toCanvas(graph: WorkflowGraph) {
    const canvas = workflowGraphToXyflow({
        schema_version: 1,
        name: "Workflow",
        nodes: graph.nodes.map((node) => ({
            id: node.id,
            kind: (
                {
                    agent: "agent",
                    terminal: "code",
                    browser: "http_request",
                    widget: "sub_workflow",
                    review: "output_parser",
                    computer: "tool_call",
                    launch: "trigger",
                } as const
            )[node.kind],
            name: node.title,
            config: { ...node },
            ports: [],
            position: node.position,
        })),
        edges: graph.edges.map((edge) => ({
            from_node: edge.source,
            to_node: edge.target,
            from_port: "main",
            to_port: "main",
        })),
    });
    canvas.edges = canvas.edges.map((edge, index) => ({
        ...edge,
        id: graph.edges[index].id,
        data: { sourceEdge: graph.edges[index] },
    }));
    return canvas;
}

export function fromCanvas(nodes: FlowNode[], edges: FlowEdge[]): WorkflowGraph {
    const graph = xyflowToWorkflowGraph(nodes, edges, { schema_version: 1, name: "Workflow" });
    return {
        version: 1,
        nodes: graph.nodes.map((node) => ({
            ...(node.config as WorkflowNode),
            id: node.id,
            title: node.name,
            position: node.position,
        })),
        edges: edges.map((edge) => ({
            ...(edge.data?.sourceEdge as object),
            id: edge.id,
            source: edge.source,
            target: edge.target,
        })),
    };
}

export function validateCanvas(graph: WorkflowGraph, target: WorkflowTarget): void {
    compileWorkflowGraph(graph, target);
}

export function makeInitialGraph(): WorkflowGraph {
    return {
        version: 1,
        nodes: [
            {
                id: crypto.randomUUID(),
                kind: "agent",
                title: "Agent task",
                instruction: "Describe the task to perform",
                position: { x: 120, y: 80 },
            },
        ],
        edges: [],
    };
}
