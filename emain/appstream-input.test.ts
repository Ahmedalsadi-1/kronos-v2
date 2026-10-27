// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStreamInputSession, validateAppStreamInput } from "./appstream-input";

vi.mock("electron", () => ({
    app: { on: vi.fn() },
    ipcMain: { handle: vi.fn() },
    nativeImage: { createFromBuffer: () => ({ getSize: () => ({ width: 230, height: 408 }) }) },
}));

const state = {
    content: [
        { type: "text", text: 'Window: "Calculator"\n0 standard window Calculator\n1 button' },
        { type: "image", data: "image", mimeType: "image/png" },
    ],
};
let client: { callTool: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
beforeEach(() => {
    client = { callTool: vi.fn(async () => state), close: vi.fn() };
});

describe("persistent app stream input", () => {
    it("maps Retina video pixels to the native helper screenshot coordinate space", async () => {
        const session = new AppStreamInputSession(client as any);
        await session.send(
            { app: "Calculator", action: "click", x: 230, y: 408, frameWidth: 460, frameHeight: 816 },
            () => true
        );
        expect(client.callTool).toHaveBeenLastCalledWith("click", {
            app: "Calculator",
            x: 115,
            y: 204,
            mouse_button: "left",
            click_count: 1,
        });
    });

    it("uses real fractional scroll against an observed window instead of repeated page keys", async () => {
        const session = new AppStreamInputSession(client as any);
        await session.send({ app: "Calculator", action: "scroll", direction: "down", pages: 0.25 }, () => true);
        expect(client.callTool).toHaveBeenLastCalledWith("scroll", {
            app: "Calculator",
            element_index: "0",
            direction: "down",
            pages: 0.25,
        });
    });

    it("delivers typing and shortcuts in order without an extra screenshot round trip", async () => {
        const session = new AppStreamInputSession(client as any);
        await Promise.all([
            session.send({ app: "Calculator", action: "type", text: "1" }, () => true),
            session.send({ app: "Calculator", action: "press", keys: "Return" }, () => true),
        ]);
        expect(client.callTool.mock.calls.map(([name]) => name)).toEqual(["type_text", "press_key"]);
    });

    it("does not act after navigation or replay a failed action", async () => {
        let current = true;
        client.callTool.mockImplementationOnce(async () => {
            current = false;
            return state;
        });
        const session = new AppStreamInputSession(client as any);
        await expect(
            session.send(
                { app: "Calculator", action: "click", x: 1, y: 1, frameWidth: 230, frameHeight: 408 },
                () => current
            )
        ).rejects.toThrow("owner changed");
        expect(client.callTool).toHaveBeenCalledTimes(1);
        session.close();
        expect(client.close).toHaveBeenCalledOnce();
    });

    it("surfaces native failures and permits the next independently requested action", async () => {
        client.callTool.mockResolvedValueOnce({
            isError: true,
            content: [{ type: "text", text: "Permission denied" }],
        });
        const session = new AppStreamInputSession(client as any);
        await expect(session.send({ app: "Calculator", action: "type", text: "1" }, () => true)).rejects.toThrow(
            "Permission denied"
        );
        await session.send({ app: "Calculator", action: "press", keys: "Escape" }, () => true);
        expect(client.callTool).toHaveBeenCalledTimes(2);
    });

    it("rejects invalid targets and coordinates before invoking native tools", () => {
        expect(() => validateAppStreamInput({ app: "", action: "type", text: "x" })).toThrow();
        expect(() => validateAppStreamInput({ app: "Calculator", action: "click", x: NaN, y: 0 })).toThrow();
        expect(() =>
            validateAppStreamInput({ app: "Calculator", action: "scroll", direction: "down", pages: Infinity })
        ).toThrow();
    });
});
