// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { WshBridge, type WorkspaceSurfaceControl } from "../src/wsh-bridge.ts";

const RequiredFamilies = {
    workspace: [
        "workspace_snapshot",
        "workspace_screenshot",
        "workspace_set_presentation",
        "workspace_focus_widget",
        "workspace_move_widget",
        "workspace_resize_widget",
        "workspace_open_app",
        "workspace_dock_widget",
        "workspace_detach_widget",
        "workspace_set_widget_collapsed",
        "workspace_show_overview",
        "workspace_switch_workspace",
        "workspace_organize",
        "workspace_swap_widgets",
        "workspace_toggle_magnify",
        "workspace_navigate",
        "workspace_canvas_view",
        "workspace_canvas_add_note",
        "workspace_canvas_add_file",
        "workspace_canvas_update_object",
        "workspace_canvas_delete_object",
        "workspace_canvas_connect",
    ],
    hud: [
        "hud_set_mode",
        "hud_show_widget",
        "hud_set_widget_background",
        "hud_list_islands",
        "hud_open_island",
        "hud_focus_island",
        "hud_move_island",
        "hud_resize_island",
        "hud_arrange_islands",
        "hud_close_island",
    ],
    agents: ["acp_list_agents", "acp_run_agent"],
    terminal: ["block_run_command", "terminal_open", "terminal_scrollback"],
    browser: [
        "browser_open",
        "browser_open_tab",
        "browser_navigate",
        "browser_get_html",
        "widget_snapshot",
        "widget_screenshot",
        "widget_click",
        "widget_type",
        "widget_press",
        "widget_sequence",
    ],
    desktop: [
        "kron_computer_status",
        "kron_computer_list_apps",
        "kron_computer_get_app_state",
        "kron_computer_click",
        "kron_computer_type_text",
        "kron_computer_press_key",
        "kron_computer_scroll",
        "kron_computer_drag",
        "kron_computer_set_value",
        "kron_computer_secondary_action",
        "kron_computer_turn_ended",
        "kron_computer_sequence",
    ],
    sandbox: [
        "linux_desktop_list",
        "linux_desktop_start",
        "linux_desktop_stop",
        "linux_desktop_screenshot",
        "linux_desktop_click",
        "linux_desktop_type",
        "linux_desktop_key",
        "linux_desktop_scroll",
        "linux_desktop_exec",
    ],
    canvas: [
        "canvas_load",
        "canvas_snapshot",
        "canvas_save",
        "canvas_create_node",
        "canvas_update_node",
        "canvas_delete_node",
        "canvas_connect_nodes",
        "canvas_launch_node",
        "canvas_upload_asset",
    ],
    lsp: ["lsp_diagnostics", "lsp_symbols", "lsp_hover", "lsp_definition", "lsp_references"],
    workflow: [
        "n8n_status",
        "n8n_search_nodes",
        "n8n_get_node",
        "n8n_list_workspace_widgets",
        "n8n_create_workflow",
        "n8n_edit_workflow",
        "n8n_validate_workflow",
        "n8n_run_workflow",
        "n8n_get_execution",
        "comfyui_status",
        "comfyui_submit",
        "comfyui_job",
        "comfyui_image",
        "comfyui_cancel",
    ],
} as const;

type ListedTool = Awaited<ReturnType<Client["listTools"]>>["tools"][number];

describe("Hermes KronOS tool parity", () => {
    let client: Client;
    let server: McpServer;
    let toolsByName: Map<string, ListedTool>;
    let previousWsh: string | undefined;

    before(async () => {
        previousWsh = process.env.KRONTERM_WSH;
        process.env.KRONTERM_WSH = "/usr/bin/false";
        ({ server } = await import("../src/index.ts"));
        client = new Client({ name: "kronterm-hermes-parity-test", version: "1.0.0" });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        const manifest = await client.listTools();
        toolsByName = new Map(manifest.tools.map((tool) => [tool.name, tool]));
    });

    after(async () => {
        await client.close();
        await server.close();
        if (previousWsh == null) {
            delete process.env.KRONTERM_WSH;
        } else {
            process.env.KRONTERM_WSH = previousWsh;
        }
    });

    for (const [family, names] of Object.entries(RequiredFamilies)) {
        it(`exposes the ${family} contract through the MCP manifest Hermes receives`, () => {
            const missing = names.filter((name) => !toolsByName.has(name));
            assert.deepEqual(missing, []);
        });
    }

    it("routes API-format ComfyUI workflows through the native tool registry", async () => {
        const { setComfyUiToolBridge } = await import("../src/index.ts");
        const workflow = { "1": { class_type: "SaveImage", inputs: { filename_prefix: "test" } } };
        setComfyUiToolBridge(async (operation, input, signal) => {
            assert.equal(operation, "submit");
            assert.deepEqual(input.workflow, workflow);
            assert.equal(signal?.aborted, false);
            return { content: [{ type: "text", text: '{"id":"render-test"}' }] };
        });
        try {
            const result = await client.callTool({ name: "comfyui_submit", arguments: { workflow } });
            assert.notEqual(result.isError, true);
            assert.deepEqual(result.content, [{ type: "text", text: '{"id":"render-test"}' }]);
        } finally {
            setComfyUiToolBridge(undefined);
        }
    });

    it("exposes every registered KronOS MCP tool, not only the required family samples", () => {
        const bridge = spawnSync(process.execPath, [new URL("../dist/native-bridge.js", import.meta.url).pathname], {
            input: JSON.stringify({ method: "list" }),
            encoding: "utf8",
            maxBuffer: 16 * 1024 * 1024,
            env: { ...process.env, KRONTERM_WSH: "/usr/bin/false" },
        });
        assert.equal(bridge.status, 0, bridge.stderr);
        const registered = (JSON.parse(bridge.stdout) as { tools: Array<{ name: string }> }).tools
            .map((tool) => tool.name)
            .sort();
        const advertised = Array.from(toolsByName.keys()).sort();

        assert.ok(registered.length > 100, "expected the complete KronOS tool catalog");
        assert.deepEqual(advertised, registered);
    });

    it("advertises observation tools as read-only and idempotent", () => {
        for (const name of [
            "terminal_scrollback",
            "workspace_snapshot",
            "workspace_screenshot",
            "hud_list_islands",
            "acp_list_agents",
            "browser_get_html",
            "kron_computer_status",
            "kron_computer_list_apps",
            "kron_computer_get_app_state",
            "linux_desktop_list",
            "linux_desktop_screenshot",
            "canvas_load",
            "canvas_snapshot",
            "lsp_diagnostics",
            "lsp_symbols",
            "lsp_hover",
            "lsp_definition",
            "lsp_references",
        ]) {
            const annotations = toolsByName.get(name)?.annotations;
            assert.equal(annotations?.readOnlyHint, true, `${name} must be read-only`);
            assert.equal(annotations?.destructiveHint, false, `${name} must not be destructive`);
            assert.equal(annotations?.idempotentHint, true, `${name} must be idempotent`);
        }
    });

    it("marks destructive lifecycle and canvas replacement operations", () => {
        for (const name of [
            "linux_desktop_stop",
            "canvas_save",
            "canvas_update_node",
            "canvas_delete_node",
            "hud_close_island",
        ]) {
            const annotations = toolsByName.get(name)?.annotations;
            assert.equal(annotations?.readOnlyHint, false, `${name} must be write-capable`);
            assert.equal(annotations?.destructiveHint, true, `${name} must be destructive`);
        }
    });

    it("rejects malformed browser, terminal, and canvas calls before reaching a surface", async () => {
        await assertInvalidCall(client, { name: "browser_open", arguments: { url: "not a url" } });
        await assertInvalidCall(client, { name: "terminal_scrollback", arguments: {} });
        await assertInvalidCall(client, {
            name: "canvas_delete_node",
            arguments: { workspaceId: "workspace-1", blockId: "block-1" },
        });
    });

    it("routes default delegation to KronosCode and returns its result through MCP", async () => {
        const { setKronTermToolBridge } = await import("../src/index.ts");
        const calls: unknown[] = [];
        class DelegationBridge extends WshBridge {
            async acpRunAgent(backend: string, task: string, timeoutSeconds: number): Promise<string> {
                calls.push({ backend, task, timeoutSeconds });
                return JSON.stringify({ backend, answer: "Repository verified", sessionId: "coding-session" });
            }
        }
        setKronTermToolBridge(new DelegationBridge());
        try {
            const result = await client.callTool({
                name: "acp_run_agent",
                arguments: { task: "Inspect the repository" },
            });
            assert.deepEqual(calls, [{ backend: "kronoscode", task: "Inspect the repository", timeoutSeconds: 180 }]);
            assert.equal(result.isError, undefined);
            assert.deepEqual(JSON.parse((result.content as Array<{ text: string }>)[0].text), {
                backend: "kronoscode",
                answer: "Repository verified",
                sessionId: "coding-session",
            });
        } finally {
            setKronTermToolBridge(new WshBridge());
        }
    });

    it("routes HUD placement and existing background widgets without creating another block", async () => {
        const { setKronTermToolBridge } = await import("../src/index.ts");
        const actions: WorkspaceSurfaceControl[] = [];
        class RecordingBridge extends WshBridge {
            async workspaceSurfaceControl(input: WorkspaceSurfaceControl): Promise<string> {
                actions.push(input);
                return JSON.stringify({ success: true });
            }
        }
        setKronTermToolBridge(new RecordingBridge());
        try {
            for (const input of [
                { name: "hud_set_mode", arguments: { mode: "alongside" } },
                { name: "hud_show_widget", arguments: { blockId: "browser-1" } },
                { name: "hud_set_widget_background", arguments: { blockId: "browser-1", background: true } },
                { name: "hud_set_widget_background", arguments: { blockId: "browser-1", background: false } },
            ]) {
                const result = await client.callTool(input);
                assert.ok(!result.isError, resultText(result));
            }
            assert.deepEqual(actions, [
                { action: "hud.mode", presentation: "alongside" },
                { action: "hud.open", blockId: "browser-1" },
                { action: "hud.background", blockId: "browser-1" },
                { action: "hud.restore", blockId: "browser-1" },
            ]);
            await assertInvalidCall(client, { name: "hud_set_mode", arguments: { mode: "canvas" } });
            await assertInvalidCall(client, { name: "hud_show_widget", arguments: { blockId: " " } });
            await assertInvalidCall(client, { name: "hud_set_widget_background", arguments: { blockId: "browser-1" } });
            assert.equal(actions.length, 4);
        } finally {
            setKronTermToolBridge(new WshBridge());
        }
    });

    it("pins an absolute local file in the active canvas and rejects relative and remote paths", async () => {
        const { setKronTermToolBridge } = await import("../src/index.ts");
        const actions: WorkspaceSurfaceControl[] = [];
        class RecordingBridge extends WshBridge {
            async workspaceSurfaceControl(input: WorkspaceSurfaceControl): Promise<string> {
                actions.push(input);
                return JSON.stringify({ success: true, message: "Pinned canvas file file-1." });
            }
        }
        setKronTermToolBridge(new RecordingBridge());
        try {
            const name = "workspace_canvas_add_file";
            const path = "/workspace/shot #1.mp4";
            const result = await client.callTool({ name, arguments: { path, label: "Opening shot", x: 0, y: -10 } });
            assert.ok(!result.isError, resultText(result));
            assert.match(resultText(result), /Pinned canvas file file-1/);
            for (const invalid of ["shot.mp4", "https://example.test/shot.mp4", "wsh://local/path", "/invalid\0path"]) {
                await assertInvalidCall(client, { name, arguments: { path: invalid } });
            }
            assert.deepEqual(actions, [{ action: "add_file", file: path, text: "Opening shot", x: 0, y: -10 }]);
        } finally {
            setKronTermToolBridge(new WshBridge());
        }
    });

    it("rejects ambiguous desktop and widget coordinates without invoking their runtimes", async () => {
        const desktop = await client.callTool({
            name: "kron_computer_click",
            arguments: { app: "Finder", x: 10 },
        });
        assert.equal(desktop.isError, true);
        assert.match(resultText(desktop), /both x and y/i);

        const widget = await client.callTool({
            name: "widget_click",
            arguments: { blockId: "block-1", x: 10 },
        });
        assert.equal(widget.isError, true);
        assert.match(resultText(widget), /both x and y/i);
    });

    it("rejects malformed fast sequences before issuing input", async () => {
        await assertInvalidCall(client, {
            name: "widget_sequence",
            arguments: { blockId: "block-1", actions: [{ action: "drag", startX: 10 }] },
        });
        await assertInvalidCall(client, {
            name: "kron_computer_sequence",
            arguments: { app: "Finder", actions: [] },
        });
    });

    it("does not expose removed legacy sandbox tools", async () => {
        const result = await client.callTool({ name: "sandbox_stop", arguments: { sessionId: "default" } });
        assert.equal(result.isError, true);
        assert.match(resultText(result), /not found/i);
    });
});

function resultText(result: Awaited<ReturnType<Client["callTool"]>>): string {
    return result.content
        .filter((item): item is { type: "text"; text: string } => item.type === "text")
        .map((item) => item.text)
        .join("\n");
}

async function assertInvalidCall(client: Client, input: Parameters<Client["callTool"]>[0]): Promise<void> {
    const result = await client.callTool(input);
    assert.equal(result.isError, true);
    assert.match(resultText(result), /invalid/i);
}
