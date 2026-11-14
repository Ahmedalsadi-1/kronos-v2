// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";
import { systemMaterials } from "./system-materials";

function luminance(hex: string): number {
    const [r, g, b] = hex
        .slice(1)
        .match(/../g)
        .map((part) => {
            const channel = parseInt(part, 16) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

test.each(["light", "dark"] as const)("%s system materials keep labels and controls readable", (colorScheme) => {
    const palette = systemMaterials({ colorScheme, contrast: "normal" });
    for (const surface of [palette.content, palette.window, palette.bar, palette.popover]) {
        for (const label of [palette.label, palette.secondary, palette.tertiary])
            expect(contrast(label, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette.focus, surface)).toBeGreaterThanOrEqual(3);
        expect(contrast(palette.separator, surface)).toBeGreaterThanOrEqual(3);
    }
});
