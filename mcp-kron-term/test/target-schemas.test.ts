import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeToolManifest, server } from "../src/index.js";

const registry = (server as any)._registeredTools;
test("SDK empty schemas and typed schemas accept additive targets without mixed validators", async () => {
    assert.deepEqual(await registry.workspace_inventory.inputSchema.parseAsync({ targetTabId: "tab" }), { targetTabId: "tab" });
    assert.deepEqual(await registry.workspace_snapshot.inputSchema.parseAsync({}), {});
    assert.deepEqual(await registry.widget_click.inputSchema.parseAsync({ blockId: "widget", elementRef: "ref", targetWorkspaceId: "workspace" }), { blockId: "widget", elementRef: "ref", targetWorkspaceId: "workspace" });
    await assert.rejects(() => registry.workspace_inventory.inputSchema.parseAsync({ targetTabId: 42 }));
    const manifest = nativeToolManifest(() => true);
    for (const name of ["workspace_inventory", "workspace_snapshot", "tool_diagnostics"]) {
        const schema = manifest.find(tool => tool.name === name)!.inputSchema;
        assert.equal(schema.type, "object");
        assert.ok(!JSON.stringify(schema).includes('"parseAsync"'));
    }
});
