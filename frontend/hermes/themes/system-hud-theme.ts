// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { systemMaterials } from "../../types/system-materials";
import type { DesktopTheme } from "./types";

export function isNativeHud(): boolean {
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("nativeSurface") === "hud";
}

export function readHudSystemAppearance(): SystemAppearanceSnapshot {
    const api = typeof window !== "undefined" ? (window as unknown as { api?: ElectronApi }).api : undefined;
    if (api?.getSystemAppearance) return api.getSystemAppearance();
    return {
        colorScheme:
            typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light",
        contrast: "normal",
        reducedMotion: false,
        reducedTransparency: false,
    };
}

export function systemHudTheme(theme: DesktopTheme, appearance: SystemAppearanceSnapshot): DesktopTheme {
    const palette = systemMaterials(appearance);
    return {
        ...theme,
        typography: {
            ...theme.typography,
            fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontUrl: undefined,
        },
        colors: {
            background: palette.content,
            foreground: palette.label,
            card: palette.window,
            cardForeground: palette.label,
            muted: palette.sidebar,
            mutedForeground: palette.secondary,
            popover: palette.popover,
            popoverForeground: palette.label,
            primary: palette.label,
            primaryForeground: palette.content,
            secondary: palette.sidebar,
            secondaryForeground: palette.label,
            accent: palette.sidebar,
            accentForeground: palette.label,
            border: palette.separator,
            input: palette.separator,
            ring: palette.focus,
            midground: palette.focus,
            composerRing: palette.focus,
            destructive: palette.danger,
            destructiveForeground: palette.content,
            sidebarBackground: palette.sidebar,
            sidebarBorder: palette.separator,
            userBubble: palette.window,
            userBubbleBorder: palette.separator,
        },
    };
}
