// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BrowserSiteSettingsPanel } from "./browser-site-settings";

const mocks = vi.hoisted(() => ({ read: vi.fn(), listeners: new Set<() => void>() }));
vi.mock("@/store/global", () => ({
    getApi: () => ({
        browserSiteSettings: mocks.read,
        onBrowserDownloadsChanged: (listener: () => void) => {
            mocks.listeners.add(listener);
            return () => mocks.listeners.delete(listener);
        },
    }),
}));

it("refreshes downloads on events, coalesces requests, and unsubscribes on unmount", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    const root = createRoot(host);
    const empty = { permissions: {}, downloads: [] };
    let resolveRead: (value: unknown) => void;
    mocks.read
        .mockResolvedValueOnce(empty)
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveRead = resolve;
                })
        )
        .mockResolvedValue(empty);
    try {
        await act(async () =>
            root.render(<BrowserSiteSettingsPanel guestId={1} url="https://example.test" downloadsOnly />)
        );
        expect(mocks.read).toHaveBeenCalledTimes(1);
        expect(mocks.listeners.size).toBe(1);
        await act(async () => {
            for (let i = 0; i < 3; i++) for (const listener of mocks.listeners) listener();
        });
        expect(mocks.read).toHaveBeenCalledTimes(2);
        await act(async () => resolveRead(empty));
        expect(mocks.read).toHaveBeenCalledTimes(3);
    } finally {
        await act(async () => root.unmount());
        expect(mocks.listeners.size).toBe(0);
        vi.unstubAllGlobals();
    }
});
