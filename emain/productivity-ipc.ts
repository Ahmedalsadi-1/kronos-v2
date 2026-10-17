// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, ipcMain, Notification, powerMonitor } from "electron";
import * as hud from "./emain-hud";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";
import { getAllWaveWindows } from "./emain-window";
import {
    initializeProductivity,
    managedAppBlocked,
    managedSiteBlocked,
    productivityStore,
    subscribeProductivity,
} from "./productivity-runtime";

export function registerProductivityIpc(): void {
    const trusted = (sender: Electron.WebContents) =>
        getWaveTabViewByWebContentsId(sender.id) != null ||
        hud.listNativeHudWebContents().some((target) => target.id === sender.id);
    ipcMain.handle("productivity-get", (event) => {
        if (event.senderFrame !== event.sender.mainFrame || !trusted(event.sender))
            throw new Error("Untrusted productivity caller");
        return productivityStore().snapshot();
    });
    ipcMain.handle("productivity-update", (event, action: unknown) => {
        if (event.senderFrame !== event.sender.mainFrame || !trusted(event.sender))
            throw new Error("Untrusted productivity caller");
        return productivityStore().command(action);
    });
    ipcMain.handle("productivity-check-app", (event, input: unknown) => {
        if (event.senderFrame !== event.sender.mainFrame || !trusted(event.sender))
            throw new Error("Untrusted productivity caller");
        if (!input || typeof input !== "object") throw new Error("Invalid application");
        const { name, identifier } = input as { name?: unknown; identifier?: unknown };
        if ([name, identifier].some((value) => typeof value !== "string" || value.length > 4096))
            throw new Error("Invalid application");
        return !managedAppBlocked(String(name)) && !managedAppBlocked(String(identifier));
    });
    subscribeProductivity((state) => {
        const targets = new Map<number, Electron.WebContents>();
        for (const window of getAllWaveWindows()) {
            for (const tab of window.allLoadedTabViews.values()) targets.set(tab.webContents.id, tab.webContents);
        }
        for (const target of hud.listNativeHudWebContents()) targets.set(target.id, target);
        for (const target of targets.values()) if (!target.isDestroyed()) target.send("productivity-state", state);
        hud.publishNativeProductivity(state);
    });
    try {
        initializeProductivity((title, body) => {
            if (Notification.isSupported()) new Notification({ title, body }).show();
        });
    } catch (error) {
        console.error("[productivity] Local journal unavailable; workspace startup continues", error);
    }
    const pauseFocus = () => {
        try {
            if (
                productivityStore()
                    .snapshot()
                    .focus.some((row) => row.status === "running")
            )
                productivityStore().command({ type: "focus.pause" });
        } catch (error) {
            console.warn("[productivity] Could not checkpoint focus", error);
        }
    };
    powerMonitor.on("suspend", pauseFocus);
    app.on("will-quit", pauseFocus);
    const guardedSessions = new WeakSet<Electron.Session>();
    app.on("web-contents-created", (_event, contents) => {
        if (contents.getType() !== "webview" || guardedSessions.has(contents.session)) return;
        guardedSessions.add(contents.session);
        // One policy per guest session also covers programmatic loads and server redirects.
        contents.session.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
            callback({ cancel: details.resourceType === "mainFrame" && managedSiteBlocked(details.url) });
        });
    });
}
