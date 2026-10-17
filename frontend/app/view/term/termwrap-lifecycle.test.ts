// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
    return { getRTInfo: vi.fn(), getFileSubject: vi.fn(), fetchWaveFile: vi.fn() };
});
vi.mock("@/app/store/badge", () => ({ setBadge: vi.fn() }));
vi.mock("@/app/store/modalmodel", () => ({ modalsModel: {} }));
vi.mock("@/app/store/wps", () => ({ getFileSubject: mocks.getFileSubject }));
vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: { GetRTInfoCommand: mocks.getRTInfo } }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/store/global", () => ({
    fetchWaveFile: mocks.fetchWaveFile,
    getOverrideConfigAtom: vi.fn(),
    getSettingsKeyAtom: vi.fn(),
    globalStore: { get: vi.fn(), set: vi.fn() },
    isDev: () => false,
    openLink: vi.fn(),
    WOS: { makeORef: () => "block:test" },
}));
vi.mock("@/store/services", () => ({}));
vi.mock("@/util/util", () => ({ base64ToArray: vi.fn(), fireAndForget: vi.fn() }));
vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }));
vi.mock("@xterm/addon-canvas", () => ({ CanvasAddon: vi.fn() }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: vi.fn() }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: vi.fn() }));
vi.mock("@xterm/addon-serialize", () => ({ SerializeAddon: vi.fn() }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: vi.fn() }));
vi.mock("./fitaddon", () => ({ FitAddon: vi.fn() }));
vi.mock("./osc-handlers", () => ({}));
vi.mock("./termutil", () => ({}));

import { TermWrap } from "./termwrap";

function makeTermWrap() {
    const wrap = Object.create(TermWrap.prototype) as TermWrap;
    Object.assign(wrap, {
        disposed: false,
        promptMarkers: [],
        toDispose: [],
        heldData: [],
        pendingWrites: new Set(),
        terminal: {
            dispose: vi.fn(),
            write: vi.fn(),
            onData: () => ({ dispose: vi.fn() }),
            onSelectionChange: () => ({ dispose: vi.fn() }),
        },
        connectElem: document.createElement("div"),
        handleResize_debounced: Object.assign(vi.fn(), { cancel: vi.fn() }),
        processAndCacheData: vi.fn(),
    });
    return wrap;
}

describe("terminal lifecycle cleanup", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("requestIdleCallback", (callback: () => void) => window.setTimeout(callback, 1));
        vi.stubGlobal("cancelIdleCallback", (id: number) => window.clearTimeout(id));
        mocks.getRTInfo.mockReset();
        mocks.fetchWaveFile.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("stops all idle work for 100 closed terminals", () => {
        const wraps = Array.from({ length: 100 }, makeTermWrap);
        for (const wrap of wraps) {
            wrap.runProcessIdleTimeout();
            wrap.dispose();
        }
        vi.advanceTimersByTime(60_000);
        expect(vi.getTimerCount()).toBe(0);
        for (const wrap of wraps) expect(wrap.processAndCacheData).not.toHaveBeenCalled();
    });

    it("cancels an idle callback already queued by the timeout", () => {
        const wrap = makeTermWrap();
        wrap.runProcessIdleTimeout();
        vi.advanceTimersByTime(5000);
        wrap.dispose();
        vi.advanceTimersByTime(60_000);
        expect(wrap.processAndCacheData).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps caching active terminals and stops after disposal", () => {
        const wrap = makeTermWrap();
        wrap.runProcessIdleTimeout();
        vi.advanceTimersByTime(15_003);
        expect(wrap.processAndCacheData).toHaveBeenCalledTimes(3);
        wrap.dispose();
        vi.advanceTimersByTime(60_000);
        expect(wrap.processAndCacheData).toHaveBeenCalledTimes(3);
    });

    it("unsubscribes from a shared file subject and handles repeated disposal", async () => {
        const wrap = makeTermWrap();
        const subject = Object.assign(new Subject(), { release: vi.fn() });
        mocks.getFileSubject.mockReturnValue(subject);
        mocks.getRTInfo.mockResolvedValue({});
        wrap.loadInitialTerminalData = vi.fn().mockResolvedValue(undefined);
        await wrap.initTerminal();
        expect(subject.observers).toHaveLength(1);
        wrap.dispose();
        wrap.dispose();
        expect(subject.observers).toHaveLength(0);
        expect(subject.release).toHaveBeenCalledTimes(1);
        expect(wrap.terminal.dispose).toHaveBeenCalledTimes(1);
    });

    it("does not resume initialization after disposal while runtime info loads", async () => {
        const wrap = makeTermWrap();
        mocks.getFileSubject.mockReturnValue(Object.assign(new Subject(), { release: vi.fn() }));
        let resolveRuntimeInfo: (value: object) => void;
        mocks.getRTInfo.mockReturnValue(new Promise((resolve) => (resolveRuntimeInfo = resolve)));
        wrap.loadInitialTerminalData = vi.fn();
        const initialization = wrap.initTerminal();
        wrap.dispose();
        resolveRuntimeInfo({});
        await initialization;
        expect(wrap.loadInitialTerminalData).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("does not write fetched history into a disposed terminal", async () => {
        const wrap = makeTermWrap();
        let resolveFile: (value: object) => void;
        mocks.fetchWaveFile.mockReturnValue(new Promise((resolve) => (resolveFile = resolve)));
        const loading = wrap.loadInitialTerminalData();
        wrap.dispose();
        resolveFile({ data: new Uint8Array([1]), fileInfo: { meta: {} } });
        await loading;
        expect(wrap.terminal.write).not.toHaveBeenCalled();
        expect(mocks.fetchWaveFile).toHaveBeenCalledTimes(1);
    });

    it("settles initialization if xterm drops a queued write callback during teardown", async () => {
        const wrap = makeTermWrap();
        mocks.getFileSubject.mockReturnValue(Object.assign(new Subject(), { release: vi.fn() }));
        mocks.getRTInfo.mockResolvedValue({});
        mocks.fetchWaveFile.mockResolvedValue({ data: new Uint8Array([1]), fileInfo: {} });
        wrap.loadInitialTerminalData = () => wrap.doTerminalWrite(new Uint8Array([1]));
        const initialization = wrap.initTerminal();
        await Promise.resolve();
        expect(wrap.terminal.write).toHaveBeenCalledTimes(1);
        wrap.dispose();
        await initialization;
        expect(wrap.loaded).toBe(false);
        expect(wrap.pendingWrites.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });
});
