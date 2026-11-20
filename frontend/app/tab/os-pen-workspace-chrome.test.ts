// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("keeps the chat composer visible beside the New Tab start page", () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    try {
        const doc = frame.contentDocument;
        const style = doc.createElement("style");
        style.textContent = readFileSync(resolve("frontend/app/tab/os-pen-workspace-chrome.css"), "utf8");
        doc.head.append(style);
        doc.documentElement.setAttribute("data-kronos-full-chat", "");
        doc.documentElement.setAttribute("data-kronos-chat-split", "");
        doc.documentElement.setAttribute("data-kronos-chat-start", "");
        doc.body.innerHTML = '<div data-agent-spotlight><textarea aria-label="Chat message"></textarea></div>';
        expect(doc.defaultView.getComputedStyle(doc.querySelector("[data-agent-spotlight]")).visibility).toBe(
            "visible"
        );
        expect(doc.defaultView.getComputedStyle(doc.querySelector("textarea")).visibility).toBe("visible");
    } finally {
        frame.remove();
    }
});
