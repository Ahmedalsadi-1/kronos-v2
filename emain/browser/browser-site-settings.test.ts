// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Session, WebContents } from "electron";
import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { readBrowserSiteSettings, watchBrowserSession } from "./browser-site-settings";

const showItemInFolder = vi.hoisted(() => vi.fn());
vi.mock("electron", () => ({ shell: { showItemInFolder } }));

it("blocks governed permissions until the current origin is explicitly allowed", () => {
    const session = Object.assign(new EventEmitter(), {
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
    });
    const guest = { session, getType: () => "webview", getURL: () => "https://example.test/path" };
    const browser = guest as unknown as WebContents;
    const command = { guestId: 1 };
    readBrowserSiteSettings(browser, command);
    const check = session.setPermissionCheckHandler.mock.calls[0][0];
    expect(check(browser, "media", "https://example.test")).toBe(false);
    expect(() =>
        readBrowserSiteSettings(browser, {
            ...command,
            change: { origin: "https://other.test", permission: "media", decision: "allow" },
        })
    ).toThrow();
    readBrowserSiteSettings(browser, {
        ...command,
        change: { origin: "https://example.test", permission: "media", decision: "allow" },
    });
    expect(check(browser, "media", "https://example.test")).toBe(true);
    expect(check(browser, "media", "https://other.test")).toBe(false);
});

it("tracks download progress once per session and ignores application downloads", () => {
    const session = Object.assign(new EventEmitter(), {
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
    });
    const guest = { session, getType: () => "webview", getURL: () => "https://example.test" };
    let received = 0;
    const item = Object.assign(new EventEmitter(), {
        getFilename: () => "example.png",
        getSavePath: () => "/downloads/example.png",
        getReceivedBytes: () => received,
        getTotalBytes: () => 20,
    });
    watchBrowserSession(session as unknown as Session);
    watchBrowserSession(session as unknown as Session);
    session.emit("will-download", {}, item, { getType: () => "window" });
    session.emit("will-download", {}, item, guest);
    received = 20;
    item.emit("done", {}, "completed");
    const browser = guest as unknown as WebContents;
    const { downloads } = readBrowserSiteSettings(browser, { guestId: 1 });
    expect(downloads).toEqual([
        expect.objectContaining({
            filename: "example.png",
            received: 20,
            total: 20,
            state: "completed",
            canReveal: true,
        }),
    ]);
    expect(downloads[0]).not.toHaveProperty("savePath");
    expect(() => readBrowserSiteSettings(browser, { guestId: 1, revealDownloadId: "/arbitrary/path" })).toThrow();
    readBrowserSiteSettings(browser, { guestId: 1, revealDownloadId: downloads[0].id });
    expect(showItemInFolder).toHaveBeenCalledExactlyOnceWith("/downloads/example.png");
});

it("notifies only observers of the download session and releases destroyed observers", () => {
    const makeSession = () =>
        Object.assign(new EventEmitter(), {
            setPermissionCheckHandler: vi.fn(),
            setPermissionRequestHandler: vi.fn(),
        });
    const session = makeSession();
    const otherSession = makeSession();
    const observer = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false });
    const other = Object.assign(new EventEmitter(), { send: vi.fn(), isDestroyed: () => false });
    const guest = { session, getType: () => "webview", getURL: () => "https://example.test" } as unknown as WebContents;
    const read = () => readBrowserSiteSettings(guest, { guestId: 1 }, observer as unknown as WebContents);
    read();
    read();
    readBrowserSiteSettings(
        { ...guest, session: otherSession } as unknown as WebContents,
        { guestId: 2 },
        other as unknown as WebContents
    );
    const item = Object.assign(new EventEmitter(), {
        getFilename: () => "test.png",
        getReceivedBytes: () => 10,
        getTotalBytes: () => 20,
    });
    session.emit("will-download", {}, item, guest);
    item.emit("updated");
    item.emit("done", {}, "cancelled");
    expect(observer.send.mock.calls).toEqual(Array.from({ length: 3 }, () => ["browser-downloads-changed"]));
    expect(other.send).not.toHaveBeenCalled();
    expect(observer.listenerCount("destroyed")).toBe(1);
    observer.emit("destroyed");
    item.emit("updated");
    expect(observer.send).toHaveBeenCalledTimes(3);
});
