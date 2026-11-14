// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { app, ipcMain } from "electron";
import path from "node:path";
import type { DiagnosticFailure } from "../frontend/types/diagnostics";
import { DiagnosticsStore } from "./diagnostics-store";
import { getWaveDataDir } from "./emain-platform";

let store: DiagnosticsStore;

export function getDiagnosticsStore(): DiagnosticsStore {
    return (store ??= new DiagnosticsStore(path.join(getWaveDataDir(), "diagnostics.json"), {
        version: app.getVersion(),
        platform: process.platform,
        architecture: process.arch,
        electron: process.versions.electron,
    }));
}

export function recordDiagnostic(source: DiagnosticFailure["source"], error?: unknown): void {
    const failure = error instanceof Error ? error : null;
    getDiagnosticsStore().record({ source, name: failure?.name, stack: failure?.stack });
}

export function registerDiagnosticsIpc(isTrusted: (sender: Electron.WebContents) => boolean): void {
    ipcMain.handle("get-diagnostic-report", (event) => {
        if (!isTrusted(event.sender) || event.senderFrame !== event.sender.mainFrame)
            throw new Error("Unknown diagnostics caller");
        return getDiagnosticsStore().report();
    });
    ipcMain.handle("clear-diagnostic-report", (event) => {
        if (!isTrusted(event.sender) || event.senderFrame !== event.sender.mainFrame)
            throw new Error("Unknown diagnostics caller");
        getDiagnosticsStore().clear();
    });
    const recentReports = new WeakMap<Electron.WebContents, number>();
    ipcMain.on("record-renderer-failure", (event, failure: DiagnosticFailure) => {
        if (!isTrusted(event.sender) || event.senderFrame !== event.sender.mainFrame) return;
        if (!failure || (failure.source !== "renderer" && failure.source !== "react")) return;
        const now = Date.now();
        if (now - (recentReports.get(event.sender) ?? 0) < 1000) return;
        recentReports.set(event.sender, now);
        getDiagnosticsStore().record({
            source: failure.source,
            name: typeof failure.name === "string" ? failure.name.slice(0, 40) : "Error",
            stack: typeof failure.stack === "string" ? failure.stack.slice(0, 16000) : "",
        });
    });
}
