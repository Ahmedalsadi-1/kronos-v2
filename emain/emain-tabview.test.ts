// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ WebContentsView: class {}, shell: {} }));
vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: {} }));
vi.mock("./emain-window", () => ({ getWaveWindowById: () => undefined }));
vi.mock("./authkey", () => ({}));
vi.mock("./emain-activity", () => ({}));
vi.mock("./emain-platform", () => ({}));
vi.mock("./emain-util", () => ({}));
vi.mock("./emain-wsh", () => ({}));

describe("tab renderer cache", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.useFakeTimers();
        vi.setSystemTime(10000);
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    async function fixture(limit = 2) {
        const cache = await import("./emain-tabview");
        cache.setMaxTabCacheSize(limit);
        function add(id: string, active = false, lastUsedTs = 0) {
            const tab = {
                waveTabId: id,
                isActiveTab: active,
                lastUsedTs,
                destroy: vi.fn(() => cache.WaveTabView.prototype.destroy.call(tab)),
                webContents: { close: vi.fn() },
            } as unknown as import("./emain-tabview").WaveTabView;
            cache.setWaveTabView(id, tab);
            return tab;
        }
        return { cache, add };
    }

    it("continues past active tabs to evict the oldest inactive renderer", async () => {
        const { cache, add } = await fixture();
        const active = add("active", true);
        const oldest = add("oldest", false, 1000);
        const newest = add("newest", false, 2000);
        expect(oldest.destroy).toHaveBeenCalledOnce();
        expect(cache.getWaveTabView("oldest")).toBeUndefined();
        expect(active.destroy).not.toHaveBeenCalled();
        expect(newest.destroy).not.toHaveBeenCalled();
    });

    it("retries eviction after a recently used renderer leaves its grace period", async () => {
        const { cache, add } = await fixture(1);
        const recent = add("recent", false, Date.now());
        add("active", true);
        expect(recent.destroy).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(recent.destroy).toHaveBeenCalledOnce();
        expect(cache.getWaveTabView("recent")).toBeUndefined();
    });

    it("enforces a reduced limit immediately", async () => {
        const { cache, add } = await fixture(3);
        const oldest = add("oldest");
        const newer = add("newer", false, 1000);
        add("active", true);
        cache.setMaxTabCacheSize(1);
        expect(oldest.destroy).toHaveBeenCalledOnce();
        expect(newer.destroy).toHaveBeenCalledOnce();
    });

    it("keeps active renderers even when they exceed the cache limit", async () => {
        const { add } = await fixture(1);
        const first = add("first", true);
        const second = add("second", true);
        await vi.advanceTimersByTimeAsync(5000);
        expect(first.destroy).not.toHaveBeenCalled();
        expect(second.destroy).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
