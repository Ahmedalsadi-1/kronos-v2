import assert from "node:assert/strict";
import { test } from "node:test";
import { server, setKronTermToolBridge } from "../src/index.js";
import { isToolAllowedBySurfaceCapability } from "../src/surface-policy.js";
import { appWorkflow, searchTools } from "../src/tool-discovery.js";
import { WshBridge } from "../src/wsh-bridge.js";

const tools = [
    { name: "browser_navigate", description: "Navigate app", annotations: { readOnlyHint: false } },
    {
        name: "browser_snapshot",
        description: "Inspect app",
        annotations: { readOnlyHint: true },
        inputSchema: { type: "object" },
    },
    { name: "other", description: "browser app" },
];
test("discovery ranks names and applies every query term and read-only filter", () => {
    assert.equal(searchTools(tools, "browser app").total, 3);
    assert.equal(searchTools(tools, "browser missing").total, 0);
    const result = searchTools(tools, "browser", { readOnly: true, includeSchemas: true });
    assert.deepEqual(
        result.tools.map((tool) => tool.name),
        ["browser_snapshot"]
    );
    assert.deepEqual(result.tools[0].inputSchema, { type: "object" });
    assert.equal(searchTools(tools, "", { limit: 1 }).tools.length, 1);
    assert.equal("inputSchema" in searchTools(tools, "snapshot").tools[0], false);
});

test("task phrases, family filters and pagination retain only the supplied scoped catalog", () => {
    const catalog = [
        { name: "file_read", description: "Read a file", annotations: { readOnlyHint: true } },
        { name: "file_info", description: "Inspect metadata", annotations: { readOnlyHint: true } },
        { name: "terminal_input", description: "Send input" },
        { name: "n8n_search_nodes", description: "Search node types" },
    ];
    assert.equal(searchTools(catalog, "please find tools for files read").tools[0].name, "file_read");
    assert.equal(searchTools(catalog, "n8n workflows").tools[0].name, "n8n_search_nodes");
    const page = searchTools(catalog, "", { family: "file", limit: 1 });
    assert.equal(page.total, 2);
    assert.equal(page.nextOffset, 1);
    const next = searchTools(catalog, "", { family: "file", limit: 1, offset: page.nextOffset! });
    assert.equal(next.nextOffset, null);
    assert.notEqual(page.tools[0].name, next.tools[0].name);
    assert.equal(page.readiness, "not_probed");
    assert.deepEqual(page.families.map(({ id }) => id).sort(), ["file", "terminal", "workflow"]);
    const missing = searchTools(catalog, "ai_append");
    assert.equal(missing.total, 0);
    assert.ok(missing.guidance);
    assert.equal(searchTools(catalog, "", { offset: 100 }).tools.length, 0);
});
test("publish recipes require explicit final-action approval and advertise missing capabilities", () => {
    const recipe = appWorkflow("publish", "native", new Set());
    assert.equal(recipe.ready, false);
    assert.ok(recipe.missingTools.includes("kron_computer_click"));
    const gate = recipe.steps.findIndex((step) => "approvalRequired" in step && step.approvalRequired);
    const action = recipe.steps.findIndex(
        (step, index) => index > gate && "tool" in step && step.tool === "kron_computer_click"
    );
    assert.ok(gate >= 0 && gate < action);
    assert.equal(appWorkflow("inspect", "browser", new Set(["workspace_inventory", "widget_snapshot"])).ready, true);
});
test("read-only recipes and catalog are registered in shared registry", () => {
    const registry = (server as any)._registeredTools;
    for (const name of ["tool_search", "app_workflow", "shared_skill_list", "shared_skill_read", "surface_status"]) {
        assert.equal(registry[name].annotations.readOnlyHint, true);
        assert.equal(isToolAllowedBySurfaceCapability(name, { hostMode: "web-fullscreen" } as any), true);
    }
    assert.equal(
        isToolAllowedBySurfaceCapability("tool_search", {
            hostMode: "web-fullscreen",
            capabilities: { customTools: { tool_search: false } },
        } as any),
        false
    );
});

test("live discovery reports caller context without credentials or forbidden families", async () => {
    setKronTermToolBridge(
        Object.assign(new WshBridge(), {
            getDiscoverySurfaceCapability: async () => ({
                token: "private-token",
                nativeCallerId: "private-caller",
                workspaceId: "owner",
                tabId: "tab",
                blockId: "browser",
                hostMode: "web-fullscreen",
                capabilities: { browser: true, terminal: false, files: false, sandbox: false, computerControl: false },
            }),
        } as any)
    );
    try {
        const result = await (server as any)._registeredTools.tool_search.handler({ query: "", limit: 2, offset: 0 });
        const body = JSON.parse(result.content[0].text);
        assert.deepEqual(body.scope, {
            workspaceId: "owner",
            tabId: "tab",
            blockId: "browser",
            hostMode: "web-fullscreen",
        });
        assert.ok(body.observedAt);
        assert.equal(body.tools.length, 2);
        assert.equal(body.nextOffset, 2);
        assert.ok(!body.families.some(({ id }) => ["terminal", "file"].includes(id)));
        assert.ok(!JSON.stringify(body).includes("private-token"));
        assert.ok(!JSON.stringify(body).includes("private-caller"));
    } finally {
        setKronTermToolBridge(new WshBridge());
    }
});

test("draft recipes focus the exact compose field before typing and require click capability", () => {
    for (const surface of ["browser", "native"] as const) {
        const click = surface === "browser" ? "widget_click" : "kron_computer_click";
        const type = surface === "browser" ? "widget_type" : "kron_computer_type_text";
        const required =
            surface === "browser"
                ? ["workspace_inventory", "widget_snapshot", type]
                : ["kron_computer_list_apps", "kron_computer_get_app_state", type];
        const recipe = appWorkflow("draft", surface, new Set(required));
        assert.equal(recipe.ready, false);
        assert.deepEqual(recipe.missingTools, [click]);
        assert.ok(
            recipe.steps.findIndex((step) => "tool" in step && step.tool === click) <
                recipe.steps.findIndex((step) => "tool" in step && step.tool === type)
        );
        assert.equal(appWorkflow("draft", surface, new Set([...required, click])).ready, true);
    }
});

test("finds coding, browser interaction, and VM tools using task vocabulary", () => {
    const catalog = [
        { name: "lsp_diagnostics", description: "Get diagnostics", annotations: { readOnlyHint: true } },
        { name: "widget_click", description: "Click a current element" },
        { name: "sandbox_vm_exec", description: "Execute a command in the assigned guest" },
        { name: "device_tap", description: "Tap the assigned device" },
    ];
    for (const [query, expected] of [
        ["coding diagnostics", "lsp_diagnostics"],
        ["browser click", "widget_click"],
        ["virtual machine command", "sandbox_vm_exec"],
        ["emulators tap", "device_tap"],
    ]) {
        assert.deepEqual(
            searchTools(catalog, query).tools.map((tool) => tool.name),
            [expected]
        );
    }
    assert.equal(searchTools(catalog, "browser click", { readOnly: true }).total, 0);
    assert.equal(searchTools(catalog.slice(0, 2), "virtual machine command").total, 0);
});
