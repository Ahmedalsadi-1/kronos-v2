// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BrowserWindow, nativeTheme, type BaseWindow } from "electron";
import path from "node:path";
import { getElectronAppBasePath } from "./emain-platform";

const signInWindows = new WeakMap<BaseWindow, BrowserWindow>();

export function openKronosTestSignIn(parent: BaseWindow): void {
    const existing = signInWindows.get(parent);
    if (existing && !existing.isDestroyed()) {
        if (existing.isVisible()) existing.focus();
        return;
    }
    const popup = new BrowserWindow({
        parent,
        modal: true,
        title: "KronOS Sign In",
        width: 464,
        height: 594,
        minWidth: 340,
        minHeight: 400,
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#121417" : "#f1f3f6",
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            partition: "kronos-test-signin",
        },
    });
    signInWindows.set(parent, popup);
    popup.once("closed", () => signInWindows.delete(parent));
    popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    popup.webContents.on("will-navigate", (event) => event.preventDefault());
    popup.once("ready-to-show", () => popup.show());
    const renderer = process.env.ELECTRON_RENDERER_URL;
    const load = renderer
        ? popup.loadURL(new URL("signin.html", renderer).href)
        : popup.loadFile(path.join(getElectronAppBasePath(), "frontend", "signin.html"));
    void load.catch((error) => {
        console.warn("KronOS test sign-in could not open", error);
        if (!popup.isDestroyed()) popup.destroy();
    });
}
