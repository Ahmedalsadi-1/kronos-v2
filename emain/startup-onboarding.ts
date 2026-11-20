// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BrowserWindow, dialog, ipcMain, screen } from "electron";
import path from "node:path";
import { getElectronAppBasePath } from "./emain-platform";
import { kronosAccount } from "./kronos-auth";
import { waitForKronosStartupSignIn } from "./kronos-signin";
import { OnboardingEntry, prepareOnboardingSession } from "./onboarding-content";
import { isStartupWelcomeFrame } from "./startup-onboarding-route";

const CompletionChannel = "startup-onboarding:complete";
const SignInChannel = "startup-onboarding:signin";
let setupWindow: BrowserWindow;

export function focusStartupOnboarding() {
    if (!setupWindow || setupWindow.isDestroyed() || !setupWindow.isVisible()) return;
    if (setupWindow.isMinimized()) setupWindow.restore();
    setupWindow.focus();
}

export async function runStartupOnboarding(
    previewRoot: string,
    complete: (parent: BrowserWindow) => Promise<unknown>
): Promise<boolean> {
    const previewSession = await prepareOnboardingSession(previewRoot, "kronos-startup-onboarding");
    const {
        x,
        y,
        width: availableWidth,
        height: availableHeight,
    } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const scale = Math.min(1, (availableWidth - 40) / 1200, (availableHeight - 40) / 750);
    const width = Math.floor(1200 * scale);
    const height = Math.floor(750 * scale);
    const root = getElectronAppBasePath();
    const win = new BrowserWindow({
        title: "Welcome to KronOS",
        x: x + Math.floor((availableWidth - width) / 2),
        y: y + Math.floor((availableHeight - height) / 2),
        width,
        height,
        minWidth: Math.min(640, width),
        minHeight: Math.min(450, height),
        show: false,
        backgroundColor: "#f4f4f4",
        webPreferences: {
            preload: path.join(root, "preload", "startup-onboarding.cjs"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            session: previewSession,
        },
    });
    setupWindow = win;
    const entry = OnboardingEntry;
    return new Promise((resolve, reject) => {
        let completed = false;
        let saving = false;
        let loadError: Error;
        let signingIn = false;
        ipcMain.handle(SignInChannel, async (event, provider: unknown) => {
            if (
                win.isDestroyed() ||
                event.sender !== win.webContents ||
                event.senderFrame !== win.webContents.mainFrame ||
                !isStartupWelcomeFrame(event.senderFrame?.url || "", entry) ||
                (provider !== "google" && provider !== "github" && provider !== "email")
            ) {
                throw new Error("Invalid setup sign-in request.");
            }
            if (signingIn) throw new Error("Finish the current sign-in first.");
            signingIn = true;
            try {
                if (provider === "google" || provider === "github")
                    await kronosAccount({ action: "provider", provider });
                else await waitForKronosStartupSignIn(win);
                return Boolean((await kronosAccount({ action: "status" })).account);
            } finally {
                signingIn = false;
            }
        });
        ipcMain.handle(CompletionChannel, async (event) => {
            const location = new URL(event.senderFrame?.url || "about:blank");
            if (
                win.isDestroyed() ||
                event.sender !== win.webContents ||
                event.senderFrame !== win.webContents.mainFrame ||
                location.origin + location.pathname !== entry ||
                location.hash !== "#finished"
            ) {
                throw new Error("Invalid setup window.");
            }
            if (saving || completed) throw new Error("Setup is already finishing.");
            saving = true;
            try {
                await complete(win);
                completed = true;
                win.close();
            } catch (error) {
                if (!win.isDestroyed()) {
                    await dialog.showMessageBox(win, {
                        type: "error",
                        message: "KronOS could not save setup. Try Get started again.",
                    });
                }
                throw error;
            } finally {
                saving = false;
            }
        });
        win.on("close", (event) => {
            if (saving && !completed) event.preventDefault();
        });
        win.once("closed", () => {
            setupWindow = null;
            ipcMain.removeHandler(CompletionChannel);
            ipcMain.removeHandler(SignInChannel);
            previewSession.protocol.unhandle("http");
            if (loadError) reject(loadError);
            else resolve(completed);
        });
        win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        win.webContents.on("will-navigate", (event) => event.preventDefault());
        win.webContents.once("render-process-gone", (_event, details) => {
            loadError = new Error("Setup renderer exited: " + details.reason);
            win.destroy();
        });
        win.once("ready-to-show", () => win.show());
        void win.loadURL(entry + "#welcome").catch((error: Error) => {
            if (win.isDestroyed()) return;
            loadError = error;
            win.destroy();
        });
    });
}
