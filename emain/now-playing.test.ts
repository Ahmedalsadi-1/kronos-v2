// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guests: [] as any[], execute: vi.fn() }));
vi.mock("electron", () => ({
    webContents: {
        getAllWebContents: () => mocks.guests,
        fromId: (id: number) => mocks.guests.find((guest) => guest.id === id),
    },
}));
vi.mock("node:child_process", () => ({
    execFile: (_file, _args, _options, callback) => callback(null, { stdout: "" }),
}));

beforeEach(() => {
    vi.resetModules();
    mocks.execute.mockReset();
    mocks.guests = [
        {
            id: 17,
            isDestroyed: () => false,
            getType: () => "webview",
            isCurrentlyAudible: () => true,
            executeJavaScript: mocks.execute,
        },
    ];
});

it("reads live browser metadata and controls the same source", async () => {
    mocks.execute.mockResolvedValue({ title: "Track", artist: "Artist", playing: true });
    const { getNowPlaying, controlNowPlaying } = await import("./now-playing");
    expect(await getNowPlaying()).toEqual({
        id: "web:17",
        title: "Track",
        artist: "Artist",
        source: "Browser",
        playing: true,
        canSkip: false,
    });
    await controlNowPlaying("web:17", "toggle");
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining("m.pause()"), true);
});

it("rejects arbitrary source IDs and commands before executing code", async () => {
    mocks.execute.mockResolvedValue({ title: "Track", artist: "Artist", playing: true });
    const { getNowPlaying, controlNowPlaying } = await import("./now-playing");
    await getNowPlaying();
    const calls = mocks.execute.mock.calls.length;
    await expect(controlNowPlaying("web:99", "toggle")).rejects.toThrow("no longer available");
    await expect(controlNowPlaying("web:17", "run-script" as any)).rejects.toThrow("no longer available");
    await expect(controlNowPlaying("web:17", "next")).rejects.toThrow("does not support");
    expect(mocks.execute).toHaveBeenCalledTimes(calls);
});

it("ignores non-webview contents and handles navigating media guests", async () => {
    mocks.guests.unshift({ id: 22, isDestroyed: () => false, getType: () => "window" });
    mocks.execute.mockRejectedValue(new Error("navigation"));
    const { getNowPlaying } = await import("./now-playing");
    expect(await getNowPlaying()).toBeUndefined();
    expect(mocks.execute).toHaveBeenCalledTimes(1);
});

it("shares an in-flight refresh across the OS and notch", async () => {
    mocks.execute.mockResolvedValue({ title: "Track", artist: "", playing: false });
    const { getNowPlaying } = await import("./now-playing");
    const [os, notch] = await Promise.all([getNowPlaying(), getNowPlaying()]);
    expect(os).toEqual(notch);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
});
