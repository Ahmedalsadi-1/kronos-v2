// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from "vitest";
import { registerNativeSurfaceCaptureIpc } from "./native-surface-capture";

const mocks = vi.hoisted(() => ({ handlers: new Map(), getSources: vi.fn(), fromFrame: vi.fn() }));
vi.mock("electron", () => ({
    ipcMain: { handle: (name, handler) => mocks.handlers.set(name, handler) },
    desktopCapturer: { getSources: mocks.getSources },
    webContents: { fromFrame: mocks.fromFrame },
}));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.handlers.clear();
});

function setup() {
    const frame = { url: "http://localhost/workspace" };
    const session = { setDisplayMediaRequestHandler: vi.fn() };
    const sender = { id: 42, mainFrame: frame, session, isDestroyed: () => false, once: vi.fn() };
    mocks.fromFrame.mockReturnValue(sender);
    mocks.getSources.mockResolvedValue([{ id: "window:7:0", name: "Calculator" }]);
    registerNativeSurfaceCaptureIpc(() => true);
    return { frame, sender, session, prepare: mocks.handlers.get("prepare-native-surface-capture") };
}

it("grants a prepared window once to the invoking workspace frame", async () => {
    const { frame, sender, session, prepare } = setup();
    await expect(prepare({ sender, senderFrame: frame }, { appName: "Calculator" })).resolves.toEqual({
        sourceId: "window:7:0",
        title: "Calculator",
    });
    const handler = session.setDisplayMediaRequestHandler.mock.calls[0][0];
    const callback = vi.fn();
    handler({ frame, videoRequested: true, audioRequested: false }, callback);
    expect(callback).toHaveBeenLastCalledWith({ video: { id: "window:7:0", name: "Calculator" } });
    handler({ frame, videoRequested: true, audioRequested: false }, callback);
    expect(callback).toHaveBeenLastCalledWith({});
});

it("rejects guest frames and unrelated windows", async () => {
    const { frame, sender, prepare } = setup();
    await expect(prepare({ sender, senderFrame: {} }, { appName: "Calculator" })).rejects.toThrow("trusted");
    await expect(prepare({ sender, senderFrame: frame }, { appName: "Mail" })).rejects.toThrow("unambiguous");
});

it("does not replace a pending capture with a second app from the same renderer", async () => {
    const { frame, sender, prepare } = setup();
    await prepare({ sender, senderFrame: frame }, { appName: "Calculator" });
    await expect(prepare({ sender, senderFrame: frame }, { appName: "Mail" })).rejects.toThrow("Another app capture");
});

it("denies capture after navigation and requests for audio", async () => {
    const { frame, sender, session, prepare } = setup();
    await prepare({ sender, senderFrame: frame }, { appName: "Calculator" });
    const handler = session.setDisplayMediaRequestHandler.mock.calls[0][0];
    frame.url = "https://example.com";
    const callback = vi.fn();
    handler({ frame, videoRequested: true, audioRequested: false }, callback);
    expect(callback).toHaveBeenCalledWith({});
    await prepare({ sender, senderFrame: frame }, { appName: "Calculator" });
    handler({ frame, videoRequested: true, audioRequested: true }, callback);
    expect(callback).toHaveBeenLastCalledWith({});
});
