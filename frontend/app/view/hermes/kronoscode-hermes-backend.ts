// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Runs KronosCode (ACP) sessions inside the Hermes UI. Hermes speaks its gateway
// protocol (session.create / prompt.submit / approval.respond + streamed events), so
// this adapter answers those requests for `kronoscode:` sessions and replays ACP
// updates as Hermes events. Hermes components then render transcript, tool cards,
// and approvals unchanged.

import { AcpService } from "@/app/store/services";

export class UnsupportedAcpOperationError extends Error {
    readonly code = "UNSUPPORTED_OPERATION";
    constructor(readonly operation: string) {
        super(`ACP does not support ${operation}`);
        this.name = "UnsupportedAcpOperationError";
    }
}

export type HermesAgentBackendId = string;

export type HermesAgentBackendInfo = {
    id: HermesAgentBackendId;
    label: string;
    description: string;
    available: boolean;
};

export type HermesGatewayEventFrame = {
    type: string;
    session_id: string;
    payload?: Record<string, unknown>;
};

export type AcpEventFrame = {
    conversationId: string;
    type: string;
    msgId?: string;
    data?: any;
    timestamp?: number;
};

type AcpPermissionOption = { optionId: string; kind?: string; name?: string };

type KronosCodeSession = {
    conversationId: string;
    sessionId: string;
    backend?: HermesAgentBackendId;
    stored?: AcpSession;
    saveQueue?: Promise<unknown>;
    persistenceErrorReported?: boolean;
    closing?: boolean;
    replyText: string;
    turnActive: boolean;
    tools: Map<string, { name: string; args?: Record<string, unknown>; startedAt: number }>;
    permissions: Map<string, { msgId: string; options: AcpPermissionOption[] }>;
};

export type KronosCodeAcpApi = {
    acpInitialize: ElectronApi["acpInitialize"];
    acpSendMessage: ElectronApi["acpSendMessage"];
    acpConfirmTool: ElectronApi["acpConfirmTool"];
    acpCancel: ElectronApi["acpCancel"];
    acpStop: ElectronApi["acpStop"];
    acpDetectAgents: ElectronApi["acpDetectAgents"];
    onAcpEvent: ElectronApi["onAcpEvent"];
};

export const KronosCodeSessionPrefix = "kronoscode:";
const ActiveBackendStorageKey = "kronterm.hermes.agentBackend";
const SilentFinishGraceMs = 400;

export function isKronosCodeSessionId(value: unknown): value is string {
    return typeof value === "string" && value.startsWith(KronosCodeSessionPrefix);
}

function acpText(content: any): string {
    if (typeof content === "string") {
        return content;
    }
    if (typeof content?.text === "string") {
        return content.text;
    }
    if (typeof content?.content?.text === "string") {
        return content.content.text;
    }
    return "";
}

function toolContentText(content: unknown): string {
    if (!Array.isArray(content)) {
        return "";
    }
    return content
        .map((item: any) => {
            if (item?.type === "diff" && typeof item.path === "string") {
                return `Edited ${item.path}`;
            }
            return acpText(item?.content ?? item);
        })
        .filter(Boolean)
        .join("\n");
}

function toolName(update: any): string {
    const title = typeof update?.title === "string" ? update.title.trim() : "";
    const kind = typeof update?.kind === "string" ? update.kind.trim() : "";
    return kind || title || "tool";
}

function recordArgs(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * Maps a Hermes approval choice onto the closest ACP permission option. ACP option
 * kinds are allow_once / allow_always / reject_once / reject_always.
 */
export function acpOptionForHermesChoice(options: AcpPermissionOption[], choice: string): string | undefined {
    if (!["once", "always", "session", "deny"].includes(choice)) return undefined;
    const wanted =
        choice === "deny"
            ? ["reject_once", "reject_always"]
            : choice === "always" || choice === "session"
              ? ["allow_always", "allow_once"]
              : ["allow_once", "allow_always"];
    for (const kind of wanted) {
        const match = options.find((option) => option.kind === kind);
        if (match) {
            return match.optionId;
        }
    }
    return choice === "deny" ? undefined : options[0]?.optionId;
}

/** Pure translation from one ACP event to zero or more Hermes gateway events. */
export function translateAcpEvent(session: KronosCodeSession, event: AcpEventFrame): HermesGatewayEventFrame[] {
    const sessionId = session.sessionId;
    const frame = (type: string, payload?: Record<string, unknown>): HermesGatewayEventFrame => ({
        type,
        session_id: sessionId,
        payload,
    });
    const data = event.data;
    switch (event.type) {
        case "agent_message_chunk": {
            const text = acpText(data);
            if (!text || !session.turnActive) return [];
            session.replyText += text;
            return [frame("message.delta", { text })];
        }
        case "agent_thought_chunk": {
            const text = acpText(data);
            return text ? [frame("reasoning.delta", { text })] : [];
        }
        case "tool_call": {
            const toolId = String(data?.toolCallId ?? event.msgId ?? "");
            if (!toolId) return [];
            const name = toolName(data);
            const args = recordArgs(data?.rawInput);
            session.tools.set(toolId, { name, args, startedAt: Date.now() });
            const started = frame("tool.start", {
                tool_id: toolId,
                name,
                context: typeof data?.title === "string" ? data.title : undefined,
                args: args ?? {},
                agent: "kronoscode",
            });
            if (data?.status === "completed" || data?.status === "failed") {
                return [started, ...translateAcpEvent(session, { ...event, type: "tool_call_update" })];
            }
            return [started];
        }
        case "tool_call_update": {
            const toolId = String(data?.toolCallId ?? "");
            const status = data?.status;
            if (!toolId || (status !== "completed" && status !== "failed")) return [];
            const known = session.tools.get(toolId);
            session.tools.delete(toolId);
            const result = toolContentText(data?.content);
            return [
                frame("tool.complete", {
                    tool_id: toolId,
                    name: known?.name ?? toolName(data),
                    args: known?.args ?? recordArgs(data?.rawInput) ?? {},
                    result: result || (status === "failed" ? "" : "Done"),
                    error: status === "failed" ? result || "Tool failed" : undefined,
                    duration_s: known ? (Date.now() - known.startedAt) / 1000 : undefined,
                    agent: "kronoscode",
                }),
            ];
        }
        case "tool_permission": {
            const confirmation = data?.confirmation;
            const callId = typeof confirmation?.callId === "string" ? confirmation.callId : "";
            if (!callId) return [];
            session.permissions.set(callId, {
                msgId: String(confirmation.msgId ?? ""),
                options: Array.isArray(confirmation.options) ? confirmation.options : [],
            });
            const rawInput = data?.toolCall?.rawInput;
            const command =
                typeof rawInput?.command === "string"
                    ? rawInput.command
                    : typeof confirmation.title === "string"
                      ? confirmation.title
                      : "KronosCode action";
            return [
                frame("approval.request", {
                    command,
                    description: `KronosCode wants to run: ${confirmation.title ?? "a tool"}`,
                    request_id: callId,
                    choices: ["once", "always", "deny"],
                    allow_permanent: true,
                }),
            ];
        }
        case "finish": {
            if (!session.turnActive) return [];
            session.turnActive = false;
            const text = session.replyText;
            session.replyText = "";
            return [frame("message.complete", { text })];
        }
        case "error": {
            const message = typeof data?.error === "string" ? data.error : "KronosCode reported an error";
            session.turnActive = false;
            return [frame("error", { message })];
        }
        default:
            return [];
    }
}

function readActiveBackend(): HermesAgentBackendId {
    try {
        return window.localStorage.getItem(ActiveBackendStorageKey) || "hermes";
    } catch {
        return "hermes";
    }
}

function currentTabContext(): { tabId: string; blockId?: string } | undefined {
    const params = new URLSearchParams(window.location.search);
    const tabId = params.get("tabId");
    return tabId ? { tabId, blockId: params.get("blockId") ?? undefined } : undefined;
}

export class KronosCodeHermesBackend {
    private active: HermesAgentBackendId = readActiveBackend();
    private sessions = new Map<string, KronosCodeSession>();
    private eventListeners = new Set<(event: HermesGatewayEventFrame) => void>();
    private activeListeners = new Set<(id: HermesAgentBackendId) => void>();
    private removeAcpListener: (() => void) | undefined;
    private getApi: () => KronosCodeAcpApi | undefined;
    private store: Pick<typeof AcpService, "GetSession" | "SaveSession">;
    private resolveTabContext: () => { tabId: string; blockId?: string } | undefined;

    constructor(
        getApi: () => KronosCodeAcpApi | undefined,
        resolveTabContext: () => { tabId: string; blockId?: string } | undefined = currentTabContext,
        store: Pick<typeof AcpService, "GetSession" | "SaveSession"> = AcpService
    ) {
        this.store = store;
        this.getApi = getApi;
        this.resolveTabContext = resolveTabContext;
    }

    async list(): Promise<HermesAgentBackendInfo[]> {
        let agents: Awaited<ReturnType<KronosCodeAcpApi["acpDetectAgents"]>> = [];
        try {
            agents = (await this.getApi()?.acpDetectAgents()) ?? [];
        } catch {
            // Keep the system agent available when ACP discovery fails.
        }
        const engines: HermesAgentBackendInfo[] = [
            {
                id: "hermes",
                label: "KronTerm Agent",
                description: "System agent with full workspace control",
                available: true,
            },
        ];
        for (const agent of agents) {
            if (engines.some((engine) => engine.id === agent.backend)) continue;
            engines.push({
                id: agent.backend,
                label: agent.name || agent.backend,
                description: agent.description || "ACP agent",
                available: agent.available === true,
            });
        }
        if (!engines.some((engine) => engine.id === "kronoscode")) {
            engines.push({ id: "kronoscode", label: "KronosCode", description: "Coding engine", available: false });
        }
        return engines;
    }

    getSessionBackend(sessionId: string): HermesAgentBackendId | undefined {
        return this.sessions.get(sessionId)?.backend;
    }

    getActive(): HermesAgentBackendId {
        return this.active;
    }

    setActive(id: HermesAgentBackendId): void {
        if (id === this.active) return;
        this.active = id;
        try {
            window.localStorage.setItem(ActiveBackendStorageKey, id);
        } catch {
            // Selection just won't persist.
        }
        for (const listener of this.activeListeners) listener(id);
    }

    onActiveChange(listener: (id: HermesAgentBackendId) => void): () => void {
        this.activeListeners.add(listener);
        return () => this.activeListeners.delete(listener);
    }

    onEvent(listener: (event: HermesGatewayEventFrame) => void): () => void {
        this.eventListeners.add(listener);
        this.ensureAcpSubscription();
        return () => this.eventListeners.delete(listener);
    }

    /** Returns a promise when this adapter owns the request, otherwise undefined. */
    route(method: string, params: Record<string, unknown> = {}): Promise<unknown> | undefined {
        if (method === "session.create" && this.active !== "hermes") {
            return this.createSession(params);
        }
        const sessionId = params.session_id;
        if (!isKronosCodeSessionId(sessionId)) {
            return undefined;
        }
        const session = this.sessions.get(sessionId);
        switch (method) {
            case "prompt.submit":
                return this.submit(session, sessionId, params);
            case "session.interrupt":
                return this.interrupt(session);
            case "approval.respond":
                return this.respondToApproval(session, params);
            case "session.close":
                return this.close(session);
            case "session.history":
            case "session.resume":
                return this.history(sessionId);
            default:
                // Hermes-only features (yolo, usage, model switching) have no ACP twin yet.
                return Promise.reject(new UnsupportedAcpOperationError(method));
        }
    }

    private emit(frames: HermesGatewayEventFrame[]): void {
        for (const frame of frames) {
            const session = this.sessions.get(frame.session_id);
            if (session?.stored) {
                if (frame.type === "message.complete") {
                    this.appendMessage(session, { role: "assistant", content: frame.payload?.text ?? "" });
                } else if (frame.type === "tool.complete") {
                    this.appendMessage(session, {
                        role: "tool",
                        tool_call_id: frame.payload?.tool_id,
                        tool_name: frame.payload?.name,
                        name: frame.payload?.name,
                        args: frame.payload?.args,
                        content: frame.payload?.error ?? frame.payload?.result ?? "",
                    });
                } else if (frame.type === "error") {
                    this.appendMessage(session, {
                        role: "assistant",
                        content: session.replyText,
                        error: frame.payload?.message,
                    });
                }
                void this.persist(session).catch((error) => {
                    if (session.persistenceErrorReported) return;
                    session.persistenceErrorReported = true;
                    const failure: HermesGatewayEventFrame = {
                        type: "error",
                        session_id: session.sessionId,
                        payload: {
                            code: "TRANSCRIPT_SAVE_FAILED",
                            message: `Chat history could not be saved. Keep this chat open and retry before restarting. ${error instanceof Error ? error.message : String(error)}`,
                        },
                    };
                    for (const listener of this.eventListeners) listener(failure);
                });
            }
            for (const listener of this.eventListeners) listener(frame);
        }
    }

    private ensureAcpSubscription(): void {
        if (this.removeAcpListener != null) return;
        const api = this.getApi();
        if (!api) return;
        this.removeAcpListener = api.onAcpEvent((event) => {
            const session = [...this.sessions.values()].find(
                (candidate) => candidate.conversationId === event.conversationId
            );
            if (session) {
                this.emit(translateAcpEvent(session, event));
            }
        });
    }

    private async createSession(params: Record<string, unknown>): Promise<unknown> {
        const api = this.getApi();
        if (!api) throw new Error("KronosCode is only available inside KronTerm");
        const backend = this.active;
        const agent = (await api.acpDetectAgents()).find((candidate) => candidate.backend === backend);
        if (!agent?.available) throw new Error(`${agent?.name || backend} is not installed or available`);
        this.ensureAcpSubscription();
        const conversationId = `hermes-kronoscode-${crypto.randomUUID()}`;
        const sessionId = `${KronosCodeSessionPrefix}${conversationId}`;
        const cwd = typeof params.cwd === "string" && params.cwd.trim() ? params.cwd.trim() : undefined;
        const result = await api.acpInitialize({
            conversationId,
            backend,
            cliPath: agent.cliPath,
            customArgs: agent.acpArgs,
            workspace: cwd,
            surfaceContext: this.resolveTabContext(),
        });
        if (!result?.success) {
            throw new Error(result?.error || `${agent.name || backend} failed to start`);
        }
        this.sessions.set(sessionId, {
            backend,
            conversationId,
            sessionId,
            replyText: "",
            turnActive: false,
            tools: new Map(),
            permissions: new Map(),
            stored: {
                otype: "acpsession",
                oid: conversationId,
                version: 0,
                backend,
                workspace: cwd,
                acpsessionid: result.state?.sessionId,
                createdts: Date.now(),
                updatedts: Date.now(),
                events: [],
                meta: { "hermes:adapter": true } as MetaType,
                status: "idle",
            },
        });
        await this.persist(this.sessions.get(sessionId));
        const model = result.state?.modelInfo?.currentModelLabel ?? result.state?.modelInfo?.currentModelId;
        return {
            session_id: sessionId,
            info: { agent_backend: backend, model: model ?? agent.name ?? backend, cwd: cwd ?? null },
        };
    }

    private async submit(
        session: KronosCodeSession | undefined,
        sessionId: string,
        params: Record<string, unknown>
    ): Promise<unknown> {
        session = session ?? (await this.restore(sessionId));
        if (!session) throw new Error("KronosCode session ended. Start a new chat.");
        if (session.closing) throw new Error("This chat is closing");
        if (session.turnActive) throw new Error("KronosCode is already running a turn");
        const api = this.getApi();
        if (!api) throw new Error("KronosCode is only available inside KronTerm");
        if (session.stored?.resumestate === "restart-required" && !session.stored?.acpsessionid)
            throw new Error("This session cannot be resumed safely. Start a new chat.");
        if (session.stored.resumestate === "restart-required") {
            const agent = (await api.acpDetectAgents()).find((item) => item.backend === session.backend);
            const initialized = await api.acpInitialize({
                conversationId: session.conversationId,
                backend: session.backend,
                workspace: session.stored.workspace,
                cliPath: agent?.cliPath,
                customArgs: agent?.acpArgs,
                resumeSessionId: session.stored.acpsessionid,
                resumeSessionConversationId: session.conversationId,
                surfaceContext: this.resolveTabContext(),
            });
            if (!initialized.success) throw new Error(initialized.error || "Session recovery failed");
            session.stored.resumestate = "live";
            this.ensureAcpSubscription();
        }
        const text = typeof params.text === "string" ? params.text : "";
        if (!text.trim()) return { ok: true };
        this.appendMessage(session, { role: "user", content: text });
        session.turnActive = true;
        try {
            await this.persist(session);
        } catch (error) {
            session.turnActive = false;
            session.stored.events.pop();
            throw error;
        }
        session.replyText = "";
        this.emit([{ type: "message.start", session_id: sessionId, payload: {} }]);
        void this.getApi()
            ?.acpSendMessage({ conversationId: session.conversationId, content: text })
            .then((result) => {
                if (!result?.success && session.turnActive) {
                    this.emit(
                        translateAcpEvent(session, {
                            conversationId: session.conversationId,
                            type: "error",
                            data: { error: result?.error || "KronosCode request failed" },
                        })
                    );
                    return;
                }
                // ACP emits `finish` itself; this covers agents that end a turn silently. The
                // grace period lets update events still in the IPC queue land first.
                globalThis.setTimeout(() => {
                    this.emit(translateAcpEvent(session, { conversationId: session.conversationId, type: "finish" }));
                }, SilentFinishGraceMs);
            })
            .catch((error) => {
                this.emit(
                    translateAcpEvent(session, {
                        conversationId: session.conversationId,
                        type: "error",
                        data: { error: error instanceof Error ? error.message : String(error) },
                    })
                );
            });
        return { ok: true };
    }

    private appendMessage(session: KronosCodeSession, message: Record<string, unknown>): void {
        session.stored.events.push({
            messageid: crypto.randomUUID(),
            type: "hermes_message",
            datajson: JSON.stringify(message),
            timestamp: Date.now(),
        });
    }

    private persist(session: KronosCodeSession): Promise<unknown> {
        if (!session?.stored) return Promise.resolve();
        session.stored.status = session.turnActive ? "running" : "idle";
        session.stored.meta["hermes:inflight"] = session.turnActive ? session.replyText : null;
        const snapshot = structuredClone(session.stored);
        session.saveQueue = (session.saveQueue ?? Promise.resolve())
            .catch(() => {})
            .then(async () => {
                const saved = await this.store.SaveSession(snapshot);
                session.persistenceErrorReported = false;
                return saved;
            });
        return session.saveQueue;
    }

    private async restore(sessionId: string): Promise<KronosCodeSession> {
        const existing = this.sessions.get(sessionId);
        if (existing) return existing;
        const conversationId = sessionId.slice(KronosCodeSessionPrefix.length);
        const stored = await this.store.GetSession(conversationId);
        if (!stored || stored.meta?.["hermes:adapter"] !== true) throw new Error("Saved KronosCode session not found");
        stored.resumestate = "restart-required";
        const session: KronosCodeSession = {
            conversationId,
            sessionId,
            backend: stored.backend,
            stored,
            replyText: "",
            turnActive: false,
            tools: new Map(),
            permissions: new Map(),
        };
        this.sessions.set(sessionId, session);
        return session;
    }

    private async history(sessionId: string): Promise<unknown> {
        const session = await this.restore(sessionId);
        const messages = (session.stored?.events ?? [])
            .filter((item) => item.type === "hermes_message")
            .map((item) => ({ ...JSON.parse(item.datajson), timestamp: item.timestamp / 1000 }));
        return {
            session_id: sessionId,
            resumed: sessionId,
            messages,
            message_count: messages.length,
            inflight:
                !session.turnActive && session.stored?.status === "running"
                    ? {
                          assistant: session.stored.meta["hermes:inflight"],
                          status: "interrupted",
                          streaming: false,
                          recoverable: false,
                          error: "The previous turn was interrupted. Send a message to continue explicitly.",
                      }
                    : null,
            running: session.turnActive,
            status: session.turnActive ? "running" : "idle",
            info: { agent_backend: session.backend, cwd: session.stored?.workspace },
        };
    }

    private async interrupt(session: KronosCodeSession | undefined): Promise<unknown> {
        if (!session) return { ok: true };
        await this.getApi()?.acpCancel({ conversationId: session.conversationId });
        return { ok: true };
    }

    private async respondToApproval(
        session: KronosCodeSession | undefined,
        params: Record<string, unknown>
    ): Promise<unknown> {
        if (!session) return { resolved: false };
        const requestId =
            typeof params.request_id === "string" ? params.request_id : [...session.permissions.keys()][0];
        const pending = requestId ? session.permissions.get(requestId) : undefined;
        if (!requestId || !pending) return { resolved: false };
        const choice = String(params.choice ?? "once");
        if (!["once", "always", "session", "deny"].includes(choice)) return { resolved: false };
        const optionId = acpOptionForHermesChoice(pending.options, choice);
        if (!optionId) {
            if (choice !== "deny") return { resolved: false };
            const cancelled = await this.getApi()?.acpCancel({ conversationId: session.conversationId });
            if (!cancelled?.success) return { resolved: false };
            session.permissions.delete(requestId);
            return { resolved: true };
        }
        const result = await this.getApi()?.acpConfirmTool({
            conversationId: session.conversationId,
            msgId: pending.msgId,
            callId: requestId,
            optionId,
        });
        if (!result?.success) return { resolved: false };
        session.permissions.delete(requestId);
        return { resolved: true };
    }

    private async close(session: KronosCodeSession | undefined): Promise<unknown> {
        if (!session) return { ok: true };
        if (session.closing) throw new Error("This chat is already closing");
        session.closing = true;
        try {
            const partial = session.replyText;
            session.turnActive = false;
            await this.getApi()?.acpStop({ conversationId: session.conversationId });
            if (partial)
                this.appendMessage(session, {
                    role: "assistant",
                    content: partial,
                    error: "Turn interrupted when the chat closed",
                });
            session.replyText = "";
            await this.persist(session);
            this.sessions.delete(session.sessionId);
            return { ok: true };
        } finally {
            session.closing = false;
        }
    }
}
