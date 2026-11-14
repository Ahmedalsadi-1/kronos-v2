// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { RpcApi } from "../../frontend/app/store/wshclientapi";
import { hasSandboxComputerForTab } from "../computer-access-policy";
import { ElectronWshClient } from "../emain-wsh";
import { withKronosCodeAttachArgs } from "../kronoscode-runtime";
import { KronTermAcpSurfaceSystemPrompt } from "../kronterm-surface-prompt";
import { availableKronTermToolNames, revokeKronTermToolCaller, startKronTermToolServer } from "../kronterm-tool-server";
import { resolveKronTermSharedSkillDirs } from "../shared-skill-roots";
import { detectInstalledAgents, spawnAcpAgent } from "./acp-connector";
import {
    AcpCapabilityLease,
    formatAcpCapabilityLease,
    getAcpHarnessProfile,
    makeAcpCapabilityLease,
} from "./acp-harness";
import { AcpFailureEvidence, makeAcpTraceEnvelope } from "./acp-observability";
import { NdjsonTransport } from "./acp-transport";
import {
    ACP_BACKENDS_ALL,
    AcpAgentCapabilities,
    AcpAgentInfo,
    AcpAgentStatus,
    AcpDetectedAgent,
    AcpEvent,
    AcpEventType,
    AcpIpcConfirmToolRequest,
    AcpIpcSendMessageRequest,
    AcpIpcSetConfigOptionRequest,
    AcpIpcSetModeRequest,
    AcpIpcSetModelRequest,
    AcpModelInfo,
    AcpPendingConfirmation,
    AcpPermissionRequest,
    AcpSessionModes,
    AcpSessionUpdate,
} from "./acp-types";

export function normalizeAcpAgentInfo(backend: string, agentInfo: AcpAgentInfo | null): AcpAgentInfo | null {
    if (backend !== "kronterm-agent" || !agentInfo) {
        return agentInfo;
    }
    return { ...agentInfo, name: ACP_BACKENDS_ALL[backend].name, title: ACP_BACKENDS_ALL[backend].name };
}

interface AcpAgentManagerOptions {
    conversationId: string;
    backend: string;
    workspace?: string;
    cliPath?: string;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    resumeSessionId?: string;
    resumeSessionConversationId?: string;
    surfaceContext?: {
        tabId: string;
        blockId?: string;
        workspaceId?: string;
        workflowRunId?: string;
    };
    mcpServers?: AcpSessionMcpServer[];
    disableBuiltInSurface?: boolean;
    maxReconnectAttempts?: number;
    reconnectDelayMs?: number;
}

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 3;
const DEFAULT_RECONNECT_DELAY_MS = 2000;

const waveSurfaceBootstrap = KronTermAcpSurfaceSystemPrompt;

type AcpSessionMcpNameValue = {
    name: string;
    value: string;
};

type AcpSessionMcpServerStdio = {
    type?: "stdio";
    name: string;
    command: string;
    args: string[];
    env: AcpSessionMcpNameValue[];
};

type AcpSessionMcpServerHttpLike = {
    type: "http" | "sse";
    name: string;
    url: string;
    headers?: AcpSessionMcpNameValue[];
};

type AcpSessionMcpServer = AcpSessionMcpServerStdio | AcpSessionMcpServerHttpLike;

export class AcpAgentManager extends EventEmitter {
    conversationId: string;
    backend: string;
    workspace: string;
    status: AcpAgentStatus = "idle";
    sessionId: string | null = null;
    transport: NdjsonTransport | null = null;
    confirmations: AcpPendingConfirmation[] = [];
    error: string | null = null;
    modes: AcpSessionModes | null = null;
    currentMode: string | null = null;
    configOptions: unknown[] = [];
    modelInfo: AcpModelInfo | null = null;
    agentInfo: unknown = null;
    capabilities: AcpAgentCapabilities | null = null;
    harnessProfile = getAcpHarnessProfile("custom");
    capabilityLease: AcpCapabilityLease | null = null;
    private msgCounter = 0;
    private readonly traceId = uuidv4();
    private readonly traceStartedAt = Date.now();
    private traceLastEventAt = this.traceStartedAt;
    private traceOperationId: string | undefined;
    private surfaceMcpAvailable = false;
    private surfaceInstructionsInjected = false;
    private hasReceivedUsageUpdate = false;
    private readonly hostSurfaceContext:
        { tabId: string; blockId?: string; workspaceId?: string; workflowRunId?: string } | undefined;
    private surfaceContext:
        { tabId: string; blockId?: string; workspaceId?: string; workflowRunId?: string } | undefined;
    private requestedMcpServers: AcpSessionMcpServer[] = [];
    private savedOpts: AcpAgentManagerOptions | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts: number;
    private reconnectDelayMs: number;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private intentionalStop = false;
    private startup: AbortController | undefined;
    private promptTransport: NdjsonTransport | undefined;
    private readonly disableBuiltInSurface: boolean;

    constructor(opts: AcpAgentManagerOptions) {
        super();
        this.conversationId = opts.conversationId;
        this.backend = opts.backend;
        this.harnessProfile = getAcpHarnessProfile(opts.backend);
        this.workspace = opts.workspace || process.cwd();
        this.hostSurfaceContext = opts.surfaceContext;
        this.surfaceContext = opts.surfaceContext;
        this.requestedMcpServers = opts.mcpServers ?? [];
        this.disableBuiltInSurface = opts.disableBuiltInSurface ?? false;
        this.maxReconnectAttempts = opts.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
        this.reconnectDelayMs = opts.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    }

    async initialize(opts: AcpAgentManagerOptions): Promise<void> {
        const startup = new AbortController();
        this.startup = startup;
        this.setStatus("connecting");
        this.savedOpts = opts;
        this.intentionalStop = false;
        this.reconnectAttempts = 0;

        const cliPath = opts.cliPath || opts.backend;
        try {
            const { child, isDetached } = await spawnAcpAgent(
                opts.backend,
                cliPath,
                this.workspace,
                opts.customArgs,
                opts.customEnv,
                startup.signal
            );

            const transport = new NdjsonTransport(child, isDetached, this.workspace);
            if (startup.signal.aborted) {
                transport.kill();
                startup.signal.throwIfAborted();
            }
            this.transport = transport;
            this.setupTransportHandlers();

            const initResult = await transport.initialize();
            startup.signal.throwIfAborted();
            this.capabilities = initResult.capabilities;
            this.modes = initResult.modes;
            this.currentMode = initResult.modes?.currentModeId ?? initResult.modes?.availableModes?.[0]?.id ?? null;
            this.agentInfo = normalizeAcpAgentInfo(this.backend, initResult.agentInfo);
            this.emitEvent("harness_profile", {
                profile: this.harnessProfile,
                advertisedCapabilities: this.capabilities,
            });
            if (initResult.agentInfo) {
                this.emitEvent("agent_info", {
                    agentInfo: initResult.agentInfo,
                    capabilities: this.capabilities,
                });
            }
            if (initResult.modes) {
                this.emitEvent("config_option", {
                    modes: initResult.modes,
                    currentMode: this.currentMode,
                    configOptions: this.configOptions,
                });
            }
            await this.ensureSession(opts.resumeSessionId, opts.resumeSessionConversationId);

            startup.signal.throwIfAborted();
            transport.startKeepalive();
            this.setStatus("connected");
        } catch (err) {
            if (startup.signal.aborted) throw err;
            this.transport?.kill();
            this.transport = null;
            revokeKronTermToolCaller(`acp:${this.conversationId}`);
            this.sessionId = null;
            this.confirmations = [];
            this.error = err instanceof Error ? err.message : String(err);
            this.setStatus("error");
            this.emitEvent("error", { error: this.error }, { source: "initialization", message: this.error });
            throw err;
        } finally {
            if (this.startup === startup) this.startup = undefined;
        }
    }

    private setupTransportHandlers(): void {
        if (!this.transport) return;
        const transport = this.transport;

        transport.on("session_update", (update: AcpSessionUpdate) => {
            if (this.transport !== transport || this.intentionalStop) return;
            this.handleSessionUpdate(update);
        });

        transport.on("permission_request", (data: { id: number; params: AcpPermissionRequest }) => {
            if (this.transport !== transport || this.intentionalStop) {
                transport.sendResponse(data.id, { outcome: { outcome: "cancelled" } });
                return;
            }
            this.handlePermissionRequest(data.id, data.params);
        });

        transport.on("notification", (data: { method: string; params: any }) => {
            if (this.transport !== transport || this.intentionalStop) return;
            if (data.method.includes("model") && data.params) {
                this.modelInfo = data.params.modelInfo ?? data.params;
                this.emitEvent("agent_info", {
                    agentInfo: this.agentInfo,
                    modelInfo: this.modelInfo,
                });
            }
        });

        transport.on("stderr", (data: string) => {
            const message = data.trim();
            if (message) {
                console.debug(`[acp:${this.backend}] ${message}`);
            }
        });

        transport.on("error", (err: Error) => {
            if (this.transport !== transport || this.intentionalStop) return;
            this.error = err.message;
            this.setStatus("error");
            this.emitEvent("error", { error: err.message }, { source: "transport", message: err.message });
        });

        transport.on("disconnect", (data: { code: number | null; signal: NodeJS.Signals | string | null }) => {
            if (this.transport !== transport) {
                return;
            }
            const message = `ACP process exited unexpectedly (code=${data.code ?? "unknown"}, signal=${
                data.signal ?? "none"
            })`;
            this.transport = null;
            revokeKronTermToolCaller(`acp:${this.conversationId}`);
            if (this.intentionalStop) return;
            this.sessionId = null;
            this.confirmations = [];
            this.surfaceMcpAvailable = false;
            this.surfaceInstructionsInjected = false;
            this.error = message;
            this.setStatus("error");
            this.emitEvent("error", { error: message }, { source: "transport", message, signal: data.signal });

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts);
                this.reconnectAttempts++;
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = null;
                    void this.tryReconnect();
                }, delay);
                this.reconnectTimer.unref();
            }
        });
    }

    private handleSessionUpdate(update: AcpSessionUpdate): void {
        const updateType = update.update?.sessionUpdate;
        if (!updateType) return;

        if (updateType === "finish") {
            this.setStatus("finished");
            this.emitEvent("finish", {});
            return;
        }

        if (updateType === "agent_message_chunk") {
            this.emitEvent("agent_message_chunk", update.update.content);
            return;
        }

        if (updateType === "agent_thought_chunk") {
            this.emitEvent("agent_thought_chunk", update.update.content);
            return;
        }

        if (updateType === "tool_call") {
            this.emitEvent(
                "tool_call",
                update.update,
                update.update.status === "failed" ? { source: "tool" } : undefined
            );
            return;
        }

        if (updateType === "tool_call_update") {
            this.emitEvent(
                "tool_call_update",
                update.update,
                update.update.status === "failed" ? { source: "tool" } : undefined
            );
            return;
        }

        if (updateType === "plan") {
            this.emitEvent("plan", update.update);
            return;
        }

        if (updateType === "user_message_chunk") {
            this.emitEvent("user_message", update.update.content);
            return;
        }

        if (updateType === "usage_update") {
            this.hasReceivedUsageUpdate = true;
            this.emitEvent("usage", update.update);
            return;
        }

        if (updateType === "available_commands_update") {
            const commands: Record<string, { name: string; description: string; hint?: string }> = {};
            for (const command of update.update.availableCommands ?? []) {
                const name = command.name?.trim();
                if (!name) {
                    continue;
                }
                commands[name] = {
                    name,
                    description: command.description?.trim() || name,
                    hint: command.input?.hint?.trim(),
                };
            }
            this.emitEvent("slash_commands", { commands });
            return;
        }

        if (updateType === "config_option_update") {
            this.configOptions = update.update.configOptions || [];
            this.setConfigModels();
            this.emitEvent("config_option", update.update);
            return;
        }

        this.emitEvent(updateType as AcpEventType, update.update);
    }

    private handlePermissionRequest(requestId: number, params: AcpPermissionRequest): void {
        const confirmation: AcpPendingConfirmation = {
            id: uuidv4(),
            msgId: uuidv4(),
            requestId,
            callId: params.toolCall?.toolCallId || uuidv4(),
            title: params.toolCall?.title || "Tool Permission Request",
            options: params.options || [],
        };

        this.confirmations.push(confirmation);
        this.emitEvent("tool_permission", {
            requestId,
            confirmation,
            toolCall: params.toolCall,
        });
    }

    private modelConfigOption(): any {
        return this.configOptions.find((option: any) => option?.category === "model" || option?.id === "model");
    }

    private setConfigModels(): void {
        const option = this.modelConfigOption();
        if (!option || !Array.isArray(option.options)) return;
        const flatten = (items: any[]): any[] =>
            items.flatMap((item) =>
                Array.isArray(item?.options)
                    ? flatten(item.options)
                    : [{ id: item?.value, label: item?.name ?? item?.value }]
            );
        this.setSessionModels({
            currentModelId: option.currentValue ?? option.selectedValue,
            availableModels: flatten(option.options),
        });
    }

    private setSessionModels(models: any): void {
        const rawModels =
            models?.availableModels ??
            models?.models ??
            models?.items ??
            models?.data ??
            (Array.isArray(models) ? models : undefined);
        if (!Array.isArray(rawModels)) {
            return;
        }
        const availableModels = rawModels
            .map((model: any) => ({
                id: model?.id ?? model?.modelId ?? model?.name ?? model?.value ?? "",
                label: model?.label ?? model?.displayName ?? model?.name ?? model?.id ?? model?.modelId ?? "",
            }))
            .filter((model: { id: string }) => model.id);
        const currentModelId =
            models?.currentModelId ??
            models?.selectedModelId ??
            models?.current ??
            models?.selected ??
            availableModels[0]?.id ??
            null;
        const current = availableModels.find((model: { id: string }) => model.id === currentModelId);
        this.modelInfo = {
            currentModelId,
            currentModelLabel: current?.label ?? currentModelId,
            canSwitch: availableModels.length > 0,
            availableModels,
        };
        this.emitEvent("agent_info", {
            agentInfo: this.agentInfo,
            modelInfo: this.modelInfo,
        });
    }

    private supportsMcpType(type: "stdio" | "http" | "sse"): boolean {
        if (type === "stdio") {
            // ACP v1 requires stdio; older agents omit this nonstandard capability flag.
            return this.capabilities?.mcpCapabilities?.stdio !== false;
        }
        return Boolean(this.capabilities?.mcpCapabilities?.[type]);
    }

    private normalizeCwdForAgent(cwd?: string): string {
        if (!cwd) {
            return ".";
        }
        if (this.backend === "copilot" || this.backend === "codex") {
            return path.resolve(cwd);
        }
        try {
            const workspaceRoot = path.resolve(this.workspace);
            const requested = path.resolve(cwd);
            const relative = path.relative(workspaceRoot, requested);
            if (!relative) {
                return ".";
            }
            if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
                return relative;
            }
        } catch (err) {
            console.warn(
                `[acp:${this.backend}] failed to normalize cwd: ${err instanceof Error ? err.message : String(err)}`
            );
        }
        return ".";
    }

    private resolveSurfaceServerPath(): string | null {
        const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
        const candidates = [
            process.env.KRONTERM_SURFACE_MCP,
            path.join(process.cwd(), "mcp-kron-term", "dist", "index.js"),
            path.resolve(import.meta.dirname, "..", "..", "mcp-kron-term", "dist", "index.js"),
            resourcesPath ? path.join(resourcesPath, "mcp-kron-term", "dist", "index.js") : null,
        ].filter((candidate): candidate is string => Boolean(candidate));
        return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
    }

    // Prefer the native-proxy entry when present: same stdio contract, but every
    // call lands on the in-process TypeScript tool runtime instead of the
    // wsh-CLI bridge (stale-wsh and bridge-token failures live there).
    private resolveSurfaceSpawnTarget(): { path: string; native: boolean } | null {
        const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
        if (process.env.KRONTERM_SURFACE_MCP) {
            return { path: process.env.KRONTERM_SURFACE_MCP, native: false };
        }
        const nativeCandidates = [
            path.join(process.cwd(), "mcp-kron-term", "dist", "native-proxy.js"),
            path.resolve(import.meta.dirname, "..", "..", "mcp-kron-term", "dist", "native-proxy.js"),
            resourcesPath ? path.join(resourcesPath, "mcp-kron-term", "dist", "native-proxy.js") : null,
        ].filter((candidate): candidate is string => Boolean(candidate));
        const nativeProxy = nativeCandidates.find((candidate) => fs.existsSync(candidate));
        if (nativeProxy) {
            return { path: nativeProxy, native: true };
        }
        const legacy = this.resolveSurfaceServerPath();
        return legacy ? { path: legacy, native: false } : null;
    }

    private normalizeMcpServers(servers: AcpSessionMcpServer[]): AcpSessionMcpServer[] {
        const normalized: AcpSessionMcpServer[] = [];
        for (const server of servers) {
            const rawType = (server as { type?: string })?.type ?? "stdio";
            const type = rawType === "streamable_http" ? "http" : rawType;
            if (type === "http" || type === "sse") {
                const httpServer = server as AcpSessionMcpServerHttpLike;
                if (!this.supportsMcpType(type) || !httpServer?.name || !httpServer.url) {
                    continue;
                }
                normalized.push({
                    type,
                    name: httpServer.name,
                    url: httpServer.url,
                    headers: Array.isArray(httpServer.headers)
                        ? httpServer.headers.filter(
                              (entry) => typeof entry?.name === "string" && typeof entry?.value === "string"
                          )
                        : undefined,
                });
                continue;
            }
            const stdioServer = server as AcpSessionMcpServerStdio;
            if (!this.supportsMcpType("stdio") || !stdioServer?.name || !stdioServer.command) {
                continue;
            }
            normalized.push({
                type: "stdio",
                name: stdioServer.name,
                command: stdioServer.command,
                args: Array.isArray(stdioServer.args) ? stdioServer.args.filter((arg) => typeof arg === "string") : [],
                env: Array.isArray(stdioServer.env)
                    ? stdioServer.env.filter(
                          (entry) => typeof entry?.name === "string" && typeof entry?.value === "string"
                      )
                    : [],
            });
        }
        return normalized;
    }

    get hasSurfaceMcp(): boolean {
        return this.surfaceMcpAvailable;
    }

    private async buildSessionMcpServers(): Promise<AcpSessionMcpServer[]> {
        if (this.disableBuiltInSurface) return this.normalizeMcpServers(this.requestedMcpServers);
        const mcpServers: AcpSessionMcpServer[] = [];
        const spawnTarget = this.resolveSurfaceSpawnTarget();
        if (this.supportsMcpType("stdio") && spawnTarget) {
            const surfaceEnv: AcpSessionMcpNameValue[] = [
                { name: "ELECTRON_RUN_AS_NODE", value: "1" },
                { name: "KRONTERM_WORKSPACE", value: this.workspace },
            ];
            if (spawnTarget.native) {
                const toolServer = await startKronTermToolServer(
                    () => ({ ...this.surfaceContext, agentWorkspace: this.workspace }),
                    `acp:${this.conversationId}`
                );
                surfaceEnv.push({ name: "KRONTERM_NATIVE_TOOL_URL", value: toolServer.nativeUrl });
                surfaceEnv.push({ name: "KRONTERM_NATIVE_TOOL_TOKEN", value: toolServer.token });
            }
            const sharedSkillDirs = resolveKronTermSharedSkillDirs({ cwd: this.workspace });
            if (sharedSkillDirs.length > 0) {
                surfaceEnv.push({ name: "KRONTERM_SHARED_SKILL_DIRS", value: sharedSkillDirs.join(path.delimiter) });
            }
            if (this.surfaceContext?.tabId) {
                const sessionToken = await RpcApi.CreateSurfaceTokenCommand(ElectronWshClient, {
                    tabid: this.surfaceContext.tabId,
                    blockid: this.surfaceContext.blockId ?? "",
                });
                surfaceEnv.push({ name: "KRONTERM_JWT", value: sessionToken.token });
                surfaceEnv.push({ name: "WAVETERM_JWT", value: sessionToken.token });
                surfaceEnv.push({ name: "KRONTERM_TABID", value: sessionToken.tabid });
                surfaceEnv.push({ name: "WAVETERM_TABID", value: sessionToken.tabid });
                if (sessionToken.blockid) {
                    surfaceEnv.push({ name: "KRONTERM_BLOCKID", value: sessionToken.blockid });
                    surfaceEnv.push({ name: "WAVETERM_BLOCKID", value: sessionToken.blockid });
                }
            }
            const wshPath = [
                process.env.KRONTERM_WSH,
                process.env.WAVETERM_WSH,
                process.env.WAVETERM_WSH_BIN,
                path.join(process.cwd(), "wsh"),
            ].find((candidate) => candidate && fs.existsSync(candidate));
            if (fs.existsSync(wshPath)) {
                surfaceEnv.push({ name: "KRONTERM_WSH", value: wshPath });
                surfaceEnv.push({ name: "WAVETERM_WSH", value: wshPath });
            }
            mcpServers.push({
                type: "stdio",
                name: "kron-term",
                command: process.execPath,
                args: [spawnTarget.path],
                env: surfaceEnv,
            });
            this.surfaceMcpAvailable = true;
        } else if (this.supportsMcpType("http")) {
            const toolServer = await startKronTermToolServer(
                () => (this.surfaceContext ? { ...this.surfaceContext } : null),
                `acp:${this.conversationId}`
            );
            mcpServers.push({
                type: "http",
                name: "kron-term",
                url: toolServer.url,
                headers: [{ name: "Authorization", value: `Bearer ${toolServer.token}` }],
            });
            this.surfaceMcpAvailable = true;
        } else {
            this.surfaceMcpAvailable = false;
        }

        mcpServers.push(...this.normalizeMcpServers(this.requestedMcpServers));
        return mcpServers;
    }

    private buildNewSessionParams(resumeSessionId: string | undefined, mcpServers: AcpSessionMcpServer[]) {
        const useMetaResume = Boolean(
            resumeSessionId && (this.backend === "claude" || (this.capabilities as any)?._meta?.claudeCode)
        );
        return {
            cwd: this.normalizeCwdForAgent(this.workspace),
            mcpServers,
            ...(useMetaResume
                ? { _meta: { claudeCode: { options: { resume: resumeSessionId } } } }
                : resumeSessionId
                  ? { resumeSessionId, forkSession: false }
                  : {}),
        };
    }

    private async ensureSession(resumeSessionId?: string, resumeSessionConversationId?: string): Promise<void> {
        const transport = this.transport;
        if (!transport || this.sessionId) {
            return;
        }

        const mcpServers = await this.buildSessionMcpServers();
        if (this.transport !== transport || this.intentionalStop) throw new Error("ACP session stopped during setup");
        let sessionResult: any;
        let usableResumeSessionId = resumeSessionId;
        if (resumeSessionId && resumeSessionConversationId && resumeSessionConversationId !== this.conversationId) {
            console.warn(
                `[acp:${this.backend}] skipping stale session ${resumeSessionId}; it belongs to ${resumeSessionConversationId}, not ${this.conversationId}`
            );
            usableResumeSessionId = undefined;
        }

        if (usableResumeSessionId) {
            if (!this.capabilities?.loadSession) {
                throw new Error("This agent cannot restore its saved session. Start a new chat.");
            }
            sessionResult = await transport.sendRequest("session/load", {
                sessionId: usableResumeSessionId,
                cwd: this.normalizeCwdForAgent(this.workspace),
                mcpServers,
            });
        }
        if (!sessionResult) {
            sessionResult = await transport.sendRequest(
                "session/new",
                this.buildNewSessionParams(usableResumeSessionId, mcpServers)
            );
        }

        if (this.transport !== transport || this.intentionalStop) throw new Error("ACP session stopped during setup");
        this.sessionId = sessionResult?.sessionId || sessionResult?.id || usableResumeSessionId;
        if (!this.sessionId) throw new Error("ACP provider returned no session ID");
        this.emitEvent("session_id", { sessionId: this.sessionId });
        this.modes = sessionResult?.modes ?? this.modes;
        this.configOptions = sessionResult?.configOptions ?? this.configOptions;
        this.setSessionModels(sessionResult?.models);
        this.setConfigModels();
        this.currentMode = this.currentMode ?? this.modes?.currentModeId ?? this.modes?.availableModes?.[0]?.id ?? null;
        if (this.modes || this.configOptions.length > 0) {
            this.emitEvent("config_option", {
                modes: this.modes,
                currentMode: this.currentMode,
                configOptions: this.configOptions,
            });
        }
        if (this.currentMode && this.currentMode !== sessionResult?.modes?.currentModeId) {
            try {
                await transport.sendRequest("session/set_mode", {
                    sessionId: this.sessionId,
                    modeId: this.currentMode,
                });
            } catch (err) {
                console.debug(
                    `[acp:${this.backend}] failed to restore mode ${this.currentMode}: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }
    }

    ownsActiveHostTab(tabId: string): boolean {
        return this.surfaceContext?.tabId === tabId && (this.status === "running" || this.confirmations.length > 0);
    }

    async sendMessage(opts: AcpIpcSendMessageRequest): Promise<string | undefined> {
        if (hasSandboxComputerForTab(this.surfaceContext?.tabId))
            throw new Error(
                "Computer mode requires KronOS Agent. Disable Computer mode before using an external ACP engine with host tools."
            );
        if (!this.transport || !this.transport.isInitialized()) {
            throw new Error("Agent not initialized");
        }

        this.traceOperationId = uuidv4();
        this.setStatus("running");
        await this.ensureSession();

        this.capabilityLease = makeAcpCapabilityLease({
            backend: this.backend,
            capabilities: this.capabilities,
            content: opts.content,
            surfaceAvailable: this.surfaceMcpAvailable,
            workspace: this.workspace,
        });
        this.emitEvent("harness_lease", {
            lease: this.capabilityLease,
            profile: this.harnessProfile,
        });

        let content = opts.content;
        const leaseInstructions = formatAcpCapabilityLease(
            this.capabilityLease,
            this.surfaceMcpAvailable ? availableKronTermToolNames(this.surfaceContext) : []
        );
        if (this.surfaceMcpAvailable && !this.surfaceInstructionsInjected) {
            content = `${waveSurfaceBootstrap}\n\n${leaseInstructions}\n\n[User Request]\n${content}`;
            this.surfaceInstructionsInjected = true;
        } else {
            content = `${leaseInstructions}\n\n[User Request]\n${content}`;
        }
        const promptResult = await this.transport.sendRequest("session/prompt", {
            sessionId: this.sessionId,
            prompt: [{ type: "text", text: content }],
        });
        if (!this.hasReceivedUsageUpdate && typeof promptResult?.usage?.totalTokens === "number") {
            this.emitEvent("usage", promptResult.usage);
        }
        if (this.status === "running") {
            this.setStatus("finished");
            this.emitEvent("finish", { stopReason: promptResult?.stopReason });
        }
        return typeof promptResult?.stopReason === "string" ? promptResult.stopReason : undefined;
    }

    getMode() {
        return {
            mode: this.currentMode ?? "default",
            initialized: Boolean(this.transport?.isInitialized()),
            modes: this.modes,
        };
    }

    async setMode(opts: AcpIpcSetModeRequest): Promise<void> {
        if (this.transport?.isInitialized()) {
            await this.transport.sendRequest("session/set_mode", {
                sessionId: this.sessionId,
                modeId: opts.mode,
            });
        }
        this.currentMode = opts.mode;
        this.emitEvent("config_option", {
            modes: this.modes,
            currentMode: this.currentMode,
            configOptions: this.configOptions,
        });
    }

    getConfigOptions() {
        return { configOptions: this.configOptions };
    }

    async setConfigOption(opts: AcpIpcSetConfigOptionRequest) {
        if (this.transport?.isInitialized()) {
            const result = await this.transport.sendRequest("session/set_config_option", {
                sessionId: this.sessionId,
                configId: opts.configId,
                value: opts.value,
            });
            if (Array.isArray(result?.configOptions)) {
                this.configOptions = result.configOptions;
                this.setConfigModels();
                return { configOptions: this.configOptions };
            }
        }
        this.configOptions = this.configOptions.map((option: any) =>
            option?.id === opts.configId ? { ...option, currentValue: opts.value, selectedValue: opts.value } : option
        );
        this.setConfigModels();
        return { configOptions: this.configOptions };
    }

    getModelInfo() {
        return { modelInfo: this.modelInfo };
    }

    async setModel(opts: AcpIpcSetModelRequest): Promise<{ modelInfo: AcpModelInfo | null }> {
        const modelOption = this.modelConfigOption();
        if (modelOption) {
            await this.setConfigOption({
                conversationId: opts.conversationId,
                configId: modelOption.id,
                value: opts.modelId,
            });
            return this.getModelInfo();
        }
        if (this.transport?.isInitialized()) {
            await this.transport.sendRequest("session/set_model", {
                sessionId: this.sessionId,
                modelId: opts.modelId,
            });
        }
        if (this.modelInfo) {
            const selected = this.modelInfo.availableModels?.find((model) => model.id === opts.modelId);
            this.modelInfo = {
                ...this.modelInfo,
                currentModelId: opts.modelId,
                currentModelLabel: selected?.label ?? opts.modelId,
            };
        }
        this.emitEvent("agent_info", {
            agentInfo: this.agentInfo,
            modelInfo: this.modelInfo,
        });
        return { modelInfo: this.modelInfo };
    }

    async confirmTool(opts: AcpIpcConfirmToolRequest): Promise<void> {
        const confirmationIndex = this.confirmations.findIndex((c) => c.callId === opts.callId);
        if (confirmationIndex === -1) {
            return;
        }

        const confirmation = this.confirmations[confirmationIndex];
        const selectedOption = confirmation.options.find((o) => o.optionId === opts.optionId);
        if (!selectedOption || !this.transport) {
            return;
        }

        this.transport.sendResponse(confirmation.requestId, {
            outcome: { outcome: "selected", optionId: opts.optionId },
        });
        this.confirmations.splice(confirmationIndex, 1);
    }

    /** Ends the current turn but keeps the agent process and session alive for the next prompt. */
    cancelTurn(): void {
        const transport = this.transport;
        if (!transport || !this.sessionId) {
            return;
        }
        if (this.status === "running" || this.confirmations.length > 0) {
            transport.sendNotification("session/cancel", { sessionId: this.sessionId });
        }
        for (const confirmation of this.confirmations) {
            transport.sendResponse(confirmation.requestId, { outcome: { outcome: "cancelled" } });
        }
        this.confirmations = [];
    }

    async stop(): Promise<void> {
        this.intentionalStop = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const transport = this.transport;
        if (transport) {
            if (this.sessionId && (this.status === "running" || this.confirmations.length > 0)) {
                transport.sendNotification("session/cancel", {
                    sessionId: this.sessionId,
                });
            }
            for (const confirmation of this.confirmations) {
                transport.sendResponse(confirmation.requestId, {
                    outcome: { outcome: "cancelled" },
                });
            }
            if (this.sessionId && this.capabilities?.sessionCapabilities?.close) {
                const closeRequest = transport
                    .sendRequest("session/close", { sessionId: this.sessionId })
                    .catch(() => undefined);
                await Promise.race([
                    closeRequest,
                    new Promise((resolve) => {
                        setTimeout(resolve, 2000);
                    }),
                ]);
            }
            transport.kill();
            if (this.transport === transport) {
                this.transport = null;
            }
        }
        this.sessionId = null;
        this.surfaceMcpAvailable = false;
        this.surfaceInstructionsInjected = false;
        this.confirmations = [];
        this.currentMode = this.modes?.currentModeId ?? this.modes?.availableModes?.[0]?.id ?? null;
        this.configOptions = [];
        this.modelInfo = null;
        this.capabilities = null;
        this.capabilityLease = null;
        this.setStatus("idle");
    }

    async rehomeKronosCode(input: {
        baseUrl: string;
        username: string;
        password?: string;
        allowDesktopCapabilities: boolean;
    }): Promise<boolean> {
        if (
            this.backend !== "kronoscode" ||
            !this.savedOpts ||
            this.status === "running" ||
            this.status === "connecting" ||
            this.confirmations.length > 0
        ) {
            return false;
        }
        const surfaceContext = input.allowDesktopCapabilities ? this.hostSurfaceContext : undefined;
        this.surfaceContext = surfaceContext;
        const resumeSessionId = this.sessionId ?? this.savedOpts.resumeSessionId;
        const nextOptions: AcpAgentManagerOptions = {
            ...this.savedOpts,
            customArgs: withKronosCodeAttachArgs(this.savedOpts.customArgs, input.baseUrl),
            customEnv: {
                ...this.savedOpts.customEnv,
                KRONOSCODE_SERVER_USERNAME: input.username,
                ...(input.password ? { KRONOSCODE_SERVER_PASSWORD: input.password } : {}),
            },
            resumeSessionId,
            resumeSessionConversationId: resumeSessionId ? this.conversationId : undefined,
            surfaceContext,
        };
        await this.stop();
        await this.initialize(nextOptions);
        return true;
    }

    private async tryReconnect(): Promise<void> {
        if (this.intentionalStop || !this.savedOpts) {
            return;
        }
        this.setStatus("connecting");
        this.emitEvent("status", { status: "connecting", reconnectAttempt: this.reconnectAttempts });
        try {
            await this.initialize(this.savedOpts);
            if (this.status === "connected") {
                this.emitEvent("status", { status: "connected", reconnected: true });
                this.reconnectAttempts = 0;
            }
        } catch {
            this.emitEvent("error", {
                error: `Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} failed`,
            });
        }
    }

    private setStatus(status: AcpAgentStatus): void {
        this.status = status;
        this.emitEvent("status", { status });
    }

    private emitEvent(type: AcpEventType, data: unknown, failure?: AcpFailureEvidence): void {
        const timestamp = Date.now();
        const sequence = ++this.msgCounter;
        const event: AcpEvent = {
            conversationId: this.conversationId,
            type,
            msgId: `${this.conversationId}-${sequence}`,
            data,
            timestamp,
            trace: makeAcpTraceEnvelope({
                traceId: this.traceId,
                operationId: this.traceOperationId,
                sequence,
                emittedAtMs: timestamp,
                startedAtMs: this.traceStartedAt,
                previousEventAtMs: this.traceLastEventAt,
                backend: this.backend,
                failure,
            }),
        };
        this.traceLastEventAt = timestamp;
        this.emit("event", event);
    }

    static async detectAgents(): Promise<AcpDetectedAgent[]> {
        const agents = await detectInstalledAgents();
        return agents.map((a) => ({
            backend: a.backend,
            name: a.name,
            cliPath: a.cliPath,
            available: a.available,
            avatar: a.avatar,
            description: a.description,
            authRequired: a.authRequired,
            supportsStreaming: a.supportsStreaming,
            acpArgs: a.acpArgs,
            skillsDirs: a.skillsDirs,
            harnessProfile: getAcpHarnessProfile(a.backend),
        }));
    }
}

const agentManagers = new Map<string, AcpAgentManager>();

export function hasRunningExternalAgentForTab(tabId: string): boolean {
    return [...agentManagers.values()].some((manager) => manager.ownsActiveHostTab(tabId));
}

export function getAgentManager(conversationId: string): AcpAgentManager | undefined {
    return agentManagers.get(conversationId);
}

export function createAgentManager(opts: AcpAgentManagerOptions): AcpAgentManager {
    const existing = agentManagers.get(opts.conversationId);
    if (existing) {
        existing.stop().catch(() => {});
        agentManagers.delete(opts.conversationId);
    }

    const manager = new AcpAgentManager(opts);
    agentManagers.set(opts.conversationId, manager);
    return manager;
}

export function removeAgentManager(conversationId: string): void {
    const manager = agentManagers.get(conversationId);
    if (manager) {
        manager.stop().catch(() => {});
        agentManagers.delete(conversationId);
    }
}

export function listAgentManagers() {
    return Array.from(agentManagers.values()).map((manager) => ({
        conversationId: manager.conversationId,
        sessionId: manager.sessionId,
        backend: manager.backend,
        workspace: manager.workspace,
        status: manager.status,
        error: manager.error,
        confirmations: manager.confirmations,
        modes: manager.modes,
        currentMode: manager.currentMode,
        configOptions: manager.configOptions,
        modelInfo: manager.modelInfo,
        capabilities: manager.capabilities,
        harnessProfile: manager.harnessProfile,
        capabilityLease: manager.capabilityLease,
    }));
}

export async function rehomeIdleKronosCodeAgents(input: {
    baseUrl: string;
    username: string;
    password?: string;
    allowDesktopCapabilities: boolean;
}): Promise<void> {
    await Promise.all(
        Array.from(agentManagers.values()).map((manager) =>
            manager.rehomeKronosCode(input).catch((error) => {
                console.warn(
                    `[acp:kronoscode] failed to apply backend connection for ${manager.conversationId}`,
                    error
                );
                return false;
            })
        )
    );
}

export async function stopAllAgentManagers(): Promise<void> {
    const managers = Array.from(agentManagers.values());
    agentManagers.clear();
    await Promise.all(managers.map((manager) => manager.stop().catch(() => {})));
}
