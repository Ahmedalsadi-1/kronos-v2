// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";
import { coucouTheme } from "./presets";
import { systemHudTheme } from "./system-hud-theme";

test("native chat follows light OS materials even when its profile is a dark skin", () => {
    const originalColors = { ...coucouTheme.colors };
    const theme = systemHudTheme(coucouTheme, {
        colorScheme: "light",
        contrast: "high",
        reducedMotion: true,
        reducedTransparency: true,
    });
    expect(theme.colors.background).toBe("#f4f4f6");
    expect(theme.colors.mutedForeground).toBe(theme.colors.foreground);
    expect(theme.colors.ring).toBe("#2463c6");
    expect(coucouTheme.colors).toEqual(originalColors);
});
