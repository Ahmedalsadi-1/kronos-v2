// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from "vitest";
import { registerAgentInputIpc } from "./agent-input-ipc";

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<void>>());
vi.mock("electron", () => ({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) } }));

beforeEach(() => handlers.clear());

function senderEvent() {
    const frame = {};
    return {
        senderFrame: frame,
        sender: { mainFrame: frame, focus: vi.fn(), sendInputEvent: vi.fn(), insertText: vi.fn() },
    };
}

it("delivers pointer and keyboard input to the trusted invoking surface", async () => {
    registerAgentInputIpc(() => true);
    const event = senderEvent();
    for (const input of [
        { type: "mouseDown", x: 10, y: 20, button: "left" },
        { type: "mouseMove", x: 40, y: 50, modifiers: ["leftbuttondown"] },
        { type: "mouseUp", x: 40, y: 50, button: "left" },
        { type: "keyDown", keyCode: "Enter" },
    ]) {
        await handlers.get("agent-send-input-event")(event, input);
        expect(event.sender.sendInputEvent).toHaveBeenLastCalledWith(input);
    }
    await handlers.get("agent-insert-text")(event, "hello");
    expect(event.sender.insertText).toHaveBeenCalledWith("hello");
});

it("rejects untrusted frames and malformed input before dispatch", async () => {
    const event = senderEvent();
    registerAgentInputIpc(() => false);
    await expect(handlers.get("agent-send-input-event")(event, { type: "mouseDown", x: 1, y: 2 })).rejects.toThrow(
        "trusted"
    );
    registerAgentInputIpc(() => true);
    await expect(handlers.get("agent-insert-text")({ ...event, senderFrame: {} }, "text")).rejects.toThrow("trusted");
    for (const input of [{ type: "mouseMove", x: NaN, y: 2 }, { type: "keyDown" }, { type: "unknown" }]) {
        await expect(handlers.get("agent-send-input-event")(event, input)).rejects.toThrow();
    }
    expect(event.sender.sendInputEvent).not.toHaveBeenCalled();
    expect(event.sender.insertText).not.toHaveBeenCalled();
});
