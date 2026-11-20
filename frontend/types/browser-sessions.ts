// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export type BrowserSessionInfo = {
    id: string;
    name: string;
    persistent: boolean;
    shared: boolean;
    openTabs: number;
    cookies?: number;
    cacheBytes?: number;
};

export type BrowserSessionsCommand =
    { action: "list" } | { action: "clear"; id: string; data: "cache" | "cookies" | "site-data" };
