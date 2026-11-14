// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { clipboard, ipcMain, type WebContents } from "electron";

export function registerAgentInputIpc(isTrusted: (sender: WebContents) => boolean): void {
    ipcMain.handle("agent-read-clipboard", async (event) => {
        if (event.senderFrame !== event.sender.mainFrame || !isTrusted(event.sender))
            throw new Error("Clipboard requires a trusted workspace surface");
        return clipboard.readText();
    });

    ipcMain.handle("agent-write-clipboard", async (event, text) => {
        if (event.senderFrame !== event.sender.mainFrame || !isTrusted(event.sender))
            throw new Error("Clipboard requires a trusted workspace surface");
        if (typeof text !== "string" || text.length > 1_000_000) throw new Error("Invalid clipboard text");
        clipboard.writeText(text);
    });

    ipcMain.handle("agent-send-input-event", async (event, input) => {
        if (event.senderFrame !== event.sender.mainFrame || !isTrusted(event.sender)) {
            throw new Error("Input requires a trusted workspace surface");
        }
        const pointerTypes = ["mouseMove", "mouseDown", "mouseUp", "mouseWheel"];
        const keyboardTypes = ["keyDown", "keyUp", "char"];
        if (!input || (!pointerTypes.includes(input.type) && !keyboardTypes.includes(input.type))) {
            throw new Error("Unsupported input event");
        }
        if (pointerTypes.includes(input.type) && (!Number.isFinite(input.x) || !Number.isFinite(input.y))) {
            throw new Error("Input coordinates must be finite");
        }
        if (input.type === "mouseWheel" && ![input.deltaX ?? 0, input.deltaY ?? 0].every(Number.isFinite)) {
            throw new Error("Scroll deltas must be finite");
        }
        if (keyboardTypes.includes(input.type) && typeof input.keyCode !== "string") {
            throw new Error("Input key is required");
        }
        event.sender.focus();
        event.sender.sendInputEvent(input);
    });

    ipcMain.handle("agent-insert-text", async (event, text) => {
        if (event.senderFrame !== event.sender.mainFrame || !isTrusted(event.sender)) {
            throw new Error("Input requires a trusted workspace surface");
        }
        if (typeof text !== "string" || text.length > 1_000_000) throw new Error("Invalid input text");
        await event.sender.insertText(text);
    });
}
