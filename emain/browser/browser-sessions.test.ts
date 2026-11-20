// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { WebContents } from "electron";
import { beforeEach, expect, it, vi } from "vitest";
import { manageBrowserSessions, registerPrivateBrowserPartition } from "./browser-sessions";

const mocks = vi.hoisted(() => ({ partitions: new Map(), guests: [], defaultSession: {} }));
vi.mock("electron", () => ({
    session: { defaultSession: mocks.defaultSession, fromPartition: (id: string) => mocks.partitions.get(id) },
    webContents: { getAllWebContents: () => mocks.guests },
}));

function makeSession() {
    return {
        cookies: { get: vi.fn(async () => [{ value: "private-secret" }]) },
        getCacheSize: vi.fn(async () => 2048),
        clearCache: vi.fn(async () => {}),
        clearStorageData: vi.fn(async () => {}),
    };
}
const sender = { id: 10, isDestroyed: () => false } as WebContents;
beforeEach(() => {
    mocks.partitions.clear();
    mocks.guests.length = 0;
    mocks.partitions.set("persist:kronterm-work", makeSession());
    mocks.partitions.set("persist:kronterm-personal", makeSession());
});

function guest(id: number, browser: unknown, owner = 10) {
    return { id, session: browser, hostWebContents: { id: owner }, isDestroyed: () => false, getType: () => "webview" };
}

it("lists allowed profiles and owned private sessions without returning cookies or other guests", async () => {
    const privateSession = makeSession();
    mocks.partitions.set("kronterm-private-block-1", privateSession);
    registerPrivateBrowserPartition("kronterm-private-block-1");
    mocks.guests.push(
        guest(1, mocks.partitions.get("persist:kronterm-work")),
        guest(2, privateSession),
        guest(3, makeSession()),
        guest(4, privateSession, 999)
    );
    const rows = await manageBrowserSessions(sender, { action: "list" });
    expect(rows.map(({ id }) => id)).toEqual(["default", "work", "personal", "private:2"]);
    expect(rows.find(({ id }) => id === "work")).toMatchObject({ cookies: 1, cacheBytes: 2048, openTabs: 1 });
    expect(rows.find(({ id }) => id === "private:2").openTabs).toBe(1);
    expect(JSON.stringify(rows)).not.toContain("private-secret");
    expect(rows[0]).not.toHaveProperty("cookies");
});

it("clears the selected profile only and rejects arbitrary partitions and shared default", async () => {
    const work = mocks.partitions.get("persist:kronterm-work");
    const personal = mocks.partitions.get("persist:kronterm-personal");
    await manageBrowserSessions(sender, { action: "clear", id: "work", data: "cookies" });
    expect(work.clearStorageData).toHaveBeenCalledExactlyOnceWith({ storages: ["cookies"] });
    expect(personal.clearStorageData).not.toHaveBeenCalled();
    await expect(
        manageBrowserSessions(sender, { action: "clear", id: "persist:hermes", data: "cache" })
    ).rejects.toThrow();
    await expect(
        manageBrowserSessions(sender, { action: "clear", id: "default", data: "site-data" })
    ).rejects.toThrow();
    await expect(
        manageBrowserSessions(sender, { action: "clear", id: "work", data: "invalid" } as any)
    ).rejects.toThrow();
    expect(work.clearCache).not.toHaveBeenCalled();
});

it("rejects closed and foreign private sessions and invalid partition registrations", async () => {
    const browser = makeSession();
    mocks.partitions.set("kronterm-private-foreign", browser);
    registerPrivateBrowserPartition("kronterm-private-foreign");
    mocks.guests.push(guest(5, browser, 999));
    registerPrivateBrowserPartition("persist:hermes");
    await expect(manageBrowserSessions(sender, { action: "clear", id: "private:5", data: "cache" })).rejects.toThrow();
    expect(browser.clearCache).not.toHaveBeenCalled();
    mocks.guests.length = 0;
    expect(await manageBrowserSessions(sender, { action: "list" })).toHaveLength(3);
});
