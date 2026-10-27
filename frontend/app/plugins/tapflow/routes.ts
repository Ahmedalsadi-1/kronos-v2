// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const TapflowView = "plugin:kronterm.tapflow/devices";
export const TapflowPages = {
    apps: { title: "App Center", path: "/app-center" },
    runs: { title: "Automation runs", path: "/automation/runs" },
    resources: { title: "Mac resources", path: "/mac-resources" },
    settings: { title: "Device settings", path: "/settings/default" },
    team: { title: "Team settings", path: "/settings/team" },
    tokens: { title: "API tokens", path: "/settings/tokens" },
} as const;

export function tapflowOrigin(value: string): string {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error("Enter an HTTP or HTTPS relay address without credentials, query, or fragment.");
    }
    if (url.pathname !== "/") throw new Error("Enter the relay origin without a path.");
    return url.origin;
}

export function tapflowSessionUrl(origin: string, value: string): string {
    const base = tapflowOrigin(origin);
    const url = new URL(value, base);
    if (
        url.origin !== base ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/^\/automation\/sessions\/[A-Za-z0-9_-]{1,160}$/.test(url.pathname)
    ) {
        throw new Error("Paste a Tapflow watch URL from this relay, returned by connect_device.");
    }
    return url.href;
}
