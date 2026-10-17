// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import palettes from "@hermes/themes/coucou-palettes.json";

export const CoucouPalettes = palettes;

export function coucouPalette(name: unknown) {
    return typeof name === "string" ? CoucouPalettes.find((palette) => palette.name === name) : undefined;
}

export function coucouAppearance(theme: unknown, reducedMotion: unknown) {
    return {
        chrome: "coucou",
        theme: (coucouPalette(theme) ?? CoucouPalettes[0]).name,
        reducedMotion: reducedMotion === true,
    };
}
