// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import palettes from "./system-materials.json";

export function systemMaterials(appearance: Pick<SystemAppearanceSnapshot, "colorScheme" | "contrast">) {
    const palette = palettes[appearance.colorScheme === "dark" ? "dark" : "light"];
    return appearance.contrast === "high"
        ? { ...palette, secondary: palette.label, tertiary: palette.label, separator: palette.label }
        : palette;
}

export function systemMaterialVariables(appearance: SystemAppearanceSnapshot): Record<string, string> {
    const palette = systemMaterials(appearance);
    return {
        "--kt-content": palette.content,
        "--kt-window": palette.window,
        "--kt-bar": palette.bar,
        "--kt-sidebar": palette.sidebar,
        "--kt-popover": palette.popover,
        "--kt-label": palette.label,
        "--kt-label-secondary": palette.secondary,
        "--kt-label-tertiary": palette.tertiary,
        "--kt-danger": palette.danger,
        "--kt-focus-ring": `var(--accent-color, ${palette.focus})`,
    };
}
