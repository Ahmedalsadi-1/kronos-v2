// Regression: the /native manifest once threw inside every request because a
// zod-v4 toJSONSchema walked this package's zod-v3 schemas. The conversion now
// lives here — this test pins that it works for the whole registered toolset.

import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { nativeToolManifest, server } from "../src/index.js";

test("native tool manifest converts every registered tool schema without error", () => {
    const tools = nativeToolManifest(() => true);
    assert.ok(tools.length > 50, `expected the full toolset, got ${tools.length}`);
    for (const tool of tools) {
        assert.equal(typeof tool.name, "string");
        assert.ok(tool.inputSchema != null && typeof tool.inputSchema === "object", `${tool.name} schema missing`);
        assert.equal(tool.inputSchema.type, "object");
    }
});

test("native tool manifest respects the tool filter", () => {
    const tools = nativeToolManifest((name) => name === "surface_status");
    assert.equal(tools.length, 1);
    assert.equal(tools[0]?.name, "surface_status");
});

test("warm manifests preserve live authorization, metadata, enabled state, and schema replacement", () => {
    const registry = (server as unknown as { _registeredTools: Record<string, any> })._registeredTools;
    const tool = registry.surface_status;
    const original = { enabled: tool.enabled, description: tool.description, inputSchema: tool.inputSchema };
    const filter = (name: string) => name === "surface_status";
    try {
        const first = nativeToolManifest(filter)[0];
        assert.strictEqual(nativeToolManifest(filter)[0].inputSchema, first.inputSchema);
        assert.equal(nativeToolManifest(() => false).length, 0);
        tool.description = "Updated status";
        assert.equal(nativeToolManifest(filter)[0].description, "Updated status");
        tool.enabled = false;
        assert.equal(nativeToolManifest(filter).length, 0);
        tool.enabled = true;
        tool.inputSchema = z.object({ refreshed: z.string() });
        const updated = nativeToolManifest(filter)[0].inputSchema;
        assert.notStrictEqual(updated, first.inputSchema);
        assert.ok((updated.properties as Record<string, unknown>).refreshed);
    } finally {
        Object.assign(tool, original);
    }
});
