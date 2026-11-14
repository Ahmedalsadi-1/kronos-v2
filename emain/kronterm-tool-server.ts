import { DelegationPolicy } from "./delegation-policy";
import { DeviceFarmRuntime } from "./device-farm-runtime";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo, RequestId } from "@modelcontextprotocol/sdk/types.js";
import { dialog } from "electron";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import {
    createToolSessionServer,
    server as mcpServer,
    nativeToolManifest,
    setComfyUiToolBridge,
    setComputerTargetToolBridge,
    setKronTermToolBridge,
    setLinuxDesktopToolBridge,
    setN8nWorkflowBridge,
    setProductivityToolBridge,
    setSandboxComputerBridge,
    setSwarmToolBridge,
    setSharedSkillCatalog,
    warmKronComputerUse,
} from "../mcp-kron-term/src/index";
import { isToolAllowedBySurfaceCapability } from "../mcp-kron-term/src/surface-policy";
import { SharedSkillCatalog } from "../mcp-kron-term/src/shared-skills";
import { delimiter } from "node:path";
import { resolveKronTermSharedSkillDirs } from "./shared-skill-roots";
import type { SurfaceCapability } from "../mcp-kron-term/src/wsh-bridge";
import { DefaultComfyOrigin, type ComfyImage, type ComfyRequest, type ComfyWorkflow } from "../frontend/types/comfyui";
import { attributeAgentSurfaceActivity } from "./agent-surface-context";
import {
    hasSandboxComputerGrants,
    hasSeparateChatComputer,
    resolveComputerChatContext,
    sandboxComputerForTab,
    sandboxComputerModeForTab,
    withSandboxComputerScope,
} from "./computer-access-policy";
import { GuestBrowser, GuestFiles, guestPython } from "./computer-plugins/guest-commands";
import { getComputerTargetsRuntime } from "./computer-targets-runtime";
import { notifyDesktopPetSurfaceActivity } from "./emain-pet";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { KronTermNativeToolBridge, runWithAgentActivitySource } from "./kronterm-native-tool-bridge";
import { getLinuxDesktopsRuntime } from "./linux-desktops-runtime";
import { loginOrigin } from "./login-preferences";
import { getLoginPreferences } from "./login-preferences-store";
import { pinWorkflowComputerAction, validateWorkflowComputerGrant, workflowWorkerContext } from "./n8n-worker-scope";
import { commandProductivity, queryProductivity } from "./productivity-runtime";
import { getSandboxLoginBroker } from "./sandbox-login";
import { SandboxTaskRuntime } from "./sandbox-task-runtime";
import { makeSwarmRuntime } from "./swarm-runtime";
import type { SwarmService } from "./swarm-service";
import { assertSwarmToolCall, isSwarmScoped, isSwarmToolAllowed } from "./swarm-target-scope";
import { resolveSwarmWorker, revokeSwarmCaller, swarmToolMutates } from "./swarm-worker-registry";
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
    handler: (
        args: Record<string, unknown>,
        extra: { signal?: AbortSignal; trackOperation?: (operation: Promise<unknown>) => void }
    ) => Promise<unknown> | unknown;
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
        sandboxComputerMode: context.sandboxComputerMode,
        delegationScope: context.delegationScope,
        nativeCallerId: context.nativeCallerId,
        tabId: context.tabId,
        blockId: context.blockId,
        workspaceId: context.workspaceId,
        hostMode: context.hostMode ?? "kronterm",
        capabilities: context.capabilities,
    };
}

function loginAllowsTool(tabId: string, name: string): boolean {
    return (
        !getSandboxLoginBroker().blocksTab(tabId) ||
        ["sandbox_vm_login", "sandbox_vm_status", "tool_search", "delegation_status"].includes(name)
    );
}

function surfaceAllowsTool(context: HermesSurfaceContext, name: string): boolean {
    if (!isSwarmToolAllowed(context, name)) return false;
    if (isSwarmScoped(context)) {
        if (context.hostMode === "web-fullscreen" || !loginAllowsTool(context.tabId, name)) return false;
        if (context.swarmTarget?.kind === "vm") return swarmVmBindingAllows(context);
        const sessionId = context.chatId || context.toolSessionId;
        if (sandboxComputerForTab(context.tabId, sessionId) &&
            sandboxComputerModeForTab(context.tabId, sessionId) !== "hybrid") return false;
        if (context.swarmTarget?.kind === "device")
            return !context.sandboxComputerId || context.sandboxComputerMode === "hybrid";
    }
    return isToolAllowedBySurfaceCapability(name, surfaceCapability(context));
}

function swarmVmBindingAllows(context: HermesSurfaceContext): boolean {
    const sessionId = context.chatId || context.toolSessionId;
    const assigned = sandboxComputerForTab(context.tabId, sessionId);
    const pinned = context.swarmTarget?.desktopId;
    if (!pinned || pinned !== context.sandboxComputerId || hasSeparateChatComputer(pinned, context.tabId, sessionId))
        return false;
    if (context.sandboxComputerMode === "sandbox") return assigned === pinned;
    return !assigned || sandboxComputerModeForTab(context.tabId, sessionId) === "hybrid" || assigned === pinned;
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
                const context = resolveToolRequestContext(this.contextProvider);
                message = {
                    ...record,
                    result: {
                        ...result,
                        tools: result.tools.filter(
                            (tool) => typeof tool.name === "string" && surfaceAllowsTool(context, tool.name)
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
        const caller = resolveToolRequestContext(this.contextProvider);
        if (isSwarmScoped(caller) && /^(resources|prompts)\//.test(method)) {
            if (record.id != null)
                void this.inner.send({
                    jsonrpc: "2.0",
                    id: record.id as RequestId,
                    error: { code: -32601, message: "Swarm attempts cannot use MCP resources or prompts." },
                });
            return;
        }
        if (method === "tools/list" && record.id != null) {
            this.listRequestIds.add(requestKey(record.id as RequestId));
        }
        if (method === "tools/call" && record.id != null) {
            const params = record.params as { name?: unknown; arguments?: Record<string, unknown> } | undefined;
            const name = typeof params?.name === "string" ? params.name : "";
            if (caller?.agentRuntime === "hermes" && hasSandboxComputerGrants() && !caller.toolSessionId) {
                void this.inner.send({
                    jsonrpc: "2.0",
                    id: record.id as RequestId,
                    error: { code: -32601, message: "Computer mode requires the session-scoped native adapter." },
                });
                return;
            }
            if (!name || !loginAllowsTool(caller?.tabId, name) || !surfaceAllowsTool(caller, name)) {
                void this.inner.send({
                    jsonrpc: "2.0",
                    id: record.id as RequestId,
                    error: { code: -32601, message: `Tool ${name || "<unknown>"} is outside this surface capability` },
                });
                return;
            }
            try {
                assertSwarmToolCall(caller, name, params?.arguments ?? {});
            } catch (error) {
                void this.inner.send({
                    jsonrpc: "2.0",
                    id: record.id as RequestId,
                    error: { code: -32602, message: error instanceof Error ? error.message : String(error) },
                });
                return;
            }
        }
        withToolRequestContext(caller, () => this.messageHandler?.(message, extra));
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
    return Object.entries(registeredTools()).flatMap(([name, tool]) =>
        tool.enabled && surfaceAllowsTool(context, name) ? [name] : []
    );
}

export function availableHermesCodingToolNames(context: HermesSurfaceContext): string[] {
    if (!context?.tabId || isSwarmScoped(context) || context.n8nWorkerId || !loginAllowsTool(context.tabId, "terminal")) {
        return [];
    }
    return [
        ...(surfaceAllowsTool(context, "terminal_open") ? ["terminal", "process_manage"] : []),
        ...(surfaceAllowsTool(context, "file_read") ? ["read_file", "write_file", "patch", "search_files"] : []),
    ];
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
    private swarmGuardCallers = new Set<string>();
    getSwarmService?: () => SwarmService;
    private sessions = new Map<string, { transport: StreamableHTTPServerTransport; token: string }>();
    private transport: StreamableHTTPServerTransport | null = null;
    private scopedTransport: ScopedMcpTransport | null = null;

    constructor(contextProvider: SurfaceContextProvider) {
        this.contextProvider = contextProvider;
        setSharedSkillCatalog(
            new SharedSkillCatalog(() =>
                resolveKronTermSharedSkillDirs({
                    cwd: resolveToolRequestContext(this.contextProvider)?.agentWorkspace,
                }).join(delimiter)
            )
        );
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
        this.callers.delete(token);
        const identity = this.callerIdentities.get(owner);
        this.callerIdentities.delete(owner);
        this.delegations.revokeCaller(identity);
        revokeSwarmCaller(identity);
        this.swarmGuardCallers.delete(identity);
        for (const [id, session] of this.sessions) {
            if (session.token !== token) continue;
            void session.transport.close();
            this.sessions.delete(id);
        }
    }

    hasSwarmGuard(owner: string): boolean {
        const caller = this.callerIdentities.get(owner);
        return Boolean(caller && this.swarmGuardCallers.has(caller));
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

    private async invokeWorkflowTool(operation: string, input: Record<string, unknown>, signal?: AbortSignal) {
        const context = resolveToolRequestContext(this.contextProvider);
        const { HermesRuntime } = await import("./hermes-runtime");
        const bridge = new KronTermNativeToolBridge(() => context);
        return bridge.withToolTarget({}, () =>
            HermesRuntime.n8nCommand(
                { ...input, operation } as import("./n8n-workspace").N8nWorkspaceCommand,
                resolveToolRequestContext(() => context),
                signal
            )
        );
    }

    private async startInternal(): Promise<KronTermToolServerDescriptor> {
        const linux = getLinuxDesktopsRuntime();
        const performAgent = (action: Parameters<typeof linux.performAgent>[0]) => {
            const caller = resolveToolRequestContext(this.contextProvider);
            const targetAction = pinWorkflowComputerAction(caller, action);
            if (
                caller?.chatId &&
                caller.sandboxComputerId &&
                !isSwarmScoped(caller) &&
                sandboxComputerForTab(caller.tabId, caller.chatId) !== caller.sandboxComputerId
            )
                throw new Error("The selected sandbox changed. Check Computer mode before retrying.");
            if (hasSeparateChatComputer(targetAction.desktopId, caller?.tabId, caller?.chatId || caller?.toolSessionId))
                throw new Error("This sandbox is granted to another chat.");
            if (isSwarmScoped(caller)) {
                const target = caller.swarmTarget;
                if (
                    target?.kind !== "vm" ||
                    action.desktopId !== target.desktopId ||
                    action.expectedGeneration !== target.generation ||
                    action.assignedAgentId !== `sandbox:${caller.tabId}` ||
                    !swarmVmBindingAllows(caller)
                )
                    throw new Error("Swarm VM control grant changed.");
            }
            return linux.performAgent(targetAction);
        };
        const feedbackPositions = new Map<string, { x: number; y: number }>();
        const withFeedback = async <T>(
            surfaceId: string,
            surface: "desktop" | "sandbox",
            input: {
                action: string;
                x?: number;
                y?: number;
                endX?: number;
                endY?: number;
                expectedGeneration?: number;
                detail?: string;
                filepath?: string;
            },
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
            const visualAction = ["click", "drag", "type", "press", "scroll", "screenshot", "open"].includes(action)
                ? (action as "click" | "drag" | "type" | "press" | "scroll" | "screenshot" | "open")
                : "inspect";
            const point =
                Number.isFinite(input.x) && Number.isFinite(input.y)
                    ? { x: input.x, y: input.y }
                    : feedbackPositions.get(surfaceId);
            if (point) feedbackPositions.set(surfaceId, point);
            const runid = randomUUID();
            const emit = (phase: "running" | "succeeded" | "failed", result?: unknown) =>
                notifyDesktopPetSurfaceActivity(
                    attributeAgentSurfaceActivity({
                        source: "acp",
                        runid,
                        surface,
                        surfaceid: surfaceId,
                        controlgeneration:
                            input.expectedGeneration ??
                            (
                                result as {
                                    target?: { controlGeneration?: number };
                                    desktop?: { controlGeneration?: number };
                                }
                            )?.target?.controlGeneration ??
                            (result as { desktop?: { controlGeneration?: number } })?.desktop?.controlGeneration,
                        action: visualAction,
                        detail: input.detail ?? `${surface === "sandbox" ? "VM" : "Device"} ${input.action}`,
                        filepath: input.filepath,
                        previewimageurl: (result as { imageDataUrl?: string })?.imageDataUrl,
                        phase,
                        point,
                    })
                );
            emit("running");
            try {
                const result = await operation();
                emit("succeeded", result);
                return result;
            } catch (error) {
                emit("failed");
                throw error;
            }
        };
        const sandboxTasks = new SandboxTaskRuntime(linux);
        setN8nWorkflowBridge({
            invoke: (operation, input, signal) => this.invokeWorkflowTool(operation, input, signal),
        });
        setComfyUiToolBridge(async (operation, input, signal) => {
            const context = resolveToolRequestContext(this.contextProvider);
            if (!context?.tabId) throw new Error("Open a workspace tab to use ComfyUI.");
            const bridge = new KronTermNativeToolBridge(() => context);
            return bridge.withToolTarget({}, async () => {
                const { workspaceId } = resolveToolRequestContext(() => context);
                if (!workspaceId) throw new Error("This chat has no owning workspace for ComfyUI.");
                const origin = (input.origin as string) ?? DefaultComfyOrigin;
                const id = input.id as string;
                const requests: Record<typeof operation, ComfyRequest> = {
                    status: { action: "health", origin },
                    submit: { action: "submit", origin, workflow: input.workflow as ComfyWorkflow },
                    job: { action: "refresh", origin, id },
                    image: { action: "image", origin, id, image: input.image as ComfyImage },
                    cancel: { action: "cancel", origin, id },
                };
                const { getComfyUiClient } = await import("./comfyui-runtime");
                const { jobs, nodeTypes, version, imageData } = await getComfyUiClient().execute(
                    requests[operation],
                    workspaceId,
                    signal
                );
                if (imageData) {
                    const [, mimeType, data] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(imageData);
                    return {
                        content: [
                            { type: "text", text: `ComfyUI image: ${(input.image as ComfyImage).filename}` },
                            { type: "image", mimeType, data },
                        ],
                    };
                }
                const result = {
                    origin,
                    version,
                    nodeTypes,
                    jobs: jobs?.slice(0, 50).map(({ id, createdAt, status, images, error }) => ({
                        id,
                        createdAt,
                        status,
                        images,
                        error,
                    })),
                };
                return { content: [{ type: "text", text: JSON.stringify(result) }] };
            });
        });
        setLinuxDesktopToolBridge({
            list: () => linux.list(),
            perform: (action) => withFeedback(`vm:${action.desktopId}`, "sandbox", action, () => performAgent(action)),
            startTask: (args) => {
                const caller = resolveToolRequestContext(this.contextProvider);
                const target = pinWorkflowComputerAction(caller, args);
                if (hasSeparateChatComputer(target.desktopId, caller?.tabId, caller?.chatId || caller?.toolSessionId))
                    throw new Error("This sandbox is granted to another chat.");
                return sandboxTasks.start(target);
            },
            finishTask: (sessionId) => sandboxTasks.finish(sessionId),
        });
        setSandboxComputerBridge(async (tool, args, signal) => {
            if (signal?.aborted) throw new Error("Sandbox request was cancelled.");
            const context = resolveToolRequestContext(this.contextProvider);
            if (tool === "delegation_status")
                return {
                    backend: "kronterm_smart",
                    scope:
                        context?.delegationScope ||
                        (context?.sandboxComputerId && context.sandboxComputerMode !== "hybrid"
                            ? "sandbox"
                            : "inherit"),
                    computerMode: context?.sandboxComputerMode,
                    computerId: context?.sandboxComputerId,
                    sandboxReady: context?.sandboxComputerId
                        ? (await linux.list()).find((desktop) => desktop.id === context.sandboxComputerId)?.ready
                        : false,
                };
            const id = context?.sandboxComputerId;
            if (!id || !context.tabId) throw new Error("Enable Computer mode beside the agent selector first.");
            const desktop = linux.desktop
                ? await linux.desktop(id)
                : (await linux.list()).find((desktop) => desktop.id === id);
            if (!desktop) throw new Error("The selected sandbox computer is unavailable.");
            if (
                (desktop.assignedAgentId?.startsWith("sandbox:") &&
                    desktop.assignedAgentId !== `sandbox:${context.tabId}`) ||
                hasSeparateChatComputer(id, context.tabId, context.chatId || context.toolSessionId)
            )
                throw new Error("Control of this desktop belongs to another workspace or chat. Choose a sandbox again.");
            if (!isSwarmScoped(context) &&
                sandboxComputerForTab(context.tabId, context.chatId || context.toolSessionId) !== id)
                throw new Error("The selected sandbox changed. Check Computer mode before retrying.");
            if (isSwarmScoped(context)) {
                assertSwarmToolCall(context, tool, args);
                if (
                    id !== context.swarmTarget?.desktopId ||
                    !swarmVmBindingAllows(context) ||
                    !desktop.ready ||
                    desktop.controlOwner !== "agent" ||
                    desktop.assignedAgentId !== `sandbox:${context.tabId}` ||
                    desktop.controlGeneration !== context.swarmTarget.generation
                )
                    throw new Error("Swarm VM control grant changed.");
            }
            if (tool === "sandbox_vm_login") {
                if (context.delegationScope) throw new Error("Only the parent chat can request sign-in.");
                const login = getSandboxLoginBroker();
                if (args.action === "status")
                    return login.status(context.tabId, context.toolSessionId, String(args.requestId || ""));
                if (args.action !== "request") throw new Error("Invalid login action.");
                return login.request(
                    context.tabId,
                    context.toolSessionId,
                    String(args.origin || ""),
                    args.account as string
                );
            }
            if (tool === "sandbox_vm_login_preferences") {
                const preferences = getLoginPreferences();
                if (args.action === "list")
                    return { accounts: preferences.list(id, args.origin as string), defaultPolicy: "ask" };
                if (context.delegationScope) throw new Error("Only the parent chat can change login preferences.");
                const origin = loginOrigin(String(args.origin || ""));
                const account = String(args.account || "").trim();
                if (!account || account.length > 160) throw new Error("Provide an account label, never a password.");
                const forget = args.action === "forget";
                if (!forget && args.action !== "remember") throw new Error("Invalid login preference action.");
                const choice = await dialog.showMessageBox({
                    type: "question",
                    title: forget ? "Forget login preference" : "Remember sign-in preference",
                    message: `${account} at ${origin}`,
                    detail: forget
                        ? `Forget this account's sign-in preference for ${desktop.name}? This does not sign out or delete browser cookies.`
                        : `For ${desktop.name} only. Ask first requires your permission for future sign-ins. Automatic records your preference to sign in to this exact website/account without a chat confirmation; 1Password may still require approval. Passwords and cookies are not stored in memory. This preference does not grant screen control or access to your vault.`,
                    buttons: forget
                        ? ["Cancel", "Forget preference"]
                        : ["Ask first", "Automatic for this account", "Cancel"],
                    defaultId: 0,
                    cancelId: forget ? 0 : 2,
                    noLink: true,
                });
                if (signal?.aborted) throw new Error("Login preference request was cancelled.");
                if (forget) {
                    if (choice.response !== 1) return { cancelled: true };
                    preferences.forget(id, origin, account);
                    return { forgotten: true, cookiesDeleted: false };
                }
                if (choice.response === 2) return { cancelled: true };
                return preferences.remember({
                    origin,
                    account,
                    computerId: id,
                    policy: choice.response === 1 ? "automatic" : "ask",
                });
            }
            if (tool === "sandbox_vm_status")
                return {
                    ...desktop,
                    taskContext: {
                        workspaceId: context.workspaceId,
                        tabId: context.tabId,
                        blockId: context.blockId,
                        computerId: id,
                        mode: context.sandboxComputerMode || "sandbox",
                        filesystemsShared: false,
                        guestWorkspace: "/home/cua/workspace",
                        hostProjectRoot: null,
                        transferPolicy:
                            "Explicit copy required. Discover the host project from workspace tools; retain exact host/guest path mappings and verify destination contents before running or editing. No automatic synchronization.",
                    },
                };
            if (desktop.controlOwner !== "agent" || desktop.assignedAgentId !== `sandbox:${context.tabId}`)
                throw new Error("Sandbox access was taken over or revoked. Enable Computer mode again to assign it.");
            if (tool === "sandbox_vm_handback") {
                if (context.delegationScope)
                    throw new Error("Only the parent chat can return sandbox control to the user.");
                const released = await linux.takeover(id, {
                    agentId: desktop.assignedAgentId,
                    generation: desktop.controlGeneration,
                });
                console.log("[computer-access] handback", { tabId: context.tabId, desktopId: id, reason: args.reason });
                return { desktop: released, handedBack: true, handbackReason: args.reason, resumeRequiresUser: true };
            }
            const action = tool === "sandbox_vm_desktop" ? args.action : "exec";
            const command =
                tool === "sandbox_vm_files"
                    ? guestPython(GuestFiles, args)
                    : tool === "sandbox_vm_browser"
                      ? guestPython(GuestBrowser, args)
                      : args.command;
            return withFeedback(
                `vm:${id}`,
                "sandbox",
                {
                    ...args,
                    action: action as string,
                    expectedGeneration: desktop.controlGeneration,
                    detail: `${tool.replace(/_/g, " ")} · ${String(args.action ?? "exec")}`,
                    filepath: tool === "sandbox_vm_files" ? String(args.path ?? "") : undefined,
                },
                async () => {
                    if (tool === "sandbox_vm_files" && args.action === "write") {
                        const text = String(args.text || "");
                        if (Buffer.byteLength(text) > 1048576) throw new Error("File exceeds 1 MB.");
                        const temporaryPath = `${String(args.path)}.kronterm-${randomUUID()}.tmp`;
                        for (let offset = 0; offset < Math.max(1, text.length); offset += 2000) {
                            if (signal?.aborted) throw new Error("Sandbox file write was cancelled.");
                            await performAgent({
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
                        await performAgent({
                            desktopId: id,
                            action: "exec",
                            command: guestPython(GuestFiles, {
                                action: "commit",
                                path: temporaryPath,
                                target: args.path,
                            }),
                            assignedAgentId: desktop.assignedAgentId,
                            expectedGeneration: desktop.controlGeneration,
                        });
                        return { desktopId: id, path: args.path, written: Buffer.byteLength(text) };
                    }
                    const result = await performAgent({
                        ...args,
                        desktopId: id,
                        action: action as any,
                        command: command as string,
                        assignedAgentId: desktop.assignedAgentId,
                        expectedGeneration: desktop.controlGeneration,
                    });
                    if (
                        tool === "sandbox_vm_browser" &&
                        args.action === "state" &&
                        context.toolSessionId &&
                        !context.delegationScope &&
                        !context.n8nWorkerId &&
                        !isSwarmScoped(context) &&
                        !signal?.aborted &&
                        "output" in result
                    ) {
                        let origin: string;
                        try {
                            const response = JSON.parse(result.output);
                            origin = loginOrigin(JSON.parse(response.result.result.value).signInOrigin);
                        } catch {
                            return result;
                        }
                        const login = await getSandboxLoginBroker().request(context.tabId, context.toolSessionId, origin);
                        return { ...result, login };
                    }
                    return result;
                }
            );
        });
        const computers = getComputerTargetsRuntime();
        setProductivityToolBridge({ query: queryProductivity, command: commandProductivity });
        const deviceFarm = new DeviceFarmRuntime(computers);
        const deviceCaller = () => resolveToolRequestContext(this.contextProvider)?.nativeCallerId;
        setComputerTargetToolBridge({
            list: () => computers.list(),
            perform: (action) => {
                const caller = resolveToolRequestContext(this.contextProvider);
                if (isSwarmScoped(caller)) {
                    if (!surfaceAllowsTool(caller, `device_${action.action}`))
                        throw new Error("The swarm device is outside this tab's current control scope.");
                    assertSwarmToolCall(caller, `device_${action.action}`, action);
                    action = { ...action, expectedGeneration: caller.swarmTarget.generation };
                }
                return withFeedback(`device:${action.targetId}`, "desktop", action, () =>
                    deviceFarm.perform(action, caller?.nativeCallerId, isSwarmScoped(caller))
                );
            },
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
        let swarms: SwarmService;
        const inventory = async (context: HermesSurfaceContext) =>
            withToolRequestContext(context, async () => {
                const targets = await new KronTermNativeToolBridge(() => context).swarmTargets();
                const exclusiveVm = context.sandboxComputerId && context.sandboxComputerMode !== "hybrid";
                const desktops = await linux.list();
                for (const desktop of desktops) {
                    if (
                        !desktop.ready ||
                        desktop.status !== "running" ||
                        desktop.controlOwner !== "agent" ||
                        desktop.assignedAgentId !== `sandbox:${context.tabId}` ||
                        hasSeparateChatComputer(desktop.id, context.tabId, context.chatId || context.toolSessionId) ||
                        (exclusiveVm && desktop.id !== context.sandboxComputerId)
                    )
                        continue;
                    targets.push({
                        id: `vm:${desktop.id}`,
                        kind: "vm",
                        label: desktop.name,
                        desktopId: desktop.id,
                        tabId: context.tabId,
                        generation: desktop.controlGeneration,
                        resourceKeys: [`vm:${desktop.id}`],
                    });
                }
                if (exclusiveVm) return targets.filter((target) => target.kind === "vm");
                for (const device of await computers.list()) {
                    if (
                        device.id.startsWith("android-avd:") ||
                        !["booted", "connected"].includes(device.status) ||
                        device.automationPaused ||
                        !device.capabilities.includes("screenshot")
                    )
                        continue;
                    try {
                        await deviceFarm.authorize(device.id, context.nativeCallerId, true);
                    } catch {
                        continue;
                    }
                    targets.push({
                        id: `device:${device.id}`,
                        kind: "device",
                        label: device.name,
                        deviceId: device.id,
                        tabId: context.tabId,
                        generation: device.controlGeneration,
                        resourceKeys: [`device:${device.id}`],
                    });
                }
                return targets;
            });
        this.getSwarmService = () => (swarms ??= makeSwarmRuntime(inventory));
        setSwarmToolBridge((name, args, signal) =>
            this.getSwarmService().command(name, args, resolveToolRequestContext(this.contextProvider), signal)
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
                    reject(new Error("KronOS tool server did not bind a TCP port"));
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
            response.setHeader("www-authenticate", 'Bearer realm="KronOS tools"');
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
                this.handleNativeRequest(request, response, callerToken)
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

    private async handleNativeRequest(request: IncomingMessage, response: ServerResponse, callerToken?: string): Promise<void> {
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
            if (callerToken && !this.callers.has(callerToken)) {
                writeError(response, 401, "Caller authority has ended");
                return;
            }
            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
                method?: string;
                name?: string;
                arguments?: Record<string, unknown>;
                sessionId?: string;
                taskId?: string;
                delegationToken?: string;
                scope?: "sandbox" | "widgets" | "inherit" | null;
                taskCount?: number;
                requiredTools?: string[];
                requireDefaultScope?: boolean;
                childId?: string;
                namesOnly?: boolean;
                guardVersion?: number;
            };
            const fallback = resolveToolRequestContext(this.contextProvider);
            const swarm = resolveSwarmWorker(fallback, payload.sessionId, payload.taskId);
            const caller =
                swarm?.context ??
                (isSwarmScoped(fallback)
                    ? fallback
                    : workflowWorkerContext(fallback, payload.sessionId, payload.taskId));
            const scopedSwarm = isSwarmScoped(caller);
            if (payload.method === "swarm_guard_ready") {
                if (
                    scopedSwarm ||
                    caller.agentRuntime !== "hermes" ||
                    !caller.nativeCallerId ||
                    caller.nativeCallerId !== this.callerIdentities.get("hermes") ||
                    payload.guardVersion !== 1
                )
                    throw new Error("Swarm tool guard must be registered by the managed Hermes runtime.");
                this.swarmGuardCallers.add(caller.nativeCallerId);
                this.writeNativeResponse(response, { ok: true });
                return;
            }
            if (
                scopedSwarm &&
                (payload.delegationToken || !["call", "list", "manifest", "scope"].includes(payload.method))
            )
                throw new Error("Swarm attempts cannot access delegation or management endpoints.");
            if (caller.n8nWorkerId && caller.sandboxComputerGeneration != null)
                validateWorkflowComputerGrant(caller, await getLinuxDesktopsRuntime().list());
            if (payload.method === "delegate_cancel") {
                if (!payload.delegationToken || typeof payload.childId !== "string" || !payload.childId)
                    throw new Error("Delegation cancellation requires a worker identity.");
                this.writeNativeResponse(response, {
                    pending: this.delegations.cancel(payload.delegationToken, payload.childId, caller.nativeCallerId),
                });
                return;
            }
            if (payload.method === "delegate_finish") {
                this.delegations.finish(payload.delegationToken, payload.childId, caller.nativeCallerId);
                this.writeNativeResponse(response, { ok: true });
                return;
            }
            const delegation = payload.delegationToken
                ? await this.delegations.resolve(payload.delegationToken, caller.nativeCallerId, payload.childId)
                : undefined;
            const scopedCaller =
                delegation?.context ??
                (!scopedSwarm &&
                payload.method !== "manifest" &&
                (payload.sessionId || payload.taskId || payload.method === "call")
                    ? resolveComputerChatContext(caller, payload.sessionId, payload.taskId)
                    : caller);
            await withToolRequestContext(scopedCaller, async () => {
                const tools = registeredTools();
                if (payload.method === "scope") {
                    this.writeNativeResponse(response, {
                        scope: { swarm: scopedSwarm },
                        tools: scopedSwarm ? availableKronTermToolNames(scopedCaller).map((name) => ({ name })) : [],
                        builtinTools: availableHermesCodingToolNames(scopedCaller),
                    });
                    return;
                }
                if (payload.method === "delegate_prepare") {
                    if (getSandboxLoginBroker().blocksTab(scopedCaller.tabId))
                        throw new Error("Finish sign-in before delegating another task.");
                    const parentScope = withSandboxComputerScope(scopedCaller);
                    const defaultScope =
                        parentScope.delegationScope ??
                        (parentScope.sandboxComputerId && parentScope.sandboxComputerMode !== "hybrid"
                            ? "sandbox"
                            : "inherit");
                    const scope = payload.scope ?? defaultScope;
                    if (payload.requireDefaultScope && scope !== defaultScope)
                        throw new Error("Split jobs with different permission scopes into separate delegations.");
                    const effectiveScope = parentScope.delegationScope ?? scope;
                    const childScope = { ...parentScope, delegationScope: effectiveScope };
                    const names = [
                        ...availableKronTermToolNames(childScope),
                        ...availableHermesCodingToolNames(childScope),
                    ];
                    const minimumTools =
                        effectiveScope === "sandbox"
                            ? [
                                  "sandbox_vm_status",
                                  "sandbox_vm_exec",
                                  "sandbox_vm_files",
                                  "sandbox_vm_browser",
                                  "sandbox_vm_desktop",
                              ]
                            : effectiveScope === "widgets"
                              ? ["widget_snapshot", "widget_click"]
                              : [];
                    const requiredTools = payload.requiredTools ?? [];
                    if (!Array.isArray(requiredTools)) throw new Error("Required tools must be an array.");
                    this.writeNativeResponse(
                        response,
                        await this.delegations.prepare(
                            parentScope,
                            scope,
                            payload.taskCount ?? 1,
                            [...new Set([...minimumTools, ...requiredTools])],
                            names
                        )
                    );
                    return;
                }
                if (payload.method === "manifest" || payload.method === "list") {
                    const manifest =
                        payload.method === "list" && payload.namesOnly === true
                            ? availableKronTermToolNames(scopedCaller).map((name) => ({ name }))
                            : nativeToolManifest(
                                  (name) =>
                                      (payload.method === "manifest" && !scopedSwarm) ||
                                      surfaceAllowsTool(scopedCaller, name)
                              );
                    this.writeNativeResponse(response, {
                        tools: manifest,
                        scope: {
                            sandbox: !!scopedCaller.sandboxComputerId && scopedCaller.sandboxComputerMode !== "hybrid",
                            computerMode: scopedCaller.sandboxComputerMode,
                            computerId: scopedCaller.sandboxComputerId,
                            delegation: scopedCaller.delegationScope,
                            swarm: scopedSwarm,
                        },
                    });
                    return;
                }
                const name = payload.name ?? "";
                if (payload.method === "call" && !loginAllowsTool(scopedCaller.tabId, name))
                    throw new Error(
                        "Sign-in is private. Finish or cancel the login card before the agent can use other tools."
                    );
                const tool = tools[name];
                if (payload.method !== "call" || !tool?.enabled || !surfaceAllowsTool(scopedCaller, name)) {
                    writeError(response, 404, `Tool ${name || "<unknown>"} is unavailable`);
                    return;
                }
                assertSwarmToolCall(scopedCaller, name, payload.arguments ?? {});
                const args = tool.inputSchema
                    ? await tool.inputSchema.parseAsync(payload.arguments ?? {})
                    : (payload.arguments ?? {});
                assertSwarmToolCall(scopedCaller, name, args as Record<string, unknown>);
                const controller = new AbortController();
                const signal = AbortSignal.any([controller.signal, delegation?.signal, swarm?.signal].filter(Boolean));
                const mutating = swarm
                    ? swarmToolMutates(name, args as Record<string, unknown>, tool.annotations?.readOnlyHint)
                    : tool.annotations?.readOnlyHint !== true;
                const trackOperation = swarm
                    ? (operation: Promise<unknown>) => swarm.trackSettlement(operation, mutating)
                    : delegation?.track;
                const onClose = () => {
                    if (!response.writableEnded) controller.abort();
                };
                response.once("close", onClose);
                if (response.destroyed) onClose();
                try {
                    const invoke = () => {
                        signal.throwIfAborted();
                        const operation = runWithAgentActivitySource(
                            "hermes",
                            async () => {
                                try {
                                    return await tool.handler(args as Record<string, unknown>, {
                                        signal,
                                        trackOperation,
                                    });
                                } catch (error) {
                                    if (!mutating) throw error;
                                    return {
                                        error: error instanceof Error ? error.message : String(error),
                                        failure: {
                                            code: "TOOL_EXECUTION_UNCERTAIN",
                                            uncertain: true,
                                            retryable: false,
                                        },
                                    };
                                }
                            },
                            swarm?.context.swarmSessionId || payload.childId || payload.sessionId,
                            swarm ? scopedCaller.tabId : undefined
                        );
                        delegation?.track(operation);
                        return swarm
                            ? swarm.trackOutcome(name, args as Record<string, unknown>, mutating, operation)
                            : operation;
                    };
                    const result = await (swarm ? swarm.runExclusive(invoke) : invoke());
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

export function getKronTermSwarmService(): SwarmService | undefined {
    return toolServer?.getSwarmService?.();
}

export async function waitForSwarmGuard(signal: AbortSignal): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
        signal.throwIfAborted();
        if (toolServer?.hasSwarmGuard("hermes")) return;
        await delay(50, undefined, { signal });
    }
    throw new Error("The managed Hermes swarm tool guard did not become ready.");
}

export function kronTermToolManifest() {
    return nativeToolManifest(() => true);
}
