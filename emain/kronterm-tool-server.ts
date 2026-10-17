// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo, RequestId } from "@modelcontextprotocol/sdk/types.js";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
    createToolSessionServer,
    server as mcpServer,
    nativeToolManifest,
    setComputerTargetToolBridge,
    setKronTermToolBridge,
    setLinuxDesktopToolBridge,
    setProductivityToolBridge,
    warmKronComputerUse,
} from "../mcp-kron-term/src/index";
import { isToolAllowedBySurfaceCapability } from "../mcp-kron-term/src/surface-policy";
import type { SurfaceCapability } from "../mcp-kron-term/src/wsh-bridge";
import { getComputerTargetsRuntime } from "./computer-targets-runtime";
import { notifyDesktopPetSurfaceActivity } from "./emain-pet";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { KronTermNativeToolBridge, runWithAgentActivitySource } from "./kronterm-native-tool-bridge";
import { getLinuxDesktopsRuntime } from "./linux-desktops-runtime";
import { commandProductivity, queryProductivity } from "./productivity-runtime";
import { SandboxTaskRuntime } from "./sandbox-task-runtime";
import { resolveToolRequestContext, withToolRequestContext } from "./tool-request-context";

export type KronTermToolServerDescriptor = {
    url: string;
    nativeUrl: string;
    token: string;
};

type SurfaceContextProvider = () => HermesSurfaceContext | null;

// Schema ownership stays with the registry because SDK-created and registered schemas use different Zod majors.
type RegisteredToolSchema = {
    parseAsync(args: unknown): Promise<unknown>;
};

type NativeRegisteredTool = {
    enabled: boolean;
    title?: string;
    description?: string;
    inputSchema?: RegisteredToolSchema;
    annotations?: Record<string, unknown>;
    handler: (args: Record<string, unknown>, extra: { signal?: AbortSignal }) => Promise<unknown> | unknown;
};

function registeredTools(): Record<string, NativeRegisteredTool> {
    return (mcpServer as unknown as { _registeredTools: Record<string, NativeRegisteredTool> })._registeredTools;
}

function requestKey(id: RequestId): string {
    return `${typeof id}:${String(id)}`;
}

function surfaceCapability(context: HermesSurfaceContext | null): SurfaceCapability | undefined {
    if (!context?.tabId) {
        return undefined;
    }
    return {
        token: "electron-owned",
        nativeCallerId: context.nativeCallerId,
        tabId: context.tabId,
        blockId: context.blockId,
        workspaceId: context.workspaceId,
        hostMode: context.hostMode ?? "kronterm",
        capabilities: context.capabilities,
    };
}

class ScopedMcpTransport implements Transport {
    private inner: StreamableHTTPServerTransport;
    private contextProvider: SurfaceContextProvider;
    private listRequestIds = new Set<string>();
    private messageHandler: ((message: JSONRPCMessage, extra?: MessageExtraInfo) => void) | undefined;

    constructor(inner: StreamableHTTPServerTransport, contextProvider: SurfaceContextProvider) {
        this.inner = inner;
        this.contextProvider = contextProvider;
        inner.onmessage = (message, extra) => this.handleIncoming(message, extra);
    }

    get onclose(): (() => void) | undefined {
        return this.inner.onclose;
    }

    set onclose(handler: (() => void) | undefined) {
        this.inner.onclose = handler;
    }

    get onerror(): ((error: Error) => void) | undefined {
        return this.inner.onerror;
    }

    set onerror(handler: ((error: Error) => void) | undefined) {
        this.inner.onerror = handler;
    }

    get onmessage(): ((message: JSONRPCMessage, extra?: MessageExtraInfo) => void) | undefined {
        return this.messageHandler;
    }

    set onmessage(handler: ((message: JSONRPCMessage, extra?: MessageExtraInfo) => void) | undefined) {
        this.messageHandler = handler;
    }

    async start(): Promise<void> {
        await this.inner.start();
    }

    async close(): Promise<void> {
        await this.inner.close();
    }

    async send(message: JSONRPCMessage, options?: { relatedRequestId?: RequestId }): Promise<void> {
        const record = message as unknown as Record<string, unknown>;
        if (record.id != null && this.listRequestIds.delete(requestKey(record.id as RequestId))) {
            const result = record.result as { tools?: Array<{ name?: string }> } | undefined;
            if (Array.isArray(result?.tools)) {
                const capability = surfaceCapability(resolveToolRequestContext(this.contextProvider));
                message = {
                    ...record,
                    result: {
                        ...result,
                        tools: result.tools.filter(
                            (tool) =>
                                typeof tool.name === "string" && isToolAllowedBySurfaceCapability(tool.name, capability)
                        ),
                    },
                } as unknown as JSONRPCMessage;
            }
        }
        await this.inner.send(message, options);
    }

    private handleIncoming(message: JSONRPCMessage, extra?: MessageExtraInfo): void {
        const record = message as unknown as Record<string, unknown>;
        const method = typeof record.method === "string" ? record.method : "";
        if (method === "tools/list" && record.id != null) {
            this.listRequestIds.add(requestKey(record.id as RequestId));
        }
        if (method === "tools/call" && record.id != null) {
            const params = record.params as { name?: unknown } | undefined;
            const name = typeof params?.name === "string" ? params.name : "";
            if (
                !name ||
                !isToolAllowedBySurfaceCapability(
                    name,
                    surfaceCapability(resolveToolRequestContext(this.contextProvider))
                )
            ) {
                void this.inner.send({
                    jsonrpc: "2.0",
                    id: record.id as RequestId,
                    error: { code: -32601, message: `Tool ${name || "<unknown>"} is outside this surface capability` },
                });
                return;
            }
        }
        withToolRequestContext(resolveToolRequestContext(this.contextProvider), () =>
            this.messageHandler?.(message, extra)
        );
    }
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
    const authorization = request.headers.authorization ?? "";
    const expected = `Bearer ${token}`;
    const actualBytes = Buffer.from(authorization);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function writeError(response: ServerResponse, status: number, message: string): void {
    if (response.headersSent) {
        response.end();
        return;
    }
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(
        JSON.stringify({
            error: message,
            code:
                status === 400
                    ? "INVALID_ARGUMENT"
                    : status === 401
                      ? "UNAUTHORIZED"
                      : status === 404
                        ? "UNAVAILABLE"
                        : "TRANSPORT_FAILED",
            retryable: false,
        })
    );
}

export function availableKronTermToolNames(context: HermesSurfaceContext): string[] {
    const capability = surfaceCapability(context);
    return nativeToolManifest((name) => isToolAllowedBySurfaceCapability(name, capability)).map((tool) => tool.name);
}

export class KronTermToolServer {
    private contextProvider: SurfaceContextProvider;
    private server: Server | null = null;
    private startPromise: Promise<KronTermToolServerDescriptor> | null = null;
    private token = randomBytes(32).toString("base64url");
    private callers = new Map<string, SurfaceContextProvider>();
    private callerTokens = new Map<string, string>();
    private callerIdentities = new Map<string, string>();
    private sessions = new Map<string, { transport: StreamableHTTPServerTransport; token: string }>();
    private transport: StreamableHTTPServerTransport | null = null;
    private scopedTransport: ScopedMcpTransport | null = null;

    constructor(contextProvider: SurfaceContextProvider) {
        this.contextProvider = contextProvider;
        const identity = randomBytes(24).toString("hex");
        this.callers.set(this.token, () => ({ ...this.contextProvider(), nativeCallerId: identity }));
    }

    registerCaller(owner: string, provider: SurfaceContextProvider): string {
        const token = this.callerTokens.get(owner) ?? randomBytes(32).toString("base64url");
        this.callerTokens.set(owner, token);
        const identity = this.callerIdentities.get(owner) ?? randomBytes(24).toString("hex");
        this.callerIdentities.set(owner, identity);
        this.callers.set(token, () => ({ ...provider(), nativeCallerId: identity }));
        return token;
    }

    setContextProvider(contextProvider: SurfaceContextProvider): void {
        this.contextProvider = contextProvider;
    }

    start(): Promise<KronTermToolServerDescriptor> {
        if (!this.startPromise) {
            this.startPromise = this.startInternal();
        }
        return this.startPromise;
    }

    private async startInternal(): Promise<KronTermToolServerDescriptor> {
        const linux = getLinuxDesktopsRuntime();
        const feedbackPositions = new Map<string, { x: number; y: number }>();
        const withFeedback = async <T>(
            surfaceId: string,
            surface: "desktop" | "sandbox",
            input: { action: string; x?: number; y?: number; endX?: number; endY?: number },
            operation: () => Promise<T>
        ) => {
            const action =
                input.action === "tap"
                    ? "click"
                    : input.action === "swipe"
                      ? "drag"
                      : input.action === "key"
                        ? "press"
                        : input.action;
            if (!["click", "drag", "type", "press", "scroll"].includes(action)) return operation();
            const point =
                Number.isFinite(input.x) && Number.isFinite(input.y)
                    ? { x: input.x, y: input.y }
                    : feedbackPositions.get(surfaceId);
            if (point) feedbackPositions.set(surfaceId, point);
            const runid = randomUUID();
            const emit = (phase: "running" | "succeeded" | "failed") =>
                notifyDesktopPetSurfaceActivity({
                    source: "acp",
                    runid,
                    surface,
                    surfaceid: surfaceId,
                    action: action as "click" | "drag" | "type" | "press" | "scroll",
                    phase,
                    point,
                });
            emit("running");
            try {
                const result = await operation();
                emit("succeeded");
                return result;
            } catch (error) {
                emit("failed");
                throw error;
            }
        };
        const sandboxTasks = new SandboxTaskRuntime(linux);
        setLinuxDesktopToolBridge({
            list: () => linux.list(),
            perform: (action) =>
                withFeedback(`vm:${action.desktopId}`, "sandbox", action, () => linux.performAgent(action)),
            startTask: (args) => sandboxTasks.start(args),
            finishTask: (sessionId) => sandboxTasks.finish(sessionId),
        });
        const computers = getComputerTargetsRuntime();
        setProductivityToolBridge({ query: queryProductivity, command: commandProductivity });
        setComputerTargetToolBridge({
            list: () => computers.list(),
            perform: (action) =>
                withFeedback(`device:${action.targetId}`, "desktop", action, () => computers.performAgent(action)),
        });
        setKronTermToolBridge(
            new KronTermNativeToolBridge(() => resolveToolRequestContext(() => this.contextProvider()))
        );
        void warmKronComputerUse().catch((error) =>
            console.log("[kronterm-tools] Native computer-use warmup unavailable", error)
        );
        await this.createTransport();
        const server = createServer((request, response) => {
            void this.handleRequest(request, response);
        });
        server.keepAliveTimeout = 60_000;
        server.requestTimeout = 0;
        server.headersTimeout = 65_000;
        this.server = server;
        const port = await new Promise<number>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => {
                server.removeListener("error", reject);
                const address = server.address();
                if (!address || typeof address === "string") {
                    reject(new Error("KronTerm tool server did not bind a TCP port"));
                    return;
                }
                resolve(address.port);
            });
        });
        return {
            url: `http://127.0.0.1:${port}/mcp`,
            nativeUrl: `http://127.0.0.1:${port}/native`,
            token: this.token,
        };
    }

    private async createTransport(token: string = this.token): Promise<StreamableHTTPServerTransport> {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: randomUUID,
            onsessioninitialized: (sessionId) => {
                this.sessions.set(sessionId, { transport, token });
            },
        });
        const scoped = new ScopedMcpTransport(transport, () =>
            resolveToolRequestContext(this.callers.get(token) ?? (() => null))
        );
        transport.onclose = () => {
            if (transport.sessionId) this.sessions.delete(transport.sessionId);
            if (this.transport === transport) {
                this.transport = null;
                this.scopedTransport = null;
            }
        };
        transport.onerror = (error) => console.log("[kronterm-tools] MCP transport error", error);
        await createToolSessionServer().connect(scoped);
        this.transport = transport;
        this.scopedTransport = scoped;
        return transport;
    }

    private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (request.url !== "/mcp" && request.url !== "/native") {
            writeError(response, 404, "Not found");
            return;
        }
        const callerToken = [...this.callers.keys()].find((token) => isAuthorized(request, token));
        if (!callerToken) {
            response.setHeader("www-authenticate", 'Bearer realm="KronTerm tools"');
            writeError(response, 401, "Unauthorized");
            return;
        }
        if (request.method === "HEAD") {
            response.writeHead(204, { "cache-control": "no-store" });
            response.end();
            return;
        }
        if (request.url === "/native") {
            await withToolRequestContext(this.callers.get(callerToken)(), () =>
                this.handleNativeRequest(request, response)
            );
            return;
        }
        if (!["GET", "POST", "DELETE"].includes(request.method ?? "")) {
            writeError(response, 405, "Method not allowed");
            return;
        }
        const sessionId = request.headers["mcp-session-id"];
        const session = typeof sessionId === "string" ? this.sessions.get(sessionId) : undefined;
        if (sessionId && (!session || session.token !== callerToken)) {
            writeError(response, 404, "MCP session is unavailable for this caller");
            return;
        }
        const transport = session?.transport ?? (await this.createTransport(callerToken));
        try {
            await withToolRequestContext(this.callers.get(callerToken)(), () =>
                transport.handleRequest(request, response)
            );
        } catch (error) {
            console.log("[kronterm-tools] MCP request failed", error);
            writeError(response, 500, error instanceof Error ? error.message : String(error));
        }
    }

    private async handleNativeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
        if (request.method !== "POST") {
            writeError(response, 405, "Method not allowed");
            return;
        }
        try {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of request) {
                const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                size += bytes.length;
                if (size > 2 * 1024 * 1024) {
                    writeError(response, 413, "Request too large");
                    return;
                }
                chunks.push(bytes);
            }
            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                method?: string;
                name?: string;
                arguments?: Record<string, unknown>;
            };
            const capability = surfaceCapability(resolveToolRequestContext(this.contextProvider));
            const tools = registeredTools();
            if (payload.method === "manifest" || payload.method === "list") {
                const manifest = nativeToolManifest((name) =>
                    payload.method === "manifest" ? true : isToolAllowedBySurfaceCapability(name, capability)
                );
                this.writeNativeResponse(response, { tools: manifest });
                return;
            }
            const name = payload.name ?? "";
            const tool = tools[name];
            if (payload.method !== "call" || !tool?.enabled || !isToolAllowedBySurfaceCapability(name, capability)) {
                writeError(response, 404, `Tool ${name || "<unknown>"} is unavailable`);
                return;
            }
            const args = tool.inputSchema
                ? await tool.inputSchema.parseAsync(payload.arguments ?? {})
                : (payload.arguments ?? {});
            const controller = new AbortController();
            const onClose = () => {
                if (!response.writableEnded) controller.abort();
            };
            response.once("close", onClose);
            try {
                const result = await runWithAgentActivitySource("hermes", () =>
                    Promise.resolve(tool.handler(args as Record<string, unknown>, { signal: controller.signal }))
                );
                if (!response.destroyed) this.writeNativeResponse(response, result);
            } finally {
                response.removeListener("close", onClose);
            }
        } catch (error) {
            writeError(response, 400, error instanceof Error ? error.message : String(error));
        }
    }

    private writeNativeResponse(response: ServerResponse, value: unknown): void {
        response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify(value));
    }
}

let toolServer: KronTermToolServer | null = null;

export function startKronTermToolServer(
    contextProvider: SurfaceContextProvider,
    owner: string = "desktop"
): Promise<KronTermToolServerDescriptor> {
    if (!toolServer) {
        toolServer = new KronTermToolServer(contextProvider);
    }
    const token = toolServer.registerCaller(owner, contextProvider);
    return toolServer.start().then((descriptor) => ({ ...descriptor, token }));
}
