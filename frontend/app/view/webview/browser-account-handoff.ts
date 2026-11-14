// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const BrowserAccountRequestEvent = "kronterm:browser-account-request";
export const BrowserAccountPause =
    "This browser needs the user to finish signing in or creating an account. Ask them to use the browser's account panel and wait for Return to agent. Do not enter or read credentials.";

export function checkBrowserAccountHandoff(root: HTMLElement): void {
    if (root?.querySelector("webview[data-browser-account-private]")) throw new Error(BrowserAccountPause);
}
