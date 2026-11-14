// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import { selectNativeSurfaceSource } from "./native-surface-selection";

const Sources = [
    { id: "chrome-1", name: "Google Chrome" },
    { id: "notes-1", name: "Notes — Work" },
    { id: "kronterm-1", name: "KronOS" },
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

    test("never captures an unrelated window even when it is the only candidate", () => {
        expect(
            selectNativeSurfaceSource(
                [
                    { id: "finder-1", name: "Finder" },
                    { id: "kronterm-1", name: "KronOS" },
                ],
                "Unknown App"
            )?.id
        ).toBeUndefined();
        expect(selectNativeSurfaceSource(Sources, "Unknown App")).toBeUndefined();
    });
});
