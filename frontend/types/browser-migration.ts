// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const MigrationBrowsers = {
    safari: "Safari",
    arc: "Arc",
    firefox: "Firefox",
    chrome: "Chrome",
} as const;

export type MigrationBrowser = keyof typeof MigrationBrowsers;
export type MigrationBookmark = { url: string; title: string };
export type MigratedExtension = { id: string; name: string };

export type BrowserMigrationCommand =
    | { action: "bookmarks"; bookmarks: MigrationBookmark[] }
    | { action: "install"; guestId: number; browser: MigrationBrowser }
    | { action: "extensions"; guestId: number }
    | { action: "remove"; guestId: number; id: string }
    | { action: "password-manager" };

export type BrowserMigrationResult = {
    imported?: number;
    extensions?: MigratedExtension[];
    installed?: string;
    canceled?: boolean;
};

export const MaxBookmarkImportSize = 8 * 1024 * 1024;
export const MaxImportedBookmarks = 10000;

export function normalizeMigrationBookmark(url: unknown, title: unknown): MigrationBookmark | null {
    if (typeof url !== "string" || url.length > 8192 || !URL.canParse(url)) return null;
    const parsed = new URL(url);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password)
        return null;
    if (parsed.href.length > 8192) return null;
    return { url: parsed.href, title: typeof title === "string" ? title.trim().slice(0, 512) : "" };
}
