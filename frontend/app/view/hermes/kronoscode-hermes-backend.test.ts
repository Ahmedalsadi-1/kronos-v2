// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import {
    acpOptionForHermesChoice,
    KronosCodeHermesBackend,
    translateAcpEvent,
    type AcpEventFrame,
    type HermesGatewayEventFrame,
    type KronosCodeAcpApi,
} from "./kronoscode-hermes-backend";

function makeSession() {
    return {
        conversationId: "c1",
        sessionId: "kronoscode:c1",
        replyText: "",
        turnActive: true,
        tools: new Map(),
        permissions: new Map(),
    };
}

describe("translateAcpEvent", () => {
    it("streams message chunks and completes with the full reply", () => {
        const session = makeSession();
        const event = (type: string, data?: unknown): AcpEventFrame => ({ conversationId: "c1", type, data });
        expect(translateAcpEvent(session, event("agent_message_chunk", { text: "Hel" }))).toEqual([
            { type: "message.delta", session_id: "kronoscode:c1", payload: { text: "Hel" } },
        ]);
        translateAcpEvent(session, event("agent_message_chunk", { type: "text", text: "lo" }));
        expect(translateAcpEvent(session, event("finish"))).toEqual([
            { type: "message.complete", session_id: "kronoscode:c1", payload: { text: "Hello" } },
        ]);
        expect(translateAcpEvent(session, event("finish"))).toEqual([]);
    });

    it("pairs tool_call with its completion", () => {
        const session = makeSession();
        const [start] = translateAcpEvent(session, {
            conversationId: "c1",
            type: "tool_call",
            data: { toolCallId: "t1", title: "Read app.ts", kind: "read", rawInput: { path: "app.ts" } },
        });
        expect(start).toMatchObject({
            type: "tool.start",
            payload: { tool_id: "t1", name: "read", args: { path: "app.ts" }, agent: "kronoscode" },
        });
        const [complete] = translateAcpEvent(session, {
            conversationId: "c1",
            type: "tool_call_update",
            data: {
                toolCallId: "t1",
                status: "completed",
                content: [{ type: "content", content: { type: "text", text: "42 lines" } }],
            },
        });
        expect(complete).toMatchObject({
            type: "tool.complete",
            payload: { tool_id: "t1", name: "read", result: "42 lines", args: { path: "app.ts" } },
        });
    });

    it("turns permission requests into Hermes approvals", () => {
        const session = makeSession();
        const [approval] = translateAcpEvent(session, {
            conversationId: "c1",
            type: "tool_permission",
            data: {
                confirmation: { callId: "p1", msgId: "m1", title: "Run npm test", options: [] },
                toolCall: { rawInput: { command: "npm test" } },
            },
        });
        expect(approval).toMatchObject({
            type: "approval.request",
            payload: { command: "npm test", request_id: "p1" },
        });
        expect(session.permissions.has("p1")).toBe(true);
    });
});

describe("acpOptionForHermesChoice", () => {
    const options = [
        { optionId: "o1", kind: "allow_once" },
        { optionId: "o2", kind: "allow_always" },
        { optionId: "o3", kind: "reject_once" },
    ];
    it("maps each choice", () => {
        expect(acpOptionForHermesChoice(options, "once")).toBe("o1");
        expect(acpOptionForHermesChoice(options, "always")).toBe("o2");
        expect(acpOptionForHermesChoice(options, "deny")).toBe("o3");
        expect(acpOptionForHermesChoice([{ optionId: "a", kind: "allow_once" }], "deny")).toBeUndefined();
    });
});

describe("KronosCodeHermesBackend", () => {
    const stored = new Map<string, AcpSession>();
    const store = {
        GetSession: vi.fn(async (id: string) => stored.get(id)),
        SaveSession: vi.fn(async (session: AcpSession) => {
            stored.set(session.oid, session);
            return session;
        }),
    };
    function makeApi() {
        let listener: ((event: any) => void) | undefined;
        const api = {
            acpDetectAgents: vi.fn(async () => [{ backend: "kronoscode", available: true }]),
            acpInitialize: vi.fn(async () => ({ success: true, state: { modelInfo: { currentModelLabel: "M" } } })),
            acpSendMessage: vi.fn(async () => ({ success: true })),
            acpConfirmTool: vi.fn(async () => ({ success: true })),
            acpCancel: vi.fn(async () => ({ success: true })),
            acpStop: vi.fn(async () => ({ success: true })),
            onAcpEvent: vi.fn((callback: (event: any) => void) => {
                listener = callback;
                return () => undefined;
            }),
        } as unknown as KronosCodeAcpApi;
        return { api, fire: (event: any) => listener?.(event) };
    }

    it("leaves Hermes sessions to the Hermes socket", () => {
        const { api } = makeApi();
        const backend = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            store
        );
        expect(backend.route("session.create", {})).toBeUndefined();
        expect(backend.route("prompt.submit", { session_id: "abc" })).toBeUndefined();
    });

    it("lists detected ACP agents and keeps each chat bound to its selected backend", async () => {
        const { api } = makeApi();
        vi.mocked(api.acpDetectAgents).mockResolvedValue([
            { backend: "codex", name: "Codex", cliPath: "/bin/codex", available: true },
            { backend: "claude", name: "Claude Code", cliPath: "/bin/claude", available: false },
            { backend: "my-agent", name: "My ACP agent", cliPath: "/bin/my-agent", available: true },
        ]);
        const backend = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            store
        );
        expect(await backend.list()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: "codex", label: "Codex", available: true }),
                expect.objectContaining({ id: "claude", available: false }),
                expect.objectContaining({ id: "my-agent", available: true }),
            ])
        );
        backend.setActive("codex");
        const created = (await backend.route("session.create", {})) as { session_id: string; info: any };
        expect(api.acpInitialize).toHaveBeenCalledWith(expect.objectContaining({ backend: "codex" }));
        expect(created.info.agent_backend).toBe("codex");
        backend.setActive("my-agent");
        expect(backend.getSessionBackend(created.session_id)).toBe("codex");
        await backend.route("prompt.submit", { session_id: created.session_id, text: "continue" });
        expect(api.acpInitialize).toHaveBeenCalledTimes(1);
        backend.setActive("hermes");
    });

    it("rejects unavailable ACP agents before launching a process", async () => {
        const { api } = makeApi();
        const backend = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            store
        );
        backend.setActive("missing-agent");
        await expect(backend.route("session.create", {})).rejects.toThrow("not installed or available");
        expect(api.acpInitialize).not.toHaveBeenCalled();
        backend.setActive("hermes");
    });

    it("restores durable history and backend without replaying a prompt", async () => {
        const { api, fire } = makeApi();
        vi.mocked(api.acpInitialize).mockResolvedValue({
            success: true,
            state: { sessionId: "backend-session" },
        } as any);
        const first = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            store
        );
        first.setActive("kronoscode");
        const created = (await first.route("session.create")) as { session_id: string };
        await first.route("prompt.submit", { session_id: created.session_id, text: "hello" });
        const conversationId = created.session_id.slice("kronoscode:".length);
        fire({ conversationId, type: "agent_message_chunk", data: { text: "answer" } });
        fire({ conversationId, type: "finish" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const restored = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            store
        );
        expect(await restored.route("session.resume", { session_id: created.session_id })).toMatchObject({
            messages: [
                { role: "user", content: "hello" },
                { role: "assistant", content: "answer" },
            ],
            info: { agent_backend: "kronoscode" },
            running: false,
        });
        expect(api.acpSendMessage).toHaveBeenCalledTimes(1);
        await restored.route("prompt.submit", { session_id: created.session_id, text: "continue" });
        expect(api.acpInitialize).toHaveBeenLastCalledWith(
            expect.objectContaining({ resumeSessionId: "backend-session", backend: "kronoscode" })
        );
        await expect(restored.route("session.set_model", { session_id: created.session_id })).rejects.toMatchObject({
            code: "UNSUPPORTED_OPERATION",
        });
        first.setActive("hermes");
    });

    it("preserves approvals on invalid choices and backend failures", async () => {
        const { api, fire } = makeApi();
        const backend = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            store
        );
        backend.setActive("kronoscode");
        const created = (await backend.route("session.create")) as { session_id: string };
        fire({
            conversationId: created.session_id.slice("kronoscode:".length),
            type: "tool_permission",
            data: {
                confirmation: {
                    callId: "request",
                    msgId: "message",
                    options: [{ optionId: "allow", kind: "allow_once" }],
                },
            },
        });
        expect(
            await backend.route("approval.respond", {
                session_id: created.session_id,
                request_id: "request",
                choice: "garbage",
            })
        ).toEqual({ resolved: false });
        expect(api.acpConfirmTool).not.toHaveBeenCalled();
        vi.mocked(api.acpConfirmTool).mockResolvedValueOnce({ success: false });
        expect(
            await backend.route("approval.respond", {
                session_id: created.session_id,
                request_id: "request",
                choice: "once",
            })
        ).toEqual({ resolved: false });
        expect(
            await backend.route("approval.respond", {
                session_id: created.session_id,
                request_id: "request",
                choice: "once",
            })
        ).toEqual({ resolved: true });
        expect(
            await backend.route("approval.respond", {
                session_id: created.session_id,
                request_id: "request",
                choice: "once",
            })
        ).toEqual({ resolved: false });
        backend.setActive("hermes");
    });

    it("reports stream save failures and retries the full transcript on close", async () => {
        const { api, fire } = makeApi();
        const failingStore = { GetSession: store.GetSession, SaveSession: vi.fn(store.SaveSession) };
        const backend = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            failingStore
        );
        backend.setActive("kronoscode");
        const frames: HermesGatewayEventFrame[] = [];
        backend.onEvent((frame) => frames.push(frame));
        const created = (await backend.route("session.create")) as { session_id: string };
        await backend.route("prompt.submit", { session_id: created.session_id, text: "hello" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        failingStore.SaveSession.mockRejectedValue(new Error("disk full"));
        const conversationId = created.session_id.slice("kronoscode:".length);
        fire({ conversationId, type: "agent_message_chunk", data: { text: "answer" } });
        fire({ conversationId, type: "finish" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(frames.filter((frame) => frame.payload?.code === "TRANSCRIPT_SAVE_FAILED")).toHaveLength(1);
        await expect(backend.route("session.close", { session_id: created.session_id })).rejects.toThrow("disk full");
        expect(backend.getSessionBackend(created.session_id)).toBe("kronoscode");
        failingStore.SaveSession.mockImplementation(store.SaveSession);
        await backend.route("session.close", { session_id: created.session_id });
        expect(backend.getSessionBackend(created.session_id)).toBeUndefined();
        const restored = new KronosCodeHermesBackend(
            () => api,
            () => undefined,
            store
        );
        expect(await restored.route("session.history", { session_id: created.session_id })).toMatchObject({
            messages: [
                { role: "user", content: "hello" },
                { role: "assistant", content: "answer" },
            ],
        });
        backend.setActive("hermes");
    });

    it("runs a full KronosCode turn through Hermes gateway calls", async () => {
        const { api, fire } = makeApi();
        const backend = new KronosCodeHermesBackend(
            () => api,
            () => ({ tabId: "tab1" }),
            store
        );
        const frames: HermesGatewayEventFrame[] = [];
        backend.onEvent((frame) => frames.push(frame));
        backend.setActive("kronoscode");

        const created = (await backend.route("session.create", { cwd: "/repo" })) as { session_id: string };
        expect(created.session_id.startsWith("kronoscode:")).toBe(true);
        expect(created).toMatchObject({ info: { agent_backend: "kronoscode" } });
        const init = (api.acpInitialize as any).mock.calls[0][0];
        expect(init).toMatchObject({ backend: "kronoscode", workspace: "/repo", surfaceContext: { tabId: "tab1" } });

        await backend.route("prompt.submit", { session_id: created.session_id, text: "fix it" });
        expect(api.acpSendMessage).toHaveBeenCalledWith({ conversationId: init.conversationId, content: "fix it" });
        fire({ conversationId: init.conversationId, type: "agent_message_chunk", data: { text: "done" } });
        fire({ conversationId: init.conversationId, type: "finish" });
        expect(frames.map((frame) => frame.type)).toEqual(["message.start", "message.delta", "message.complete"]);

        await backend.route("session.interrupt", { session_id: created.session_id });
        expect(api.acpCancel).toHaveBeenCalledWith({ conversationId: init.conversationId });
        backend.setActive("hermes");
    });
});
