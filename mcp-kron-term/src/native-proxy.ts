// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// stdio MCP proxy in front of KronOS's in-process TypeScript tool runtime.
//
// Spawn sites (ACP agent manager, KronOS gateway) keep the stdio server
// contract they already have, but every manifest/call is proxied to the
// Electron-owned `/native` endpoint — so there is no wsh-CLI dependency, no
// bridge-token pairing to go stale after app restarts, and exactly one tool
// implementation (the persistent KronTermNativeToolBridge).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { toolTimeoutMs } from "./tool-execution.js";

const ReadOnlyTools = new Set<string>();
const URL_ENV = "KRONTERM_NATIVE_TOOL_URL";
const TOKEN_ENV = "KRONTERM_NATIVE_TOOL_TOKEN";
const MAX_OUTPUT_BYTES = 28 * 1024 * 1024;

type NativeTool = {
    name?: unknown;
    description?: unknown;
    inputSchema?: unknown;
    annotations?: unknown;
};

function isNativeTool(value: unknown): value is NativeTool & { name: string } {
    return typeof value === "object" && value != null && typeof (value as NativeTool).name === "string";
}

export async function bridgeRequest(
    payload: Record<string, unknown>,
    signal?: AbortSignal
): Promise<Record<string, unknown>> {
    const endpoint = (process.env[URL_ENV] ?? "").trim();
    const token = (process.env[TOKEN_ENV] ?? "").trim();
    if (!endpoint || !token) return { error: "KronOS native tool bridge is unavailable (missing URL or token)" };
    const name = String(payload.name);
    const mutation = payload.method === "call" && !ReadOnlyTools.has(name);
    let dispatched = false;
    const failure = (message: string, uncertain = dispatched && mutation) => ({
        error: message,
        failure: { code: "TRANSPORT_FAILED", retryable: false, uncertain },
    });
    try {
        const url = new URL(endpoint);
        if (
            url.protocol !== "http:" ||
            !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
            url.username ||
            url.password ||
            url.pathname !== "/native" ||
            url.search ||
            url.hash
        )
            return failure("KronOS native transport must use a local HTTP /native endpoint.", false);
        if (url.hostname === "localhost") url.hostname = "127.0.0.1";
        signal?.throwIfAborted();
        const budget =
            payload.method === "call"
                ? toolTimeoutMs(name, (payload.arguments ?? {}) as Record<string, unknown>, ReadOnlyTools.has(name)) +
                  5000
                : 15000;
        dispatched = true;
        const response = await fetch(url, {
            method: "POST",
            redirect: "error",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.any([AbortSignal.timeout(budget), ...(signal ? [signal] : [])]),
        });
        if (!response.body) return failure("KronOS native tool bridge returned an empty response");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > MAX_OUTPUT_BYTES)
                    return failure("KronOS native tool bridge returned an oversized response");
                chunks.push(chunk.value);
            }
        } finally {
            await reader.cancel().catch(() => {});
        }
        const text = Buffer.concat(chunks).toString("utf8");
        if (response.status !== 200)
            return failure(
                `KronOS native tool bridge returned ${response.status}: ${text.slice(0, 200)}`,
                mutation && response.status >= 500
            );
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed))
            return failure("KronOS native tool bridge returned an invalid response");
        return parsed as Record<string, unknown>;
    } catch (error) {
        return failure(`KronOS native tool bridge failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function startKronTermNativeProxy(): Promise<void> {
    const server = new Server({ name: "kron-term", version: "1.0.0" }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const response = await bridgeRequest({ method: "list" });
        const tools = Array.isArray(response.tools) ? response.tools.filter(isNativeTool) : [];
        if (response.error) {
            console.error(`[kronterm-native-proxy] tool list unavailable: ${String(response.error)}`);
        }
        ReadOnlyTools.clear();
        for (const tool of tools) if ((tool.annotations as any)?.readOnlyHint === true) ReadOnlyTools.add(tool.name);
        return {
            tools: tools.map((tool) => ({
                name: tool.name,
                description: typeof tool.description === "string" ? tool.description : undefined,
                inputSchema:
                    typeof tool.inputSchema === "object" && tool.inputSchema != null
                        ? tool.inputSchema
                        : { type: "object" },
                annotations:
                    typeof tool.annotations === "object" && tool.annotations != null ? tool.annotations : undefined,
            })),
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
        const response = await bridgeRequest(
            {
                method: "call",
                name: request.params.name,
                arguments: (request.params.arguments ?? {}) as Record<string, unknown>,
            },
            extra.signal
        );
        if (response.error) {
            return {
                content: [
                    {
                        type: "text",
                        text: response.failure
                            ? JSON.stringify({ error: response.error, failure: response.failure })
                            : String(response.error),
                    },
                ],
                isError: true,
                _meta: response.failure ? { failure: response.failure } : undefined,
            };
        }
        return response;
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

const modulePath = fileURLToPath(import.meta.url);
const isMainModule =
    process.argv[1] != null &&
    path.basename(modulePath) === "native-proxy.js" &&
    path.resolve(process.argv[1]) === modulePath;
if (isMainModule) {
    startKronTermNativeProxy().catch((err) => {
        console.error("mcp-kron-term native proxy: server error:", err);
        process.exit(1);
    });
}
