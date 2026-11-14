// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from "vitest";
import { registerAgentInputIpc } from "./agent-input-ipc";

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => Promise<unknown>>());
const clipboard = vi.hoisted(() => ({ readText: vi.fn(), writeText: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, clipboard }));

beforeEach(() => handlers.clear());

it("reads and writes clipboard text only for trusted top-level surfaces", async () => {
    const event = senderEvent();
    registerAgentInputIpc(() => true);
    clipboard.readText.mockReturnValue("hello");
    expect(await handlers.get("agent-read-clipboard")(event)).toBe("hello");
    await handlers.get("agent-write-clipboard")(event, "paste me");
    expect(clipboard.writeText).toHaveBeenLastCalledWith("paste me");
    clipboard.writeText.mockClear();
    for (const value of [null, {}, "x".repeat(1_000_001)])
        await expect(handlers.get("agent-write-clipboard")(event, value)).rejects.toThrow("Invalid clipboard");
    await expect(handlers.get("agent-write-clipboard")({ ...event, senderFrame: {} }, "bad")).rejects.toThrow(
        "trusted"
    );
    registerAgentInputIpc(() => false);
    await expect(handlers.get("agent-read-clipboard")(event)).rejects.toThrow("trusted");
    await expect(handlers.get("agent-write-clipboard")(event, "bad")).rejects.toThrow("trusted");
    expect(clipboard.writeText).not.toHaveBeenCalled();
});

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
