// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createToolSessionServer } from "../src/index.js";

test("independent MCP sessions retain tools, prompts, and resources after another session connects", async () => {
    const sessions = await Promise.all([1, 2].map(async (number) => {
        const server = createToolSessionServer();
        const client = new Client({ name: `test-${number}`, version: "1" });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        return { server, client };
    }));
    try {
        for (const { client } of sessions) {
            assert.ok((await client.listTools()).tools.length > 50);
            assert.ok((await client.listPrompts()).prompts.length > 0);
            const resources = (await client.listResources()).resources;
            assert.ok(resources.length > 0);
            const result = await client.readResource({ uri: resources[0].uri });
            assert.ok(result.contents.length > 0);
        }
        await sessions[1].client.close();
        assert.ok((await sessions[0].client.listTools()).tools.length > 50);
    } finally {
        await Promise.all(sessions.map(({ client, server }) => Promise.all([client.close(), server.close()])));
    }
});
