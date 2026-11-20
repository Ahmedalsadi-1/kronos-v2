// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { shell, type Session, type WebContents } from "electron";
import { randomUUID } from "node:crypto";
import {
    BrowserSitePermissions,
    type BrowserPermissionDecision,
    type BrowserSitePermission,
    type BrowserSiteSettings,
    type BrowserSiteSettingsCommand,
} from "../../frontend/types/browser-site-settings";

type BrowserSessionState = {
    rules: Map<string, BrowserSiteSettings["permissions"]>;
    downloads: (BrowserSiteSettings["downloads"][number] & { savePath?: string })[];
    observers: Set<WebContents>;
};

const states = new WeakMap<Session, BrowserSessionState>();

function siteOrigin(value: string): string | null {
    const url = URL.parse(value);
    return url && (url.protocol === "http:" || url.protocol === "https:") ? url.origin : null;
}

export function watchBrowserSession(session: Session): BrowserSessionState {
    const existing = states.get(session);
    if (existing) return existing;
    const state: BrowserSessionState = { rules: new Map(), downloads: [], observers: new Set() };
    states.set(session, state);
    const changed = () => {
        for (const observer of state.observers) {
            if (!observer.isDestroyed()) observer.send("browser-downloads-changed");
        }
    };

    const allowed = (contents: WebContents | null, permission: string, url: string) => {
        if (!BrowserSitePermissions.includes(permission as BrowserSitePermission)) return true;
        if (!contents) return false;
        if (contents.getType() !== "webview") return true;
        const origin = siteOrigin(url);
        return (
            origin != null &&
            origin === siteOrigin(contents.getURL()) &&
            state.rules.get(origin)?.[permission as BrowserSitePermission] === "allow"
        );
    };
    session.setPermissionCheckHandler((contents, permission, origin) => allowed(contents, permission, origin));
    session.setPermissionRequestHandler((contents, permission, callback, details) =>
        callback(allowed(contents, permission, details.requestingUrl ?? contents.getURL()))
    );
    session.on("will-download", (_event, item, contents) => {
        if (contents?.getType() !== "webview") return;
        const row: BrowserSessionState["downloads"][number] = {
            id: randomUUID(),
            filename: item.getFilename().slice(0, 250),
            state: "progressing",
            received: item.getReceivedBytes(),
            total: item.getTotalBytes(),
        };
        state.downloads.unshift(row);
        state.downloads.length = Math.min(state.downloads.length, 100);
        changed();
        item.on("updated", () => {
            row.received = item.getReceivedBytes();
            row.total = item.getTotalBytes();
            changed();
        });
        item.once("done", (_event, status) => {
            row.received = item.getReceivedBytes();
            row.total = item.getTotalBytes();
            row.state = status;
            if (status === "completed") row.savePath = item.getSavePath();
            row.canReveal = Boolean(row.savePath);
            changed();
        });
    });
    return state;
}

export function readBrowserSiteSettings(
    guest: WebContents,
    command: BrowserSiteSettingsCommand,
    observer?: WebContents
): BrowserSiteSettings {
    const state = watchBrowserSession(guest.session);
    if (observer && !state.observers.has(observer)) {
        state.observers.add(observer);
        observer.once("destroyed", () => state.observers.delete(observer));
    }
    if (command.revealDownloadId != null) {
        const download = state.downloads.find(({ id }) => id === command.revealDownloadId);
        if (!download?.savePath) throw new Error("This download has no saved file to show.");
        shell.showItemInFolder(download.savePath);
    }
    const origin = siteOrigin(guest.getURL());
    const change = command.change;
    if (change != null) {
        if (
            !origin ||
            change.origin !== origin ||
            !BrowserSitePermissions.includes(change.permission) ||
            !(["allow", "block", "default"] satisfies BrowserPermissionDecision[]).includes(change.decision)
        ) {
            throw new Error("This permission change does not match the current browser site.");
        }
        const permissions = state.rules.get(origin) ?? {};
        if (change.decision === "default") delete permissions[change.permission];
        else permissions[change.permission] = change.decision;
        if (Object.keys(permissions).length) state.rules.set(origin, permissions);
        else state.rules.delete(origin);
    }
    return {
        origin,
        permissions: { ...state.rules.get(origin) },
        downloads: state.downloads.map(({ savePath: _savePath, ...row }) => row),
    };
}
