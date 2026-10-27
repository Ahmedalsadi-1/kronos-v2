import type { WorkflowGraph } from "@/types/workflow-graph";
import { describe, expect, it } from "vitest";
import { fromCanvas, toCanvas, validateCanvas } from "./graph";
import { isValidFlowConnection } from "./upstream/graph-adapter";
const target = { workspaceId: "workspace", tabId: "tab", blockIds: ["terminal"], environment: "workspace" as const };
function fixture(): WorkflowGraph {
    return {
        version: 1,
        nodes: [
            {
                id: "inspect",
                kind: "terminal",
                title: "Inspect",
                instruction: "Inspect files",
                blockId: "terminal",
                position: { x: 50, y: 70 },
            },
            {
                id: "review",
                kind: "review",
                title: "Review",
                instruction: "Review evidence",
                position: { x: 50, y: 230 },
            },
        ],
        edges: [{ id: "dependency", source: "inspect", target: "review" }],
    };
}
describe("OpenHuman canvas adapter", () => {
    it("preserves executable configuration, positions, and edge identity through edits", () => {
        const source = fixture();
        const canvas = toCanvas(source);
        expect(fromCanvas(canvas.nodes, canvas.edges)).toEqual(source);
        expect(() => validateCanvas(fromCanvas(canvas.nodes, canvas.edges), target)).not.toThrow();
    });
    it("rejects invalid handles, self connections and duplicate dependencies", () => {
        const { nodes, edges } = toCanvas(fixture());
        expect(
            isValidFlowConnection(
                { source: "inspect", target: "review", sourceHandle: "missing", targetHandle: "main" },
                nodes,
                edges
            )
        ).toBe(false);
        expect(isValidFlowConnection({ source: "inspect", target: "inspect" }, nodes, edges)).toBe(false);
        expect(isValidFlowConnection({ source: "inspect", target: "review" }, nodes, edges)).toBe(false);
    });
    it("rejects cycles and widgets outside the active target scope", () => {
        const graph = fixture();
        graph.edges.push({ id: "cycle", source: "review", target: "inspect" });
        expect(() => validateCanvas(graph, target)).toThrow(/cycle/);
        graph.edges.pop();
        expect(() => validateCanvas(graph, { ...target, blockIds: [] })).toThrow(/outside/);
    });
});
