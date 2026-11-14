// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain, nativeTheme, systemPreferences, webContents } from "electron";
import { makeSystemAppearanceSnapshot } from "./system-appearance";

export function readNativeSystemAppearance(): SystemAppearanceSnapshot {
    return makeSystemAppearanceSnapshot({
        dark: nativeTheme.shouldUseDarkColors,
        highContrast: nativeTheme.shouldUseHighContrastColors,
        reducedTransparency: nativeTheme.prefersReducedTransparency,
        reducedMotion: systemPreferences.getAnimationSettings().prefersReducedMotion,
    });
}

export function registerSystemAppearanceIpc(): void {
    ipcMain.on("get-system-appearance", (event) => {
        event.returnValue = readNativeSystemAppearance();
    });
    nativeTheme.on("updated", () => {
        const value = readNativeSystemAppearance();
        for (const target of webContents.getAllWebContents()) {
            if (!target.isDestroyed()) target.send("system-appearance-change", value);
        }
    });
}
