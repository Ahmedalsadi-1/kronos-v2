import { DelegationPolicy } from "./delegation-policy";
import { DeviceFarmRuntime } from "./device-farm-runtime";
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
    setN8nWorkflowBridge,
    setSandboxComputerBridge,
    warmKronComputerUse,
} from "../mcp-kron-term/src/index";
import { isToolAllowedBySurfaceCapability } from "../mcp-kron-term/src/surface-policy";
import type { SurfaceCapability } from "../mcp-kron-term/src/wsh-bridge";
import {
    hasSandboxComputerGrants,
    resolveComputerChatContext,
    withSandboxComputerScope,
} from "./computer-access-policy";
import { GuestBrowser, GuestFiles, guestPython } from "./computer-plugins/guest-commands";
import { getComputerTargetsRuntime } from "./computer-targets-runtime";
import { notifyDesktopPetSurfaceActivity } from "./emain-pet";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { KronTermNativeToolBridge, runWithAgentActivitySource } from "./kronterm-native-tool-bridge";
import { getLinuxDesktopsRuntime } from "./linux-desktops-runtime";
import { commandProductivity, queryProductivity } from "./productivity-runtime";
import { SandboxTaskRuntime } from "./sandbox-task-runtime";
import { resolveToolRequestContext, withToolRequestContext } from "./tool-request-context";
import { workflowWorkerContext } from "./n8n-worker-scope";

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
    context = withSandboxComputerScope(context);
    if (!context?.tabId) {
        return undefined;
    }
    return {
        token: "electron-owned",
        sandboxComputerId: context.sandboxComputerId,
        delegationScope: context.delegationScope,
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
            const caller = resolveToolRequestContext(this.contextProvider);
            if (caller?.agentRuntime === "hermes" && hasSandboxComputerGrants() && !caller.toolSessionId) {
                void this.inner.send({
                    jsonrpc: "2.0",
                    id: record.id as RequestId,
                    error: { code: -32601, message: "Computer mode requires the session-scoped native adapter." },
                });
                return;
            }
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
    private delegations = new DelegationPolicy(async (id) =>
        (await getLinuxDesktopsRuntime().list()).find((desktop) => desktop.id === id)
    );
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

    unregisterCaller(owner: string): void {
        const token = this.callerTokens.get(owner);
        if (!token) return;
        this.callerTokens.delete(owner);
        this.callerIdentities.delete(owner);
        this.callers.delete(token);
        for (const [id, session] of this.sessions) {
            if (session.token !== token) continue;
            void session.transport.close();
            this.sessions.delete(id);
        }
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
        setN8nWorkflowBridge({
            invoke: async (operation, input, signal) => {
                const context = resolveToolRequestContext(this.contextProvider);
                const { HermesRuntime } = await import("./hermes-runtime");
                return HermesRuntime.n8nCommand({ ...input, operation } as import("./n8n-workspace").N8nWorkspaceCommand, context, signal);
            },
        });
        setLinuxDesktopToolBridge({
            list: () => linux.list(),
            perform: (action) =>
                withFeedback(`vm:${action.desktopId}`, "sandbox", action, () => linux.performAgent(action)),
            startTask: (args) => sandboxTasks.start(args),
            finishTask: (sessionId) => sandboxTasks.finish(sessionId),
        });
        setSandboxComputerBridge(async (tool, args, signal) => {
            if (signal?.aborted) throw new Error("Sandbox request was cancelled.");
            const context = resolveToolRequestContext(this.contextProvider);
            if (tool === "delegation_status")
                return {
                    backend: "kronterm_smart",
                    scope: context?.delegationScope || (context?.sandboxComputerId ? "sandbox" : "inherit"),
                    computerId: context?.sandboxComputerId,
                    sandboxReady: context?.sandboxComputerId
                        ? (await linux.list()).find((desktop) => desktop.id === context.sandboxComputerId)?.ready
                        : false,
                };
            const id = context?.sandboxComputerId;
            if (!id || !context.tabId) throw new Error("Enable Computer mode beside the agent selector first.");
            const desktop = (await linux.list()).find((desktop) => desktop.id === id);
            if (!desktop) throw new Error("The selected sandbox computer is unavailable.");
            if (tool === "sandbox_vm_status") return desktop;
            if (desktop.controlOwner !== "agent" || desktop.assignedAgentId !== `sandbox:${context.tabId}`)
                throw new Error("Sandbox access was taken over or revoked. Enable Computer mode again to assign it.");
            const action = tool === "sandbox_vm_desktop" ? args.action : "exec";
            const command =
                tool === "sandbox_vm_files"
                    ? guestPython(GuestFiles, args)
                    : tool === "sandbox_vm_browser"
                      ? guestPython(GuestBrowser, args)
                      : args.command;
            if (tool === "sandbox_vm_files" && args.action === "write") {
                const text = String(args.text || "");
                if (Buffer.byteLength(text) > 1048576) throw new Error("File exceeds 1 MB.");
                const temporaryPath = `${String(args.path)}.kronterm-${randomUUID()}.tmp`;
                for (let offset = 0; offset < Math.max(1, text.length); offset += 2000) {
                    if (signal?.aborted) throw new Error("Sandbox file write was cancelled.");
                    await linux.performAgent({
                        desktopId: id,
                        action: "exec",
                        command: guestPython(GuestFiles, {
                            ...args,
                            path: temporaryPath,
                            action: offset === 0 ? "write" : "append",
                            text: text.slice(offset, offset + 2000),
                        }),
                        assignedAgentId: desktop.assignedAgentId,
                        expectedGeneration: desktop.controlGeneration,
                    });
                }
                if (signal?.aborted) throw new Error("Sandbox file write was cancelled.");
                await linux.performAgent({
                    desktopId: id,
                    action: "exec",
                    command: guestPython(GuestFiles, { action: "commit", path: temporaryPath, target: args.path }),
                    assignedAgentId: desktop.assignedAgentId,
                    expectedGeneration: desktop.controlGeneration,
                });
                return { desktopId: id, path: args.path, written: Buffer.byteLength(text) };
            }
            return withFeedback(`vm:${id}`, "sandbox", { ...args, action: action as string }, () =>
                linux.performAgent({
                    ...args,
                    desktopId: id,
                    action: action as any,
                    command: command as string,
                    assignedAgentId: desktop.assignedAgentId,
                    expectedGeneration: desktop.controlGeneration,
                })
            );
        });
        const computers = getComputerTargetsRuntime();
        setProductivityToolBridge({ query: queryProductivity, command: commandProductivity });
        const deviceFarm = new DeviceFarmRuntime(computers);
        const deviceCaller = () => resolveToolRequestContext(this.contextProvider)?.nativeCallerId;
        setComputerTargetToolBridge({
            list: () => computers.list(),
            perform: (action) =>
                withFeedback(`device:${action.targetId}`, "desktop", action, () =>
                    deviceFarm.perform(action, deviceCaller())
                ),
            manage: async (name, args) => {
                if (name === "device_assign" || name === "device_batch_boot" || name === "device_batch_start") {
                    const assignees = name === "device_assign" ? [args] : (args.devices as Record<string, unknown>[]);
                    const registered = new Set(
                        [...this.callers.values()].map((provider) => provider()?.nativeCallerId)
                    );
                    if (assignees.some((item) => !registered.has(item.assignee as string)))
                        throw new Error(
                            "Assignee is not a registered native caller. Create the agent and request its device_identity first."
                        );
                }
                return deviceFarm.manage(name, args, deviceCaller());
            },
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
                sessionId?: string;
                taskId?: string;
                delegationToken?: string;
                scope?: "sandbox" | "widgets" | "inherit";
                taskCount?: number;
                requiredTools?: string[];
                childId?: string;
            };
            const caller = workflowWorkerContext(resolveToolRequestContext(this.contextProvider), payload.sessionId, payload.taskId);
            if (payload.method === "delegate_finish") {
                this.delegations.finish(payload.delegationToken, payload.childId, caller.nativeCallerId);
                this.writeNativeResponse(response, { ok: true });
                return;
            }
            const scopedCaller = payload.delegationToken
                ? await this.delegations.resolve(payload.delegationToken, caller.nativeCallerId)
                : payload.method !== "manifest" && (payload.sessionId || payload.taskId || payload.method === "call")
                  ? resolveComputerChatContext(caller, payload.sessionId, payload.taskId)
                  : caller;
            await withToolRequestContext(scopedCaller, async () => {
                const capability = surfaceCapability(resolveToolRequestContext(this.contextProvider));
                const tools = registeredTools();
                if (payload.method === "delegate_prepare") {
                    const jobContext = {
                        ...scopedCaller,
                        delegationScope: scopedCaller.delegationScope || payload.scope,
                    };
                    const names = nativeToolManifest((name) =>
                        isToolAllowedBySurfaceCapability(name, surfaceCapability(jobContext))
                    ).map((tool) => tool.name);
                    this.writeNativeResponse(
                        response,
                        await this.delegations.prepare(
                            scopedCaller,
                            payload.scope,
                            payload.taskCount || 1,
                            payload.requiredTools,
                            names
                        )
                    );
                    return;
                }
                if (payload.method === "manifest" || payload.method === "list") {
                    const manifest = nativeToolManifest((name) =>
                        payload.method === "manifest" ? true : isToolAllowedBySurfaceCapability(name, capability)
                    );
                    this.writeNativeResponse(response, {
                        tools: manifest,
                        scope: {
                            sandbox: !!scopedCaller.sandboxComputerId,
                            computerId: scopedCaller.sandboxComputerId,
                            delegation: scopedCaller.delegationScope,
                        },
                    });
                    return;
                }
                const name = payload.name ?? "";
                const tool = tools[name];
                if (
                    payload.method !== "call" ||
                    !tool?.enabled ||
                    !isToolAllowedBySurfaceCapability(name, capability)
                ) {
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
            });
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

export function revokeKronTermToolCaller(owner: string): void {
    toolServer?.unregisterCaller(owner);
}

export function kronTermToolManifest() {
    return nativeToolManifest(() => true);
}
