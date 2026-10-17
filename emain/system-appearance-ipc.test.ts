// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test, vi } from "vitest";
import { registerSystemAppearanceIpc } from "./system-appearance-ipc";
const mocks = vi.hoisted(() => ({ on: vi.fn(), updated: vi.fn(), send: vi.fn() }));
vi.mock("electron", () => ({
    ipcMain: { on: mocks.on },
    nativeTheme: {
        shouldUseDarkColors: true,
        shouldUseHighContrastColors: false,
        prefersReducedTransparency: true,
        on: mocks.updated,
    },
    systemPreferences: { getAnimationSettings: () => ({ prefersReducedMotion: true }) },
    webContents: { getAllWebContents: () => [{ isDestroyed: () => false, send: mocks.send }] },
}));

test("answers the synchronous renderer startup call and publishes native changes", () => {
    registerSystemAppearanceIpc();
    expect(mocks.on.mock.calls[0][0]).toBe("get-system-appearance");
    const event = { returnValue: null };
    mocks.on.mock.calls[0][1](event);
    expect(event.returnValue).toEqual({
        colorScheme: "dark",
        contrast: "normal",
        reducedTransparency: true,
        reducedMotion: true,
    });
    mocks.updated.mock.calls[0][1]();
    expect(mocks.send).toHaveBeenCalledWith("system-appearance-change", event.returnValue);
});
