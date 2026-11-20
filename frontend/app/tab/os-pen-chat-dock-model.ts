// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const PenChatDockApps = ["browser", "terminal", "files", "sandbox", "android", "iphone"] as const;

export type PenMobileSelection = { platform: "android" | "iphone"; targetId?: string; name?: string };

export const PenChatDockMeta = "os:chatdock";
export type PenChatDockApp = (typeof PenChatDockApps)[number];
export type PenChatDockTab = {
    id: string;
    app: PenChatDockApp | "widget";
    title?: string;
    url?: string;
    partition?: string;
    path?: string;
    canvas?: boolean;
    mobilePreview?: "iphone" | "android";
};

export function isPenChatDockApp(value: unknown): value is PenChatDockApp {
    return PenChatDockApps.some((app) => app === value);
}

export function getMobilePreviewPlatform(value: unknown): PenMobileSelection["platform"] | undefined {
    if (typeof value !== "string") return;
    try {
        const url = new URL(value);
        if (
            url.protocol !== "http:" ||
            !["localhost", "127.0.0.1"].includes(url.hostname) ||
            url.username ||
            url.password ||
            url.pathname !== "/"
        )
            return;
        if (url.port === "3200") return "iphone";
        if (url.port === "3201") return "android";
    } catch {
        return;
    }
}
