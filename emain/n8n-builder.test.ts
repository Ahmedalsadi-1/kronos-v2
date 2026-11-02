import { describe, expect, it } from "vitest";
import { editN8nDraft, validateN8nDraft, type N8nWorkflowDraft } from "./n8n-builder";

const node = (name: string) => ({
    id: name,
    name,
    type: "CUSTOM.hermesAgent",
    typeVersion: 1,
    parameters: {},
    position: [0, 0],
});
function draft(): N8nWorkflowDraft {
    return {
        name: "Test",
        nodes: [node("Start"), node("Hermes"), node("Tool")],
        connections: {
            Start: { main: [[{ node: "Hermes", type: "main", index: 0 }]] },
            Hermes: { ai_tool: [[{ node: "Tool", type: "ai_tool", index: 0 }]] },
        },
    };
}
describe("workflow builder edits", () => {
    it("renames nodes and their incoming and outgoing typed connectors without mutating the original", () => {
        const original = draft();
        const result = editN8nDraft(original, [{ action: "rename-node", name: "Hermes", newName: "Worker" }]);
        expect(result.connections.Start.main[0][0].node).toBe("Worker");
        expect(result.connections.Worker.ai_tool[0][0].node).toBe("Tool");
        expect(original.nodes[1].name).toBe("Hermes");
        expect(original.connections.Hermes).toBeDefined();
    });
    it("removes a node and every incident connector", () => {
        const result = editN8nDraft(draft(), [{ action: "remove-node", name: "Hermes" }]);
        expect(result.connections.Hermes).toBeUndefined();
        expect(result.connections.Start.main[0]).toEqual([]);
        expect(validateN8nDraft(result)).toEqual([]);
    });
    it("adds, configures, connects and disconnects nodes in a single batch", () => {
        const result = editN8nDraft(draft(), [
            { action: "add-node", node: node("Widget") },
            { action: "update-node", name: "Widget", parameters: { widgetKey: "defwidget@files" } },
            { action: "connect", source: "Hermes", target: "Widget", port: "ai_tool" },
            { action: "disconnect", source: "Hermes", target: "Tool", port: "ai_tool" },
        ]);
        expect(result.nodes[3].parameters.widgetKey).toBe("defwidget@files");
        expect(result.connections.Hermes.ai_tool[0]).toEqual([{ node: "Widget", type: "ai_tool", index: 0 }]);
    });
    it("rejects duplicate names, dangling connections and unsafe object keys", () => {
        expect(() => editN8nDraft(draft(), [{ action: "rename-node", name: "Hermes", newName: "Tool" }])).toThrow(
            "unique"
        );
        expect(() => editN8nDraft(draft(), [{ action: "connect", source: "Missing", target: "Hermes" }])).toThrow(
            "source"
        );
        expect(() =>
            editN8nDraft(draft(), [{ action: "connect", source: "Hermes", target: "Tool", port: "__proto__" }])
        ).toThrow("port");
        expect(() => editN8nDraft(draft(), [{ action: "rename-node", name: "Hermes", newName: "__proto__" }])).toThrow(
            "unique"
        );
    });
});
