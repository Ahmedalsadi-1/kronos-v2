// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { getApi } from "@/store/global";
import type { AgentBotMessage, AgentBotResult } from "@/types/agent-bot";
import type { HermesGatewayEventFrame } from "./kronoscode-hermes-backend";

const Prefix = "openmausbot:";
export function botSessionId(botId: string, threadId: string) {
    return `${Prefix}${botId}:${threadId}`;
}
export function parseBotSessionId(id: unknown) {
    if (typeof id !== "string") return null;
    const match = /^openmausbot:([\w-]{1,128}):([\w-]{1,128})$/.exec(id);
    return match ? { botId: match[1], threadId: match[2] } : null;
}
let pendingFocus: string;
const FocusListeners = new Set<(sessionId: string) => void>();
export function focusBotConversation(sessionId: string) {
    if (!parseBotSessionId(sessionId)) throw new Error("Invalid bot session");
    if (!FocusListeners.size) {
        pendingFocus = sessionId;
        return;
    }
    for (const listener of FocusListeners) listener(sessionId);
}
export function onBotConversationFocus(listener: (sessionId: string) => void) {
    FocusListeners.add(listener);
    if (pendingFocus) {
        const id = pendingFocus;
        pendingFocus = undefined;
        queueMicrotask(() => {
            if (FocusListeners.has(listener)) listener(id);
        });
    }
    return () => {
        FocusListeners.delete(listener);
    };
}
export function botMessageContent(message: AgentBotMessage) {
    if (message.kind === "activity")
        return `${message.tool?.name ?? "Tool"}: ${message.tool?.summary ?? message.tool?.output ?? "Activity"}`;
    if (message.kind === "options")
        return `${message.card?.title ?? "Bot request"}\n${message.card?.answered || message.card?.dismissed || message.card?.expired ? "Request resolved." : "Open Bots settings to review and answer this request."}`;
    if (["secret", "signin", "connector", "screen"].includes(message.kind))
        return "Open Bots settings to view this request or attachment.";
    return message.text ?? `[${message.kind}]`;
}
export class OpenMausBotHermesBackend {
    listeners = new Set<(event: HermesGatewayEventFrame) => void>();
    watching = new Map<
        string,
        { messages: Map<string, string>; timer?: ReturnType<typeof setTimeout>; reply: string; active: boolean }
    >();
    constructor(readonly api = getApi) {}
    onEvent(listener: (event: HermesGatewayEventFrame) => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
            if (!this.listeners.size) this.stop();
        };
    }
    stop() {
        for (const state of this.watching.values()) clearTimeout(state.timer);
        this.watching.clear();
    }
    emit(sessionId: string, type: string, payload: Record<string, unknown>) {
        for (const listener of this.listeners) listener({ type, session_id: sessionId, payload });
    }
    route(method: string, params: Record<string, unknown> = {}): Promise<unknown> | undefined {
        const identity = parseBotSessionId(params.session_id);
        if (!identity) return;
        const sessionId = String(params.session_id);
        if (method === "session.history" || method === "session.resume" || method === "session.activate")
            return this.history(sessionId);
        if (method === "session.interrupt") return this.api().agentBotCommand({ action: "interrupt", ...identity });
        if (method === "session.close") {
            clearTimeout(this.watching.get(sessionId)?.timer);
            this.watching.delete(sessionId);
            return Promise.resolve({ ok: true });
        }
        if (method === "prompt.submit") return this.submit(sessionId, params);
        if (method === "model.options")
            return Promise.resolve({
                provider: "openmausbot",
                model: "bot-configured",
                providers: [{ slug: "openmausbot", name: "Bot settings", models: ["bot-configured"] }],
            });
        return Promise.reject(
            new Error(`Use Bots settings for ${method}. This conversation keeps its original bot configuration.`)
        );
    }
    apiRequest(request: { path: string; method?: string }): Promise<unknown> | undefined {
        const url = new URL(request.path, "http://kronterm.local");
        const match = /^\/api\/sessions\/([^/]+)(\/messages)?$/.exec(url.pathname);
        if (!match) return;
        const sessionId = decodeURIComponent(match[1]);
        const identity = parseBotSessionId(sessionId);
        if (!identity) return;
        if (request.method && request.method !== "GET")
            return Promise.reject(new Error("Manage bot conversations in Bots settings."));
        if (match[2])
            return this.history(sessionId).then((history) => {
                const limit = Math.max(1, Math.min(10000, Number(url.searchParams.get("limit")) || 120));
                const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
                const latest = url.searchParams.get("order") === "latest";
                const end = Math.max(0, history.messages.length - offset);
                const messages = latest
                    ? history.messages.slice(Math.max(0, end - limit), end)
                    : history.messages.slice(offset, offset + limit);
                return {
                    session_id: sessionId,
                    messages,
                    pagination: { limit, offset, order: latest ? "latest" : "oldest", returned: messages.length },
                };
            });
        return this.api()
            .agentBotCommand({ action: "list" })
            .then(({ bots }) => {
                const bot = bots?.find((item) => item.id === identity.botId);
                const task = bot?.tasks.find((item) => item.threadId === identity.threadId);
                if (!bot || (!task && bot.threadId !== identity.threadId))
                    throw new Error("Bot conversation not found");
                return {
                    id: sessionId,
                    title: task?.title ?? bot.name,
                    source: "desktop",
                    model: "bot-configured",
                    provider: "openmausbot",
                    started_at: 0,
                    last_active: 0,
                    ended_at: null,
                    input_tokens: 0,
                    output_tokens: 0,
                    message_count: 0,
                    is_active: !!task?.busy,
                };
            });
    }
    async history(sessionId: string) {
        const identity = parseBotSessionId(sessionId);
        let page = await this.api().agentBotCommand({ action: "history", ...identity });
        const latest = page;
        let messages = page.messages ?? [];
        let pages = 0;
        while (page.hasMore && messages.length && pages++ < 49) {
            const before = messages[0].id;
            page = await this.api().agentBotCommand({ action: "history", ...identity, before });
            if (!page.messages?.length || page.messages[0].id === before)
                throw new Error("Bot history pagination did not advance");
            messages = [...page.messages, ...messages];
        }
        if (page.hasMore) throw new Error("This conversation is too large for shared chat. Open it in Bots settings.");
        const tail = messages.at(-1);
        const inflight = latest.busy && tail?.role === "bot" && tail.kind === "text" ? (tail.text ?? "") : "";
        if (inflight) messages = messages.slice(0, -1);
        if (!this.watching.has(sessionId) && latest.busy) this.watch(sessionId, latest, inflight);
        return {
            session_id: sessionId,
            resumed: sessionId,
            messages: messages.map((message) => ({
                role: message.role === "bot" ? "assistant" : "user",
                content: botMessageContent(message),
                timestamp: message.at / 1000,
            })),
            message_count: messages.length,
            running: !!latest.busy,
            status: latest.busy ? "running" : "idle",
            inflight: inflight ? { assistant: inflight, status: "running", streaming: true } : null,
            info: { agent_backend: "openmausbot", provider: "openmausbot", model: "bot-configured" },
        };
    }
    async submit(sessionId: string, params: Record<string, unknown>) {
        if (Array.isArray(params.attachments) && params.attachments.length)
            throw new Error("Send attachments from Bots settings.");
        const text = typeof params.text === "string" ? params.text : "";
        if (!text.trim()) throw new Error("Enter a message for this bot.");
        const identity = parseBotSessionId(sessionId);
        const initial = await this.api().agentBotCommand({ action: "history", ...identity });
        await this.api().agentBotCommand({ action: "send", ...identity, text, sendId: crypto.randomUUID() });
        this.emit(sessionId, "message.start", {});
        this.watch(sessionId, { ...initial, busy: true });
        return { ok: true };
    }
    watch(sessionId: string, initial: AgentBotResult, initialReply = "") {
        clearTimeout(this.watching.get(sessionId)?.timer);
        const state = {
            messages: new Map((initial.messages ?? []).map((message) => [message.id, botMessageContent(message)])),
            reply: initialReply,
            active: !!initial.busy,
            startedAt: Date.now(),
            timer: undefined as ReturnType<typeof setTimeout>,
        };
        this.watching.set(sessionId, state);
        const poll = async () => {
            if (this.watching.get(sessionId) !== state || !this.listeners.size) return;
            try {
                const page = await this.api().agentBotCommand({ action: "history", ...parseBotSessionId(sessionId) });
                for (const message of page.messages ?? []) {
                    const text = botMessageContent(message);
                    const old = state.messages.get(message.id);
                    if (message.role === "bot" && old !== text) {
                        if (!state.active) {
                            state.active = true;
                            this.emit(sessionId, "message.start", {});
                        }
                        const delta =
                            old != null && text.startsWith(old)
                                ? text.slice(old.length)
                                : `${state.reply ? "\n\n" : ""}${text}`;
                        state.reply += delta;
                        this.emit(sessionId, "message.delta", { text: delta });
                    }
                    state.messages.set(message.id, text);
                }
                if (!page.busy && state.active && (state.reply || Date.now() - state.startedAt >= 3000)) {
                    state.active = false;
                    this.emit(sessionId, "message.complete", { text: state.reply });
                    state.reply = "";
                }
                if (page.busy || state.active) state.timer = setTimeout(poll, 600);
                else this.watching.delete(sessionId);
            } catch (reason) {
                this.emit(sessionId, "error", { message: reason instanceof Error ? reason.message : String(reason) });
                this.watching.delete(sessionId);
            }
        };
        state.timer = setTimeout(poll, 600);
    }
}
