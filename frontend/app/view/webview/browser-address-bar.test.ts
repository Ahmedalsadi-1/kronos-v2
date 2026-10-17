// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { browserAddressSuggestions } from "./browser-address-bar";

describe("browser address suggestions", () => {
    it("combines matching recent history with bookmarks, removing duplicate destinations", () => {
        expect(
            browserAddressSuggestions(
                "kron",
                ["https://kronterm.dev", "https://example.com"],
                [
                    { type: "url", suggestionid: "one", display: "KronTerm", "url:url": "https://kronterm.dev" },
                    { type: "url", suggestionid: "two", display: "Docs", "url:url": "https://docs.kronterm.dev" },
                ]
            )
        ).toEqual([
            { url: "https://kronterm.dev", label: "https://kronterm.dev" },
            { url: "https://docs.kronterm.dev", label: "Docs" },
        ]);
    });
    it("bounds the suggestions list", () => {
        expect(
            browserAddressSuggestions(
                "",
                Array.from({ length: 100 }, (_, index) => `https://site${index}.test`),
                []
            )
        ).toHaveLength(8);
    });
});
