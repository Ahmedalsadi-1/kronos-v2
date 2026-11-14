// Copyright (c) 2026 KronTerm. Licensed under the Apache License, Version 2.0 (the "License").

import { describe, expect, it } from "vitest";
import { CoucouPalettes, coucouAppearance, coucouPalette } from "./coucou-palettes";
import {
    BUILTIN_THEME_LIST,
    CoucouThemes,
    DEFAULT_SKIN_NAME,
    DEFAULT_THEME_MODE,
    DEFAULT_TYPOGRAPHY,
    coucouTheme,
} from "./presets";

describe("built-in Hermes themes", () => {
    it("does not inject remote font stylesheets into the KronOS renderer", () => {
        expect(BUILTIN_THEME_LIST.map((theme) => theme.typography?.fontUrl).filter(Boolean)).toEqual([]);
    });

    it("starts fresh Hermes sessions with the Coucou palette and native typography", () => {
        expect(DEFAULT_THEME_MODE).toBe("dark");
        expect(DEFAULT_SKIN_NAME).toBe("coucou");
        expect(coucouTheme.typography.fontSans).toMatch(/^-apple-system/);
        expect(coucouTheme.darkColors).toMatchObject({
            background: "#000000",
            foreground: "#F5F6F8",
            card: "#141416",
            primary: "#F5F6F8",
            midground: "#967AFF",
        });
    });

    it("uses bundled UI and code fonts as the universal Hermes pairing", () => {
        expect(DEFAULT_TYPOGRAPHY.fontSans).toContain("Inter");
        expect(DEFAULT_TYPOGRAPHY.fontMono).toContain("JetBrains Mono");
    });
});

describe("Coucou palette parity", () => {
    it("includes every upstream pill color on the native black material", () => {
        expect(CoucouPalettes.slice(1).map((palette) => palette.accent)).toEqual([
            "#F5F6F8",
            "#F4505E",
            "#F29B38",
            "#FACC15",
            "#4ADE80",
            "#2DD4BF",
            "#38BDF8",
            "#818CF8",
            "#C084FC",
            "#E879F9",
        ]);
        for (const theme of CoucouThemes) {
            expect(BUILTIN_THEME_LIST).toContainEqual(theme);
            expect(theme.colors.background).toBe("#000000");
            expect(theme.colors).toEqual(theme.darkColors);
            expect(theme.typography.fontSans).toMatch(/^-apple-system/);
        }
    });
    it("validates theme requests without accepting arbitrary CSS or coerced values", () => {
        expect(coucouAppearance("coucou-teal", true)).toMatchObject({
            chrome: "coucou",
            theme: "coucou-teal",
            reducedMotion: true,
        });
        expect(coucouAppearance("url(javascript:alert(1))", "yes")).toMatchObject({
            chrome: "coucou",
            theme: "coucou",
            reducedMotion: false,
        });
        expect(coucouPalette({ name: "coucou-pink" })).toBeUndefined();
    });
    it("shares OS materials and accessibility preferences without accepting injected material values", () => {
        const appearance = coucouAppearance("coucou-teal", false, {
            colorScheme: "light",
            contrast: "high",
            reducedTransparency: true,
            reducedMotion: true,
            materials: { content: "url(unsafe)" },
        } as any);
        expect(appearance).toMatchObject({
            colorScheme: "light",
            contrast: "high",
            reducedTransparency: true,
            reducedMotion: true,
            materials: { content: "#f4f4f6", label: "#1d1d1f", secondary: "#1d1d1f", separator: "#1d1d1f" },
        });
    });
});
