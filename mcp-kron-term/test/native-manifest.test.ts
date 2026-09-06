// Regression: the /native manifest once threw inside every request because a
// zod-v4 toJSONSchema walked this package's zod-v3 schemas. The conversion now
// lives here — this test pins that it works for the whole registered toolset.

import assert from "node:assert/strict";
import test from "node:test";
import { nativeToolManifest } from "../src/index.js";

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
