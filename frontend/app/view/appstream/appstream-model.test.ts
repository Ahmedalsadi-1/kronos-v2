// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { atom } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppStreamViewModel } from "./appstream-model";

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), prepare: vi.fn() }));
vi.mock("@/app/store/global", () => ({ getApi: () => ({ prepareNativeSurfaceCapture: mocks.prepare }) }));
vi.mock("@/app/store/wshclientapi", () => ({
    RpcApi: { AppStreamStartCommand: mocks.start, AppStreamStopCommand: mocks.stop },
}));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("./appstream-entry", () => ({ AppStreamEntry: () => null }));
beforeEach(() => {
    vi.clearAllMocks();
    mocks.stop.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

function model() {
    return new AppStreamViewModel({
        blockId: "calculator",
        nodeModel: null,
        waveEnv: {
            wos: { getWaveObjectAtom: () => atom({}) },
            getBlockMetaKeyAtom: (_id, key) => atom(key.endsWith("appname") ? "Calculator" : "com.apple.calculator"),
        },
    } as any);
}

it("stops a late host startup after disposal without beginning capture", async () => {
    let resolve: (value: any) => void;
    mocks.start.mockReturnValueOnce(
        new Promise((done) => {
            resolve = done;
        })
    );
    const stream = model();
    const starting = stream.startStream(true);
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    stream.dispose();
    resolve({ streamUrl: "http://localhost/late" });
    await starting;
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalled());
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(globalStore.get(stream.statusAtom)).toBe("idle");
    expect(globalStore.get(stream.streamUrlAtom)).toBe("");
});

it("finishes old cleanup before starting a new session for the same block", async () => {
    const calls: string[] = [];
    let resolve: (value: any) => void;
    mocks.start.mockImplementationOnce(() => {
        calls.push("old-start");
        return new Promise((done) => {
            resolve = done;
        });
    });
    mocks.stop.mockImplementation(async () => {
        calls.push("stop");
    });
    mocks.start.mockImplementationOnce(async () => {
        calls.push("new-start");
        return { streamUrl: "http://localhost/new" };
    });
    const stream = model();
    const old = stream.startStream(false);
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    stream.dispose();
    const next = stream.startStream(false);
    resolve({ streamUrl: "http://localhost/old" });
    await Promise.all([old, next]);
    expect(calls.lastIndexOf("stop")).toBeLessThan(calls.indexOf("new-start"));
    expect(globalStore.get(stream.streamUrlAtom)).toBe("http://localhost/new");
    expect(globalStore.get(stream.statusAtom)).toBe("streaming");
});

it("requests high-resolution live media without imposing a downscale", async () => {
    mocks.start.mockResolvedValue({ streamUrl: "http://localhost/live" });
    mocks.prepare.mockResolvedValue({ sourceId: "window:1:0" });
    const track = { addEventListener: vi.fn(), stop: vi.fn() };
    const media = { getVideoTracks: () => [track], getTracks: () => [track] };
    const display = vi.fn(async () => media);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: display } });
    const stream = model();
    await stream.startStream(true);
    expect(display).toHaveBeenCalledWith({
        video: { width: { ideal: 4096 }, height: { ideal: 4096 }, frameRate: { ideal: 60 }, resizeMode: "none" },
        audio: false,
    });
    expect(globalStore.get(stream.transportAtom)).toBe("native-media");
    stream.dispose();
    expect(track.stop).toHaveBeenCalledOnce();
});

it("starts current capture while an obsolete media request is still pending", async () => {
    mocks.start.mockResolvedValue({ streamUrl: "http://localhost/live" });
    mocks.prepare.mockResolvedValue({ sourceId: "window:1:0" });
    let resolveOld: (value: any) => void;
    const oldTrack = { addEventListener: vi.fn(), stop: vi.fn() };
    const currentTrack = { addEventListener: vi.fn(), stop: vi.fn() };
    const oldMedia = { getVideoTracks: () => [oldTrack], getTracks: () => [oldTrack] };
    const currentMedia = { getVideoTracks: () => [currentTrack], getTracks: () => [currentTrack] };
    const display = vi
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveOld = resolve;
                })
        )
        .mockResolvedValueOnce(currentMedia);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: display } });
    const stream = model();
    const old = stream.startStream(true);
    await vi.waitFor(() => expect(display).toHaveBeenCalledOnce());
    stream.dispose();
    await stream.startStream(true);
    expect(display).toHaveBeenCalledTimes(2);
    resolveOld(oldMedia);
    await old;
    expect(oldTrack.stop).toHaveBeenCalledOnce();
    expect(currentTrack.stop).not.toHaveBeenCalled();
    expect(globalStore.get(stream.mediaStreamAtom)).toBe(currentMedia);
    stream.dispose();
});

it("reports a stale preload instead of silently sending input through the CLI relay", async () => {
    const instance = model();
    globalStore.set(instance.statusAtom, "streaming");
    globalStore.set(instance.streamUrlAtom, "http://127.0.0.1:1234");
    instance.frameSize = { width: 230, height: 408 };
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ status: "ok" }) }));
    vi.stubGlobal("fetch", fetch);
    await expect(instance.sendClick(10, 20)).rejects.toThrow("Restart KronOS");
    expect(fetch).not.toHaveBeenCalled();
    expect(globalStore.get(instance.inputErrorAtom)).toContain("Restart KronOS");
});
