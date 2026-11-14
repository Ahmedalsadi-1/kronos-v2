// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type ProductivityToolBridge = {
    query(input: { collection: string; query?: string; limit?: number }): unknown;
    command(input: unknown): unknown;
};
let bridge: ProductivityToolBridge | undefined;

export function setProductivityToolBridge(value: ProductivityToolBridge | undefined): void {
    bridge = value;
}

async function invoke(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
        if (bridge) {
            const result =
                name === "productivity_query"
                    ? await bridge.query(args as { collection: string })
                    : await bridge.command(args.command);
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        const endpoint = process.env.KRONTERM_NATIVE_TOOL_URL;
        const token = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        if (!endpoint || !token) throw new Error("Connect to KronOS to use productivity tools.");
        const url = new URL(endpoint);
        if (
            url.protocol !== "http:" ||
            !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
            url.pathname !== "/native" ||
            url.username ||
            url.password ||
            url.search ||
            url.hash
        )
            throw new Error("Productivity tools require the local KronOS native endpoint.");
        const response = await fetch(url, {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ method: "call", name, arguments: args }),
        });
        if (!response.ok) throw new Error(`Productivity transport returned ${response.status}`);
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Empty productivity response");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > 2 * 1024 * 1024) throw new Error("Productivity response exceeds the size limit");
                chunks.push(chunk.value);
            }
        } finally {
            await reader.cancel();
        }
        const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!Array.isArray(result.content)) throw new Error("Invalid productivity response");
        return result as CallToolResult;
    } catch (error) {
        return {
            content: [{ type: "text", text: error instanceof Error ? error.message : "Productivity request failed" }],
            isError: true,
        };
    }
}

export function registerProductivityTools(server: McpServer): void {
    server.registerTool(
        "productivity_query",
        {
            title: "Read KronOS productivity",
            description:
                "Read local tasks, reminders, searchable notes, habits, focus history or opt-in status-only activity. Use returned IDs for updates. No screen contents or terminal transcripts are recorded. Note bodies are returned only when explicitly querying notes.",
            inputSchema: {
                collection: z.enum(["tasks", "reminders", "notes", "habits", "focus", "activity", "preferences"]),
                query: z.string().max(300).optional(),
                limit: z.number().int().min(1).max(50).optional(),
            },
            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
        },
        (args) => invoke("productivity_query", args)
    );
    server.registerTool(
        "productivity_update",
        {
            title: "Update KronOS productivity",
            description:
                "Apply a requested local productivity change. Commands: task.save {id?,title,dueAt? epoch ms}, task.status {id,status:open|completed|deleted}, task.snooze {id,minutes}; note.save {id?,title,body}, note.delete {id,deleted}; habit.save {id?,title,target}, habit.progress {id,date:YYYY-MM-DD,delta}, habit.archive {id,archived}, habit.snooze {id,minutes}; focus.start {label,minutes}, focus.pause/resume/stop, focus.extend {minutes}; preferences.save {activityEnabled,blockedSites,blockedApps}, activity.clear. Do not change recording or blocking preferences unless requested. Blocking applies only to KronOS-managed browser and app launches. Items can be restored. Durations 1–1440 minutes.",
            inputSchema: { command: z.record(z.unknown()) },
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (args) => invoke("productivity_update", args)
    );
}
