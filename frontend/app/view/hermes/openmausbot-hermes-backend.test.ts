// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    botMessageContent,
    botSessionId,
    OpenMausBotHermesBackend,
    parseBotSessionId,
} from "./openmausbot-hermes-backend";
vi.mock("@/store/global", () => ({ getApi: vi.fn() }));
afterEach(() => vi.useRealTimers());
const id = botSessionId("bot-one", "thread-one");
const message = { id: "m1", role: "bot" as const, kind: "text", text: "Hello", at: 1000 };
describe("Bot shared chat adapter", () => {
    it("preserves bot and thread identities and rejects malformed identifiers", () => {
        expect(parseBotSessionId(id)).toEqual({ botId: "bot-one", threadId: "thread-one" });
        expect(parseBotSessionId("openmausbot:../../secret:thread")).toBeNull();
    });
    it("loads all transcript pages and serves the shared chat REST prefetch", async () => {
        const command = vi
            .fn()
            .mockResolvedValueOnce({ messages: [message], hasMore: true })
            .mockResolvedValueOnce({
                messages: [{ ...message, id: "older", role: "user", text: "Hi" }],
                hasMore: false,
            });
        const backend = new OpenMausBotHermesBackend(() => ({ agentBotCommand: command }) as any);
        const result: any = await backend.apiRequest({
            path: `/api/sessions/${encodeURIComponent(id)}/messages?order=latest&limit=120`,
        });
        expect(result.messages.map((item) => item.content)).toEqual(["Hi", "Hello"]);
        expect(command.mock.calls[1][0]).toEqual({
            action: "history",
            botId: "bot-one",
            threadId: "thread-one",
            before: "m1",
        });
        expect(backend.route("session.history", { session_id: "ordinary" })).toBeUndefined();
    });
    it("resumes an active assistant tail without duplicating its partial history", async () => {
        const command = vi.fn().mockResolvedValue({ messages: [message], busy: true });
        const backend = new OpenMausBotHermesBackend(() => ({ agentBotCommand: command }) as any);
        const result = await backend.history(id);
        expect(result.messages).toEqual([]);
        expect(result.inflight).toMatchObject({ assistant: "Hello", streaming: true });
        backend.stop();
    });
    it("streams new bot output and stops polling after completion", async () => {
        vi.useFakeTimers();
        const command = vi
            .fn()
            .mockResolvedValueOnce({ messages: [] })
            .mockResolvedValueOnce({ ok: true })
            .mockResolvedValueOnce({ messages: [message], busy: false });
        const backend = new OpenMausBotHermesBackend(() => ({ agentBotCommand: command }) as any);
        const events: any[] = [];
        const unsubscribe = backend.onEvent((event) => events.push(event));
        await backend.route("prompt.submit", { session_id: id, text: "Hi" });
        await vi.advanceTimersByTimeAsync(600);
        expect(events.map((event) => event.type)).toEqual(["message.start", "message.delta", "message.complete"]);
        expect(events[2].payload.text).toBe("Hello");
        await vi.advanceTimersByTimeAsync(5000);
        expect(command).toHaveBeenCalledTimes(3);
        unsubscribe();
    });
    it("keeps sensitive cards and approvals in the bot manager", () => {
        expect(botMessageContent({ ...message, kind: "secret", text: "private" })).not.toContain("private");
        expect(botMessageContent({ ...message, kind: "options", card: { title: "Run command?" } })).toContain(
            "Open Bots settings"
        );
    });
    it("interrupts the owning thread and rejects unsupported operations", async () => {
        const command = vi.fn().mockResolvedValue({ ok: true });
        const backend = new OpenMausBotHermesBackend(() => ({ agentBotCommand: command }) as any);
        await backend.route("session.interrupt", { session_id: id });
        expect(command).toHaveBeenCalledWith({ action: "interrupt", botId: "bot-one", threadId: "thread-one" });
        await expect(backend.route("config.set", { session_id: id })).rejects.toThrow("Bots settings");
    });
});
