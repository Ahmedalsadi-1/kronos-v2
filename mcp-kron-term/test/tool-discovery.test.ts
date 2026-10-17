import assert from "node:assert/strict";
import { test } from "node:test";
import { searchTools, appWorkflow } from "../src/tool-discovery.js";
import { isToolAllowedBySurfaceCapability } from "../src/surface-policy.js";
import { server } from "../src/index.js";

const tools = [
    { name: "browser_navigate", description: "Navigate app", annotations: { readOnlyHint: false } },
    { name: "browser_snapshot", description: "Inspect app", annotations: { readOnlyHint: true }, inputSchema: { type: "object" } },
    { name: "other", description: "browser app" },
];
test("discovery ranks names and applies every query term and read-only filter", () => {
    assert.equal(searchTools(tools, "browser app").total, 3);
    assert.equal(searchTools(tools, "browser missing").total, 0);
    const result = searchTools(tools, "browser", { readOnly: true, includeSchemas: true });
    assert.deepEqual(result.tools.map(tool => tool.name), ["browser_snapshot"]);
    assert.deepEqual(result.tools[0].inputSchema, { type: "object" });
    assert.equal(searchTools(tools, "", { limit: 1 }).tools.length, 1);
    assert.equal("inputSchema" in searchTools(tools, "snapshot").tools[0], false);
});
test("publish recipes require explicit final-action approval and advertise missing capabilities", () => {
    const recipe = appWorkflow("publish", "native", new Set());
    assert.equal(recipe.ready, false);
    assert.ok(recipe.missingTools.includes("kron_computer_click"));
    const gate = recipe.steps.findIndex(step => "approvalRequired" in step && step.approvalRequired);
    const action = recipe.steps.findIndex((step, index) => index > gate && "tool" in step && step.tool === "kron_computer_click");
    assert.ok(gate >= 0 && gate < action);
    assert.equal(appWorkflow("inspect", "browser", new Set(["workspace_inventory", "widget_snapshot"])).ready, true);
});
test("read-only recipes and catalog are registered in shared registry", () => {
    const registry = (server as any)._registeredTools;
    for (const name of ["tool_search", "app_workflow"]) {
        assert.equal(registry[name].annotations.readOnlyHint, true);
        assert.equal(isToolAllowedBySurfaceCapability(name, { hostMode: "web-fullscreen" } as any), true);
    }
    assert.equal(isToolAllowedBySurfaceCapability("tool_search", { hostMode: "web-fullscreen", capabilities: { customTools: { tool_search: false } } } as any), false);
});

test("draft recipes focus the exact compose field before typing and require click capability", () => {
    for (const surface of ["browser", "native"] as const) {
        const click = surface === "browser" ? "widget_click" : "kron_computer_click";
        const type = surface === "browser" ? "widget_type" : "kron_computer_type_text";
        const required = surface === "browser" ? ["workspace_inventory", "widget_snapshot", type] : ["kron_computer_list_apps", "kron_computer_get_app_state", type];
        const recipe = appWorkflow("draft", surface, new Set(required));
        assert.equal(recipe.ready, false);
        assert.deepEqual(recipe.missingTools, [click]);
        assert.ok(recipe.steps.findIndex(step => "tool" in step && step.tool === click) < recipe.steps.findIndex(step => "tool" in step && step.tool === type));
        assert.equal(appWorkflow("draft", surface, new Set([...required, click])).ready, true);
    }
});
