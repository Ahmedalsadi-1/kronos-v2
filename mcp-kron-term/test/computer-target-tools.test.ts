// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    deviceResult,
    registerComputerTargetTools,
    setComputerTargetToolBridge,
} from "../src/computer-target-tools.js";
import { isToolAllowedBySurfaceCapability } from "../src/surface-policy.js";

const TargetId = "12345678-1234-1234-1234-123456789abc";
const createTools = () => {
    const server = new McpServer({ name: "test", version: "1" });
    registerComputerTargetTools(server);
    return (server as any)._registeredTools;
};

test("device tool schemas require current ownership generation and bounded inputs", () => {
    const tools = createTools();
    assert.equal(tools.device_list.annotations.readOnlyHint, true);
    assert.equal(tools.device_tap.annotations.readOnlyHint, false);
    for (const name of ["device_tap", "device_type", "device_back", "device_boot", "device_shutdown", "device_open"]) {
        assert.equal(tools[name].inputSchema.safeParse({ targetId: TargetId }).success, false);
    }
    assert.equal(
        tools.device_tap.inputSchema.safeParse({ targetId: TargetId, expectedGeneration: 1, x: 1.01, y: 0 }).success,
        false
    );
    assert.equal(
        tools.device_type.inputSchema.safeParse({ targetId: TargetId, expectedGeneration: 1, text: "x".repeat(4097) })
            .success,
        false
    );
    assert.equal(tools.device_screenshot.inputSchema.safeParse({ targetId: "appium:test-session" }).success, true);
});

test("registered tools reach injected desktop runtime and preserve stale generation failures", async () => {
    const tools = createTools();
    const actions: unknown[] = [];
    setComputerTargetToolBridge({
        list: async () => [{ id: TargetId, controlGeneration: 3 }],
        perform: async (action) => {
            actions.push(action);
            if (action.expectedGeneration !== 3) throw new Error("Control changed. Refresh before continuing.");
            return { target: { id: action.targetId, controlGeneration: 3 } };
        },
    });
    try {
        const list = await tools.device_list.handler({});
        assert.equal(JSON.parse(list.content[0].text)[0].controlGeneration, 3);
        const success = await tools.device_boot.handler({ targetId: TargetId, expectedGeneration: 3 });
        assert.equal(success.isError, undefined);
        assert.deepEqual(actions[0], { targetId: TargetId, expectedGeneration: 3, action: "boot" });
        const stale = await tools.device_boot.handler({ targetId: TargetId, expectedGeneration: 2 });
        assert.equal(stale.isError, true);
        assert.match(stale.content[0].text, /Control changed/);
    } finally {
        setComputerTargetToolBridge(undefined);
    }
});

test("captures use native MCP image content and keep metadata free of duplicate base64", () => {
    const result = deviceResult({
        target: { id: TargetId, controlGeneration: 4 },
        imageDataUrl: "data:image/png;base64,aGVsbG8=",
    });
    assert.equal(result.content[1].type, "image");
    assert.equal((result.content[1] as any).data, "aGVsbG8=");
    assert.equal(result.content[0].type, "text");
    assert.equal((result.content[0] as any).text.includes("imageDataUrl"), false);
});

test("fullscreen agent contexts need explicit computerControl capability for device tools", () => {
    assert.equal(isToolAllowedBySurfaceCapability("device_list", { hostMode: "web-fullscreen" } as any), false);
    assert.equal(
        isToolAllowedBySurfaceCapability("device_tap", {
            hostMode: "web-fullscreen",
            capabilities: { computerControl: true },
        } as any),
        true
    );
    assert.equal(
        isToolAllowedBySurfaceCapability("device_type", {
            hostMode: "web-fullscreen",
            capabilities: { computerControl: true, customTools: { device_type: false } },
        } as any),
        false
    );
});

test("standalone tools forward through the existing authenticated native endpoint", async () => {
    const tools = createTools();
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.KRONTERM_NATIVE_TOOL_URL;
    const originalToken = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
    setComputerTargetToolBridge(undefined);
    process.env.KRONTERM_NATIVE_TOOL_URL = "http://127.0.0.1:12345/native";
    process.env.KRONTERM_NATIVE_TOOL_TOKEN = "test-only-token";
    globalThis.fetch = async (url, init) => {
        assert.equal(String(url), "http://127.0.0.1:12345/native");
        assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-only-token");
        assert.equal(init?.redirect, "error");
        assert.deepEqual(JSON.parse(init?.body as string), { method: "call", name: "device_list", arguments: {} });
        return new Response(JSON.stringify({ content: [{ type: "text", text: "[]" }] }));
    };
    try {
        const result = await tools.device_list.handler({});
        assert.equal(result.isError, undefined);
        assert.equal(result.content[0].text, "[]");
    } finally {
        globalThis.fetch = originalFetch;
        if (originalUrl == null) delete process.env.KRONTERM_NATIVE_TOOL_URL;
        else process.env.KRONTERM_NATIVE_TOOL_URL = originalUrl;
        if (originalToken == null) delete process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        else process.env.KRONTERM_NATIVE_TOOL_TOKEN = originalToken;
    }
});
