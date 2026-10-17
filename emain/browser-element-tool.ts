// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WebContents } from "electron";
import ReactGrabSource from "../node_modules/react-grab/dist/index.global.js?raw";
import ReactGrabStyles from "../node_modules/react-grab/dist/styles.css?raw";

export function browserElementToolScript(): string {
    return `(() => {
        if (window.__KRONTERM_BROWSER_ELEMENT_TOOL__) return;
        const disabled = window.__REACT_GRAB_DISABLED__;
        window.__REACT_GRAB_DISABLED__ = true;
        try {
            ${ReactGrabSource}
            const api = window.__REACT_GRAB__ ?? window.__REACT_GRAB_MODULE__.init({
                telemetry: false, freezeReactUpdates: false
            });
            window.__REACT_GRAB_MODULE__.setGlobalApi(api);
            api.setToolbarState({ enabled: true });
            window.__KRONTERM_BROWSER_ELEMENT_TOOL__ = api;
        } finally {
            if (disabled === undefined) delete window.__REACT_GRAB_DISABLED__;
            else window.__REACT_GRAB_DISABLED__ = disabled;
        }
    })()`;
}

export async function installBrowserElementTool(guest: WebContents): Promise<void> {
    if (guest.isDestroyed() || guest.getType() !== "webview") return;
    if (!/^(https?:|file:)/i.test(guest.getURL())) return;
    await guest.insertCSS(ReactGrabStyles);
    if (guest.isDestroyed()) return;
    await guest.executeJavaScript(browserElementToolScript());
}
