// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import { atom, Provider } from "jotai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BrowserGrabSheet } from "./browser-grab-sheet";

it("exposes working screenshot, context and destination settings and retains review on errors", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const controller = {
        selection: atom({
            page: { title: "Example", sanitizedUrl: "https://example.com" },
            target: { tagName: "button", selector: "#submit", textSnippet: "Submit" },
        }),
        intent: atom("grab"),
        error: atom(""),
        message: atom(""),
        settings: atom({ includeScreenshot: false, depth: "compact", destination: "current" }),
        sendToHermes: vi.fn(async () => {
            throw new Error("Capture failed");
        }),
        setIntent: vi.fn(),
        rearm: vi.fn(),
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        await act(async () =>
            root.render(
                <Provider store={globalStore}>
                    <BrowserGrabSheet controller={controller as any} />
                </Provider>
            )
        );
        await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]').click());
        const selects = container.querySelectorAll("select");
        await act(async () => {
            selects[0].value = "full";
            selects[0].dispatchEvent(new Event("change", { bubbles: true }));
        });
        await act(async () => {
            selects[1].value = "new";
            selects[1].dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(globalStore.get(controller.settings)).toEqual({
            includeScreenshot: true,
            depth: "full",
            destination: "new",
        });
        const textarea = container.querySelector("textarea");
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "Inspect it");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () =>
            [...container.querySelectorAll("button")].find((button) => button.textContent === "Send to Hermes").click()
        );
        expect(controller.sendToHermes).toHaveBeenCalledExactlyOnceWith("Inspect it");
        expect(container.querySelector('[role="alert"]').textContent).toBe("Capture failed");
        expect(textarea.value).toBe("Inspect it");
        await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(controller.setIntent).toHaveBeenCalledWith(null);
    } finally {
        await act(async () => root.unmount());
    }
});
