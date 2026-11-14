// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createToolSessionServer, setSwarmToolBridge } from "../src/index.js";
import { isToolAllowedBySurfaceCapability } from "../src/surface-policy.js";
import { ToolOperationContext, toolTimeoutMs } from "../src/tool-execution.js";

test("registered swarm commands validate arguments and forward their execution signal", async () => {
    const server = createToolSessionServer();
    const client = new Client({ name: "swarm-tool-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    setSwarmToolBridge(async (name, args, signal) => {
        assert.ok(signal instanceof AbortSignal);
        assert.equal(signal, ToolOperationContext.getStore()?.signal);
        calls.push({ name, args });
        return { accepted: true };
    });

    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        const tools = (await client.listTools()).tools.filter(({ name }) => name.startsWith("swarm_"));
        assert.deepEqual(tools.map(({ name }) => name).sort(), [
            "swarm_cancel",
            "swarm_replan",
            "swarm_start",
            "swarm_status",
            "swarm_targets",
        ]);
        assert.equal(tools.find(({ name }) => name === "swarm_targets")?.annotations?.readOnlyHint, true);
        assert.equal(tools.find(({ name }) => name === "swarm_start")?.annotations?.readOnlyHint, false);

        const start = { goal: "Inspect the browser", targetIds: ["browser:one"] };
        const result = await client.callTool({ name: "swarm_start", arguments: start });
        assert.deepEqual(result.content, [{ type: "text", text: '{"accepted":true}' }]);
        assert.deepEqual(calls, [{ name: "swarm_start", args: { ...start, concurrency: 2 } }]);

        for (const args of [
            { ...start, targetIds: [] },
            { ...start, concurrency: 5 },
        ]) {
            const rejected = await client.callTool({ name: "swarm_start", arguments: args });
            assert.equal(rejected.isError, true);
        }
        assert.equal(calls.length, 1);
    } finally {
        await Promise.all([client.close(), server.close()]);
    }
});

test("MACU planning has its own deadline and swarm status retains the observation deadline", () => {
    assert.equal(toolTimeoutMs("swarm_start", {}, false), 120_000);
    assert.equal(toolTimeoutMs("swarm_replan", {}, false), 120_000);
    assert.equal(toolTimeoutMs("swarm_status", {}, true), 10_000);
});

test("direct stdio MCP omits tools that require the native swarm bridge", async () => {
    const client = new Client({ name: "standalone-swarm-test", version: "1" });
    const transport = new StdioClientTransport({
        command: process.execPath,
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        args: [
            "--import", "tsx", "--input-type=module", "-e",
            'import { startKronTermMcpServer } from "./src/index.ts"; await startKronTermMcpServer();',
        ],
    });
    try {
        await client.connect(transport);
        const tools = (await client.listTools()).tools;
        assert.ok(tools.some(({ name }) => name === "workspace_snapshot"));
        assert.ok(tools.every(({ name }) => !name.startsWith("swarm_")));
        const result = await client.callTool({ name: "swarm_targets", arguments: {} });
        assert.equal(result.isError, true);
    } finally {
        await client.close();
    }
});

test("swarm commands are offered to desktop parent chats and withheld from delegates", () => {
    for (const name of ["swarm_targets", "swarm_start", "swarm_status", "swarm_cancel", "swarm_replan"]) {
        assert.equal(isToolAllowedBySurfaceCapability(name, { hostMode: "kronterm" }), true);
        for (const delegationScope of ["inherit", "sandbox", "widgets"] as const) {
            assert.equal(isToolAllowedBySurfaceCapability(name, { hostMode: "kronterm", delegationScope }), false);
        }
        assert.equal(isToolAllowedBySurfaceCapability(name, { hostMode: "web-fullscreen" }), false);
    }
});
