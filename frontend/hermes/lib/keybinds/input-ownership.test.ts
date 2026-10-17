// @vitest-environment jsdom
import { focusComposerInput } from "@hermes/app/chat/composer/focus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deepActiveElement, eventOwnsInput, selectorOwnsInput } from "./input-ownership";

vi.mock("@hermes/components/pane-shell/pane-visibility", () => ({
    queryVisible: () => null,
    queryAllVisible: () => [],
}));
vi.mock("@hermes/components/pane-shell/tree/store", () => ({ $hoveredTreeGroup: { get: () => null } }));
vi.mock("@hermes/app/chat/composer/rich-editor", () => ({ RICH_INPUT_SLOT: "composer-rich-input" }));

afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute("data-kronterm-selector-active");
    vi.restoreAllMocks();
});

describe("external input ownership", () => {
    it("recognizes retargeted shadow-DOM typing, paste and IME events", () => {
        const host = document.createElement("div");
        const shadow = host.attachShadow({ mode: "open" });
        const input = document.createElement("textarea");
        shadow.append(input);
        document.body.append(host);
        input.focus();
        expect(document.activeElement).toBe(host);
        expect(deepActiveElement()).toBe(input);
        for (const type of ["keydown", "paste", "compositionstart", "compositionend"]) {
            let owned = false;
            const listener = (event: Event) => {
                owned = eventOwnsInput(event);
            };
            window.addEventListener(type, listener);
            input.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
            window.removeEventListener(type, listener);
            expect(owned).toBe(true);
        }
    });

    it("keeps selector mode in control before its annotation input receives focus", () => {
        document.documentElement.setAttribute("data-kronterm-selector-active", "");
        expect(selectorOwnsInput()).toBe(true);
        expect(eventOwnsInput(new KeyboardEvent("keydown", { key: "Escape" }))).toBe(true);
        document.documentElement.removeAttribute("data-kronterm-selector-active");
        expect(eventOwnsInput(new KeyboardEvent("keydown", { key: "a" }))).toBe(false);
    });

    it("yields typing and shortcuts to interactive HUD widgets", () => {
        const widget = document.createElement("div");
        widget.dataset.hudInteractive = "true";
        document.body.append(widget);
        let owned = false;
        window.addEventListener(
            "keydown",
            (event) => {
                owned = eventOwnsInput(event);
            },
            { once: true }
        );
        widget.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(owned).toBe(true);
    });

    it("does not let deferred composer focus steal a newly focused annotation field", () => {
        const frames: FrameRequestCallback[] = [];
        const timers: (() => void)[] = [];
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
            frames.push(callback);
            return 1;
        });
        vi.spyOn(window, "setTimeout").mockImplementation((callback) => {
            timers.push(callback as () => void);
            return 1 as unknown as ReturnType<typeof window.setTimeout>;
        });
        const composer = document.createElement("textarea");
        document.body.append(composer);
        focusComposerInput(composer);
        expect(document.activeElement).toBe(composer);
        const host = document.createElement("div");
        const input = document.createElement("textarea");
        host.attachShadow({ mode: "open" }).append(input);
        document.body.append(host);
        input.focus();
        frames.forEach((callback) => callback(0));
        timers.forEach((callback) => callback());
        expect(deepActiveElement()).toBe(input);
        expect(composer.value).toBe("");
    });
});
