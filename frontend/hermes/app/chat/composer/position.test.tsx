// @vitest-environment jsdom
import { $composerPosition, $hudComposerPosition, resolveHudComposerEdge } from "@hermes/store/composer-position";
import { $hudMode } from "@hermes/store/hud";
import { useStore } from "@nanostores/react";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ComposerPositionSurface, ComposerPositionToggle } from "./position";
vi.mock("@hermes/store/hud", async () => {
    const { atom } = await import("nanostores");
    return { $hudMode: atom(false) };
});

it("switches composer position without replacing its draft, attachments, or conversation", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const dispose = vi.fn();
    function Composer() {
        useEffect(() => dispose, []);
        return (
            <div data-slot="composer-dock">
                <div contentEditable suppressContentEditableWarning aria-label="Message">
                    Draft
                </div>
                <span>Attached file.ts</span>
                <ComposerPositionToggle />
            </div>
        );
    }
    try {
        $hudMode.set(false);
        $composerPosition.set("bottom");
        await act(async () =>
            root.render(
                <ComposerPositionSurface data-chat-surface="">
                    <header>Chat</header>
                    <main data-slot="composer-bounds">Existing conversation</main>
                    <Composer />
                </ComposerPositionSurface>
            )
        );
        const editor = host.querySelector("[contenteditable]");
        editor.textContent = "Unsent message with widget context";
        const thread = host.querySelector("main");
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Move composer to top"]').click());
        expect(host.firstElementChild.getAttribute("data-composer-position")).toBe("top");
        expect(host.querySelector("[contenteditable]")).toBe(editor);
        expect(editor.textContent).toBe("Unsent message with widget context");
        expect(host.querySelector("main")).toBe(thread);
        expect(host.textContent).toContain("Attached file.ts");
        expect(localStorage.getItem("hermes.desktop.composerPosition")).toBe("top");
        expect(dispose).not.toHaveBeenCalled();
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Move composer to bottom"]').click());
        expect(host.firstElementChild.getAttribute("data-composer-position")).toBe("bottom");
        expect(host.querySelector("[contenteditable]")).toBe(editor);
        await act(async () => {
            $composerPosition.set("top");
            $hudMode.set(true);
        });
        expect(host.firstElementChild.getAttribute("data-composer-position")).toBe("bottom");
        expect($composerPosition.get()).toBe("top");
    } finally {
        await act(async () => root.unmount());
        host.remove();
        $composerPosition.set("bottom");
        $hudMode.set(false);
        vi.unstubAllGlobals();
    }
});

it("restores the saved preference and falls back safely for invalid storage", async () => {
    localStorage.setItem("hermes.desktop.composerPosition", "top");
    vi.resetModules();
    const saved = await import("@hermes/store/composer-position");
    expect(saved.$composerPosition.get()).toBe("top");
    localStorage.setItem("hermes.desktop.composerPosition", "sideways");
    vi.resetModules();
    const invalid = await import("@hermes/store/composer-position");
    expect(invalid.$composerPosition.get()).toBe("bottom");
    localStorage.removeItem("hermes.desktop.composerPosition");
});

it("switches the embedded HUD edge through its existing layout while preserving the live composer", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    const root = createRoot(host);
    const dispose = vi.fn();
    function Hud() {
        const position = useStore($hudComposerPosition);
        useEffect(() => dispose, []);
        return (
            <div data-hud-shell="" data-hud-edge={resolveHudComposerEdge("top", true, false, position)}>
                <ComposerPositionSurface data-chat-surface="">
                    <div data-slot="composer-bounds">Existing HUD conversation</div>
                    <div data-slot="composer-dock">
                        <textarea defaultValue="" />
                        <ComposerPositionToggle hud />
                    </div>
                </ComposerPositionSurface>
            </div>
        );
    }
    try {
        $hudMode.set(true);
        $composerPosition.set("bottom");
        $hudComposerPosition.set("top");
        await act(async () => root.render(<Hud />));
        const editor = host.querySelector("textarea");
        editor.value = "Unsent HUD draft";
        const thread = host.querySelector('[data-slot="composer-bounds"]');
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Move composer to bottom"]').click());
        expect(host.querySelector("[data-hud-shell]").getAttribute("data-hud-edge")).toBe("bottom");
        expect(host.querySelector("textarea")).toBe(editor);
        expect(editor.value).toBe("Unsent HUD draft");
        expect(host.querySelector('[data-slot="composer-bounds"]')).toBe(thread);
        expect(localStorage.getItem("hermes.desktop.hudComposerPosition")).toBe("bottom");
        expect($composerPosition.get()).toBe("bottom");
        expect(resolveHudComposerEdge("top", false, false, "bottom")).toBe("top");
        expect(resolveHudComposerEdge("bottom", true, true, "top")).toBe("bottom");
        expect(dispose).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        $hudMode.set(false);
        $hudComposerPosition.set("top");
        vi.unstubAllGlobals();
    }
});
