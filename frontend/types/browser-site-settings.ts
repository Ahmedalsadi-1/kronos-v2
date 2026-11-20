// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const BrowserSitePermissions = ["media", "geolocation", "notifications", "clipboard-read"] as const;
export type BrowserSitePermission = (typeof BrowserSitePermissions)[number];
export type BrowserPermissionDecision = "default" | "allow" | "block";

export type BrowserSiteSettings = {
    origin: string | null;
    permissions: Partial<Record<BrowserSitePermission, BrowserPermissionDecision>>;
    downloads: {
        id: string;
        filename: string;
        canReveal?: boolean;
        state: "progressing" | "completed" | "cancelled" | "interrupted";
        received: number;
        total: number;
    }[];
};

export type BrowserSiteSettingsCommand = {
    guestId: number;
    revealDownloadId?: string;
    change?: { origin: string; permission: BrowserSitePermission; decision: BrowserPermissionDecision };
};
