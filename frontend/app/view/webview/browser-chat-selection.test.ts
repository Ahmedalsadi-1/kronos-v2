// @vitest-environment jsdom
import { expect, it } from "vitest";
import {
    BrowserChatSelectionEvent,
    stageBrowserSelectionInChat,
    type BrowserChatSelectionRequest,
} from "./browser-chat-selection";

it("waits for the visible Pen composer to attach the screenshot and text", async () => {
    const selection = {
        target: "current" as const,
        text: "Text and coordinates",
        images: [{ filename: "selection.png", dataUrl: "data:image/png;base64,eA==" }],
    };
    let finish: () => void;
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<BrowserChatSelectionRequest>).detail;
        expect(detail.selection).toBe(selection);
        detail.stage = new Promise<void>((resolve) => {
            finish = resolve;
        });
    };
    window.addEventListener(BrowserChatSelectionEvent, listener);
    try {
        let done = false;
        const staging = stageBrowserSelectionInChat(selection).then(() => {
            done = true;
        });
        await Promise.resolve();
        expect(done).toBe(false);
        finish();
        await staging;
        expect(done).toBe(true);
    } finally {
        window.removeEventListener(BrowserChatSelectionEvent, listener);
    }
});
