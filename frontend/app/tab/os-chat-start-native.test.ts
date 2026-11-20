// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import {
    nativeStartCanvasButton,
    nativeStartCanvasChat,
    nativeStartComposer,
    nativeStartTool,
} from "./os-chat-start-native";

it("uses the existing full-chat composer rather than creating another session", async () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML =
        "<div data-kronos-pen-composer-controls></div><section data-chat-fullscreen><div data-kronos-pen-composer-controls></div></section>";
    const send = vi.fn();
    const slots = doc.querySelectorAll<any>("[data-kronos-pen-composer-controls]");
    slots[0].kronosControls = { send: vi.fn() };
    slots[1].kronosControls = { send };
    await nativeStartComposer(doc).send("hello");
    expect(send).toHaveBeenCalledExactlyOnceWith("hello");
    expect(slots[0].kronosControls.send).not.toHaveBeenCalled();
});

it("transfers the draft once before invoking native attachments", () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = "<section data-chat-fullscreen><div data-kronos-pen-composer-controls></div></section>";
    const insert = vi.fn();
    const attach = vi.fn();
    (doc.querySelector("[data-kronos-pen-composer-controls]") as any).kronosControls = {
        send: vi.fn(),
        insert,
        attach,
    };
    const invoke = nativeStartTool(doc, "Attach files", "keep this draft");
    expect(insert).toHaveBeenCalledExactlyOnceWith("keep this draft");
    expect(attach).not.toHaveBeenCalled();
    invoke();
    expect(attach).toHaveBeenCalledOnce();
});

it("retains the draft if native controls or Canvas are unavailable", () => {
    const doc = document.implementation.createHTMLDocument();
    expect(() => nativeStartComposer(doc)).toThrow("Chat is still starting");
    expect(() => nativeStartCanvasButton(doc)).toThrow("Canvas is still starting");
    doc.body.innerHTML = "<section data-chat-fullscreen><div data-kronos-pen-composer-controls></div></section>";
    const insert = vi.fn();
    (doc.querySelector("[data-kronos-pen-composer-controls]") as any).kronosControls = { send: vi.fn(), insert };
    expect(() => nativeStartTool(doc, "Voice dictation", "do not lose me")).toThrow("not ready");
    expect(insert).not.toHaveBeenCalled();
});

it("sends Canvas requests from the pill after changing presentation", async () => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.body.innerHTML =
        "<button>Open canvas</button><section data-chat-fullscreen><div data-kronos-pen-composer-controls></div></section><div data-agent-spotlight><div data-kronos-pen-composer-controls></div></div>";
    const fullSend = vi.fn();
    const pillSend = vi.fn();
    (doc.querySelector("[data-chat-fullscreen] [data-kronos-pen-composer-controls]") as any).kronosControls = {
        send: fullSend,
    };
    const pill = doc.querySelector("[data-agent-spotlight] [data-kronos-pen-composer-controls]") as any;
    pill.kronosControls = { send: pillSend };
    const showCanvas = vi.fn(() => doc.querySelector("[data-chat-fullscreen]").removeAttribute("data-chat-fullscreen"));
    doc.defaultView.addEventListener("kronos:canvas-chat", showCanvas);
    try {
        await nativeStartCanvasChat(doc, "build this on canvas");
        expect(showCanvas).toHaveBeenCalledOnce();
        expect(pillSend).toHaveBeenCalledExactlyOnceWith("build this on canvas");
        expect(fullSend).not.toHaveBeenCalled();
    } finally {
        frame.remove();
    }
});
