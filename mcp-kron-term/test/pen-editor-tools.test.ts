// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolSessionServer, setKronTermToolBridge } from "../src/index.js";
import { callPenEditor } from "../src/pen-editor-tools.js";
import { toolTimeoutMs } from "../src/tool-execution.js";
import { WshBridge, type WorkspaceSurfaceControl } from "../src/wsh-bridge.js";

test("Pen editor tools route scripts and bundled skills through the scoped workspace", async () => {
    const calls: WorkspaceSurfaceControl[] = [];
    class EditorBridge extends WshBridge {
        async workspaceSurfaceControl(input: WorkspaceSurfaceControl) {
            calls.push(input);
            const { method, params } = JSON.parse(input.text!);
            return JSON.stringify({
                success: true,
                message: JSON.stringify(
                    method === "read_skill" ? `Bundled ${params.name} skill` : { method, ready: true }
                ),
            });
        }
        async publishAgentSurfaceActivity() {}
    }
    setKronTermToolBridge(new EditorBridge());
    const server = createToolSessionServer();
    const client = new Client({ name: "pen-editor-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        const tools = (await client.listTools()).tools;
        assert.equal(
            tools.find(({ name }) => name === "workspace_design_editor_state")?.annotations?.readOnlyHint,
            true
        );
        assert.equal(tools.find(({ name }) => name === "workspace_design_execute")?.annotations?.readOnlyHint, false);
        for (const [name, method, args] of [
            ["workspace_design_editor_state", "get_app_state", {}],
            ["workspace_design_read_skill", "read_skill", { name: "execute" }],
            ["workspace_design_execute", "execute", { code: 'console.log("test");' }],
            ["workspace_design_save", "save", {}],
            ["workspace_design_execute", "execute", { editId: "failed-1", edits: [{ find: "bad", replace: "good" }] }],
        ] as const) {
            const result = await client.callTool({ name, arguments: args });
            assert.equal(result.isError, false);
            assert.deepEqual(calls.at(-1), {
                action: "os.design.editor",
                text: JSON.stringify({ method, params: args }),
            });
        }
        assert.equal(calls.length, 5);
        for (const [name, args] of [
            ["workspace_design_read_skill", { name: "../../auth" }],
            ["workspace_design_execute", { code: "" }],
            ["workspace_design_execute", {}],
            ["workspace_design_execute", { editId: "failed-1" }],
            [
                "workspace_design_execute",
                { code: "test", editId: "failed-1", edits: [{ find: "bad", replace: "good" }] },
            ],
        ] as const) {
            const result = await client.callTool({ name, arguments: args });
            assert.equal(result.isError, true);
        }
        assert.equal(calls.length, 5);
    } finally {
        await Promise.all([client.close(), server.close()]);
        setKronTermToolBridge(new WshBridge());
    }
});

test("Pen failures and malformed bridge responses never become successful edits", async () => {
    for (const response of [
        JSON.stringify({ success: false, message: "Editor unavailable" }),
        JSON.stringify({ success: true }),
        JSON.stringify({ success: true, message: "not JSON" }),
        JSON.stringify({ success: true, message: JSON.stringify({ error: "Unknown layer" }) }),
        "invalid envelope",
    ]) {
        const result = await callPenEditor({ workspaceSurfaceControl: async () => response }, "execute", {
            code: "test",
        });
        assert.equal(result.isError, true);
    }
    const result = await callPenEditor(
        {
            workspaceSurfaceControl: async () => {
                throw new Error("Timed out");
            },
        },
        "save"
    );
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, "Timed out");
});

test("Pen editor deadlines include first-launch startup without changing legacy layer deadlines", () => {
    for (const name of [
        "workspace_design_editor_state",
        "workspace_design_execute",
        "workspace_design_read_skill",
        "workspace_design_save",
    ]) {
        assert.equal(toolTimeoutMs(name, {}, true), 90_000);
        assert.equal(toolTimeoutMs(name, {}, false), 90_000);
    }
    assert.equal(toolTimeoutMs("workspace_design_layers", {}, true), 10_000);
    assert.equal(toolTimeoutMs("workspace_design_create_layer", {}, false), 30_000);
});

test("Pen results preserve native text and screenshot content", async () => {
    const content = [
        { type: "text", text: "# Current App State" },
        { type: "image", data: "aGVsbG8=", mimeType: "image/png" },
    ];
    const result = await callPenEditor(
        {
            workspaceSurfaceControl: async () =>
                JSON.stringify({
                    success: true,
                    message: JSON.stringify({ content, isError: false }),
                }),
        },
        "get_app_state"
    );
    assert.deepEqual(result.content, content);
    assert.equal(result.isError, false);
    const failure = await callPenEditor(
        {
            workspaceSurfaceControl: async () =>
                JSON.stringify({
                    success: true,
                    message: JSON.stringify({ content: [{ type: "text", text: "Invalid script" }], isError: true }),
                }),
        },
        "execute"
    );
    assert.equal(failure.isError, true);
});

test("Pen repair IDs survive downstream truncation of long error bodies", async () => {
    const result = await callPenEditor(
        {
            workspaceSurfaceControl: async () =>
                JSON.stringify({
                    success: true,
                    message: JSON.stringify({
                        isError: true,
                        content: [
                            { type: "text", text: "Invalid stroke. ".repeat(300) + '\n- `editId`: "repair-123"' },
                        ],
                    }),
                }),
        },
        "execute"
    );
    assert.equal(result.isError, true);
    assert.match(String(result.content[0].text), /repair-123/);
});
