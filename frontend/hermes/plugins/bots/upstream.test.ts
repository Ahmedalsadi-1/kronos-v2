// @vitest-environment jsdom
import { host } from "@hermes/plugin-sdk";
import { atom } from "nanostores";
import { expect, it, vi } from "vitest";
import HermesBotMode from "./upstream/hermes-bot-mode.js";

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
        },
    };
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
