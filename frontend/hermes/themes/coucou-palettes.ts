// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import palettes from "@hermes/themes/coucou-palettes.json";
import { systemMaterials } from "../../types/system-materials";

export const CoucouPalettes = palettes;

export function coucouPalette(name: unknown) {
    return typeof name === "string" ? CoucouPalettes.find((palette) => palette.name === name) : undefined;
}

export function coucouAppearance(
    theme: unknown,
    reducedMotion: unknown,
    system: Partial<SystemAppearanceSnapshot> = {}
) {
    const appearance: SystemAppearanceSnapshot = {
        colorScheme: system.colorScheme === "light" ? "light" : "dark",
        contrast: system.contrast === "high" ? "high" : "normal",
        reducedTransparency: system.reducedTransparency === true,
        reducedMotion: reducedMotion === true || system.reducedMotion === true,
    };
    return {
        chrome: "coucou",
        theme: (coucouPalette(theme) ?? CoucouPalettes[0]).name,
        ...appearance,
        materials: systemMaterials(appearance),
    };
}
