// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BrowserWindow, ipcMain, screen, type BaseWindow } from "electron";
import path from "node:path";
import type { AccountCommand } from "../frontend/types/kronos-account";
import { getElectronAppBasePath } from "./emain-platform";
import { cancelKronosSignIn, isKronosAccountConfigured, kronosAccount } from "./kronos-auth";
import { getOnboardingRoot, OnboardingEntry, prepareOnboardingSession } from "./onboarding-content";
import { isStartupWelcomeFrame } from "./startup-onboarding-route";

let signInWindow: BrowserWindow;
let signInURL: string;
ipcMain.handle("kronos-account", (event, command: AccountCommand) => {
    if (
        !signInWindow ||
        signInWindow.isDestroyed() ||
        event.sender !== signInWindow.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        !isStartupWelcomeFrame(event.senderFrame?.url || "", OnboardingEntry)
    ) {
        throw new Error("Invalid sign-in window.");
    }
    return kronosAccount(command);
});

export function openKronosSignIn(parent?: BaseWindow): BrowserWindow {
    const existing = signInWindow;
    if (existing && !existing.isDestroyed()) {
        if (existing.isVisible()) existing.focus();
        return existing;
    }
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const popup = new BrowserWindow({
        parent,
        modal: !!parent,
        title: "KronOS Sign In",
        width: Math.min(1080, area.width - 64),
        height: Math.min(710, area.height - 64),
        minWidth: 640,
        minHeight: 450,
        show: false,
        backgroundColor: "#f4f4f4",
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            partition: "kronos-signin",
            preload: path.join(getElectronAppBasePath(), "preload", "kronos-signin.cjs"),
        },
    });
    signInWindow = popup;
    popup.once("closed", () => {
        signInWindow = undefined;
        signInURL = undefined;
        cancelKronosSignIn();
    });
    popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    popup.webContents.on("will-navigate", (event) => event.preventDefault());
    popup.once("ready-to-show", () => popup.show());
    signInURL = OnboardingEntry + "?signin=1#welcome";
    const load = prepareOnboardingSession(getOnboardingRoot(), "kronos-signin").then(() => popup.loadURL(signInURL));
    void load.catch((error) => {
        console.warn("KronOS sign-in could not open", error);
        if (!popup.isDestroyed()) popup.destroy();
    });
    return popup;
}

export async function waitForKronosStartupSignIn(parent?: BaseWindow) {
    if (!isKronosAccountConfigured()) return;
    const status = await kronosAccount({ action: "status" });
    if (status.account) return;
    const popup = openKronosSignIn(parent);
    await new Promise<void>((resolve) => popup.once("closed", resolve));
}
