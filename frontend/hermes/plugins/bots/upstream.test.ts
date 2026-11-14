// @vitest-environment jsdom
import { host } from "@hermes/plugin-sdk";
import { atom } from "nanostores";
import { expect, it, vi } from "vitest";
import HermesBotMode, { sendToGroupChat } from "./upstream/hermes-bot-mode.js";

vi.mock("@hermes/plugin-sdk", async () => {
    const { atom } = await import("nanostores");
    const components = Object.fromEntries(
        [
            "Button",
            "Checkbox",
            "Codicon",
            "ContextMenu",
            "ContextMenuContent",
            "ContextMenuItem",
            "ContextMenuSeparator",
            "ContextMenuTrigger",
            "ConfirmDialog",
            "Dialog",
            "DialogContent",
            "DialogDescription",
            "DialogFooter",
            "DialogHeader",
            "DialogTitle",
            "EmptyState",
            "GlyphSpinner",
            "Input",
            "ScrollArea",
            "SearchField",
            "Select",
            "SelectContent",
            "SelectItem",
            "SelectTrigger",
            "SelectValue",
            "Switch",
            "Textarea",
            "Tip",
            "McpTab",
            "ToolsetConfigPanel",
            "SkillsView",
        ].map((name) => [name, name])
    );
    return {
        ...components,
        atom,
        cn: (...names) => names.filter(Boolean).join(" "),
        COMPOSER_AREAS: { middleware: "composer.middleware" },
        PALETTE_AREA: "palette",
        haptic: vi.fn(),
        profileColor: vi.fn(),
        relativeTime: vi.fn(),
        useQuery: vi.fn(),
        useValue: vi.fn(),
        queryClient: {},
        host: {
            state: { profile: atom("default"), gateway: atom("idle"), storedSessionId: atom("stored-bot-chat") },
            notify: vi.fn(),
            request: vi.fn(),
            getGateway: vi.fn(),
        },
    };
});

it("serializes room turns, routes peer mentions, and leaves failed turns unread", async () => {
    type Event = { session_id: string; type: string; payload: { text?: string; message?: string; admission_id?: string } };
    const listeners = new Set<(event: Event) => void>();
    const emit = (event: Event) => listeners.forEach((listener) => listener(event));
    const gateway = {
        request: vi.fn(async (method, params) => {
            if (method === "session.resume")
                return { session_id: params.profile, session_key: `stored-${params.profile}` };
            return { status: "streaming", admission_id: params.submission_id };
        }),
        onEvent: vi.fn((listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }),
        onState: vi.fn(() => () => {}),
    };
    vi.mocked(host.getGateway).mockReturnValue(gateway as never);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 124));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const disposers: (() => void)[] = [];
    const storage = { get: vi.fn(), set: vi.fn() };
    const submitted = () => gateway.request.mock.calls.filter(([method]) => method === "prompt.submit");
    const members = [{ name: "planner" }, { name: "review", title: "Image Reviewer" }, { name: "writer" }];

    try {
        HermesBotMode.register({
            register: () => () => {},
            onDispose: (dispose) => disposers.push(dispose),
            storage,
        } as any);
        sendToGroupChat("Launch", members, "@planner plan the render");
        await vi.waitFor(() => expect(submitted()).toHaveLength(1));
        sendToGroupChat("Launch", members, "@planner check the revised brief");
        expect(submitted()).toHaveLength(1);

        emit({ session_id: "writer", type: "message.complete", payload: { text: "Wrong room" } });
        emit({
            session_id: "planner",
            type: "message.complete",
            payload: { text: "Stale turn", admission_id: "previous-admission" },
        });
        expect(listeners.size).toBe(1);
        emit({ session_id: "planner", type: "message.complete", payload: { text: "I drafted a plan." } });
        await vi.waitFor(() => expect(submitted()).toHaveLength(2));
        expect(submitted()[1][1].text).toContain("@planner check the revised brief");

        emit({
            session_id: "planner",
            type: "message.complete",
            payload: { text: 'I updated the plan. @"Image Reviewer", check the output.' },
        });
        await vi.waitFor(() => expect(submitted()).toHaveLength(3));
        expect(submitted()[2][1]).toMatchObject({
            session_id: "review",
            text: expect.stringContaining("I updated the plan."),
        });
        emit({ session_id: "review", type: "error", payload: { message: "Render service offline" } });
        await vi.waitFor(() => expect(listeners.size).toBe(0));
        expect(gateway.request).toHaveBeenCalledWith("session.interrupt", { session_id: "review" }, 3000);
        expect(submitted().map(([, params]) => params.session_id)).toEqual(["planner", "planner", "review"]);
        const rooms = storage.set.mock.calls.filter(([key]) => key === "group-chats").at(-1)[1];
        expect(rooms.Launch.log.map((entry) => entry.text)).not.toContain("Wrong room");
        expect(rooms.Launch.log.map((entry) => entry.text)).not.toContain("Stale turn");
        expect(rooms.Launch.watermarks.review).toBeUndefined();
    } finally {
        disposers.forEach((dispose) => dispose());
        vi.unstubAllGlobals();
    }
});

it("keeps /new in the pinned stored conversation and disposes plugin listeners on unload", async () => {
    vi.stubGlobal(
        "requestAnimationFrame",
        vi.fn(() => 123)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const contributions: any[] = [];
    const disposers: (() => void)[] = [];
    try {
        HermesBotMode.register({
            register: (item) => {
                contributions.push(item);
                return () => {};
            },
            onDispose: (dispose) => disposers.push(dispose),
            storage: { get: (key) => (key === "bot-meta" ? { research: { chat: "stored-bot-chat" } } : undefined) },
        } as any);
        await Promise.resolve();
        (host.state.profile as ReturnType<typeof atom<string>>).set("research");
        const middleware = contributions.find((item) => item.id === "mention-middleware").data.handler;
        expect(await middleware({ text: "/new" })).toEqual({ text: "/compact" });
        expect(host.notify).toHaveBeenCalledWith(expect.objectContaining({ title: "This chat never resets" }));
        (host.state.storedSessionId as ReturnType<typeof atom<string>>).set("scratch-chat");
        expect(await middleware({ text: "/new" })).toEqual({ text: "/new" });
        disposers.forEach((dispose) => dispose());
        expect(cancelAnimationFrame).toHaveBeenCalledWith(123);
    } finally {
        vi.unstubAllGlobals();
    }
});
