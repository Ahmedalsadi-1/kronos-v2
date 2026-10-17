// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import { selectNativeSurfaceSource } from "./native-surface-selection";

const Sources = [
    { id: "chrome-1", name: "Google Chrome" },
    { id: "notes-1", name: "Notes — Work" },
    { id: "kronterm-1", name: "KronTerm" },
];

describe("native surface source selection", () => {
    test("prefers an exact normalized application name", () => {
        expect(selectNativeSurfaceSource(Sources, "google chrome")?.id).toBe("chrome-1");
    });

    test("uses one unambiguous partial title match", () => {
        expect(selectNativeSurfaceSource(Sources, "Notes")?.id).toBe("notes-1");
    });

    test("does not guess when several windows match an application", () => {
        expect(
            selectNativeSurfaceSource(
                [
                    { id: "chrome-1", name: "Google Chrome — Work" },
                    { id: "chrome-2", name: "Google Chrome — Personal" },
                ],
                "Google Chrome"
            )
        ).toBeUndefined();
    });

    test("falls back only when exactly one non-KronTerm window exists", () => {
        expect(
            selectNativeSurfaceSource(
                [
                    { id: "finder-1", name: "Finder" },
                    { id: "kronterm-1", name: "KronTerm" },
                ],
                "Unknown App"
            )?.id
        ).toBe("finder-1");
        expect(selectNativeSurfaceSource(Sources, "Unknown App")).toBeUndefined();
    });
});
