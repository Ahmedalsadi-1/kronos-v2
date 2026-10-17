// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { makeSystemAppearanceSnapshot } from "./system-appearance";

describe("makeSystemAppearanceSnapshot", () => {
    it("maps the default native appearance", () => {
        expect(
            makeSystemAppearanceSnapshot({
                dark: false,
                highContrast: false,
                reducedMotion: false,
                reducedTransparency: false,
            })
        ).toEqual({
            colorScheme: "light",
            contrast: "normal",
            reducedMotion: false,
            reducedTransparency: false,
        });
    });

    it("preserves every accessibility preference in dark mode", () => {
        expect(
            makeSystemAppearanceSnapshot({
                dark: true,
                highContrast: true,
                reducedMotion: true,
                reducedTransparency: true,
            })
        ).toEqual({
            colorScheme: "dark",
            contrast: "high",
            reducedMotion: true,
            reducedTransparency: true,
        });
    });
});
