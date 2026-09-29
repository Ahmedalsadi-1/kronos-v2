// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { WebPreferences } from "electron";
import * as path from "path";

// Reserved for the plugin host, which will attach its own guests from main. Until then no renderer may claim them.
const ReservedPartitionPrefixes = ["persist:plugin:", "plugin:"];

// preloadURL is not in Electron's public WebPreferences type but older guests still pass it through.
type WebviewPreferences = WebPreferences & { preloadURL?: string };

type WebviewAttachParams = { src?: string; partition?: string };

type WebviewAttachDecision = {
    allow: boolean;
    reason?: string;
    strippedPreload?: string;
};

function normalizePreloadPath(preload: string): string {
    if (preload.startsWith("file://")) {
        try {
            return path.resolve(decodeURIComponent(new URL(preload).pathname));
        } catch {
            return null;
        }
    }
    return path.resolve(preload);
}

function isAllowedPreload(preload: string, allowedPreloads: string[]): boolean {
    const normalized = normalizePreloadPath(preload);
    if (normalized == null) {
        return false;
    }
    return allowedPreloads.some((allowed) => path.resolve(allowed) === normalized);
}

/**
 * Mutates `webPreferences` in place because Electron reads the same object after `will-attach-webview` returns.
 * Unknown preloads are stripped rather than rejected so a tampered page still loads without privileged code.
 */
function applyWebviewAttachPolicy(
    webPreferences: WebviewPreferences,
    params: WebviewAttachParams,
    allowedPreloads: string[]
): WebviewAttachDecision {
    const partition = params?.partition ?? "";
    if (ReservedPartitionPrefixes.some((prefix) => partition.startsWith(prefix))) {
        return { allow: false, reason: `reserved partition "${partition}"` };
    }

    let strippedPreload: string = undefined;
    for (const key of ["preload", "preloadURL"] as const) {
        const value = webPreferences[key];
        if (typeof value !== "string" || value === "") {
            continue;
        }
        if (!isAllowedPreload(value, allowedPreloads)) {
            strippedPreload = value;
            delete webPreferences[key];
        }
    }

    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.contextIsolation = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.webviewTag = false;

    return { allow: true, strippedPreload };
}

export { applyWebviewAttachPolicy, ReservedPartitionPrefixes, type WebviewAttachDecision };
