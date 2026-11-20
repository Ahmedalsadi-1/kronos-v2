// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerComputerTargetsIpc } from "./computer-targets-ipc";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), trusted: vi.fn(), hudTrusted: vi.fn(), list: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle }, app: { on: vi.fn(), once: vi.fn() } }));
vi.mock("./device-simulator/android/android-preview-server", () => ({
    startAndroidPreviewServer: () => ({ server: { on: vi.fn() }, close: vi.fn() }),
}));
vi.mock("./emain-hud", () => ({ isTrustedNativeHudSender: mocks.hudTrusted }));
vi.mock("./emain-tabview", () => ({ getWaveTabViewByWebContentsId: mocks.trusted }));
vi.mock("./computer-targets-runtime", () => ({
    getComputerTargetsRuntime: () => ({ list: mocks.list, perform: vi.fn(), takeOver: vi.fn() }),
}));

describe("Computers IPC", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.hudTrusted.mockReturnValue(false);
        registerComputerTargetsIpc();
    });

    it("rejects embedded frames and unregistered senders without touching devices", async () => {
        const handler = mocks.handle.mock.calls.find(([channel]) => channel === "computer-targets:list")[1];
        const frame = {};
        mocks.trusted.mockReturnValue(null);
        expect((await handler({ sender: { id: 1, mainFrame: frame }, senderFrame: frame })).success).toBe(false);
        mocks.trusted.mockReturnValue({});
        expect((await handler({ sender: { id: 1, mainFrame: frame }, senderFrame: {} })).success).toBe(false);
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("allows registered HUD main frames while rejecting their embedded frames", async () => {
        const handler = mocks.handle.mock.calls.find(([channel]) => channel === "computer-targets:list")[1];
        const frame = {};
        mocks.trusted.mockReturnValue(null);
        mocks.hudTrusted.mockReturnValue(true);
        mocks.list.mockResolvedValue([]);
        expect(await handler({ sender: { id: 2, mainFrame: frame }, senderFrame: frame })).toEqual({
            success: true,
            data: [],
        });
        expect((await handler({ sender: { id: 2, mainFrame: frame }, senderFrame: {} })).success).toBe(false);
        expect(mocks.list).toHaveBeenCalledTimes(1);
    });

    it("returns typed errors and device results to trusted workspace frames", async () => {
        const handler = mocks.handle.mock.calls.find(([channel]) => channel === "computer-targets:list")[1];
        const frame = {};
        const event = { sender: { id: 1, mainFrame: frame }, senderFrame: frame };
        mocks.trusted.mockReturnValue({});
        mocks.list.mockResolvedValue([]);
        expect(await handler(event)).toEqual({ success: true, data: [] });
        mocks.list.mockRejectedValue(new Error("Install full Xcode"));
        expect(await handler(event)).toEqual({
            success: false,
            error: { code: "computer-target-unavailable", message: "Install full Xcode" },
        });
    });
});
