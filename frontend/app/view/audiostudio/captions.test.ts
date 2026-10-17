// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { captionTimestamp, captionsFromSrt, captionsToSrt, validateCaptions } from "./captions";
describe("Audio caption artifacts", () => {
    it("round trips multiline captions and preserves millisecond timing", () => {
        const rows = [{ id: "a", start: 1.125, end: 3.4, text: "Hello\nworld" }];
        expect(captionsFromSrt(captionsToSrt(rows))).toEqual([{ ...rows[0], id: "import-0" }]);
        expect(captionTimestamp(3661.123)).toBe("01:01:01,123");
    });
    it("normalizes Windows lines and a UTF-8 BOM", () => {
        expect(captionsFromSrt("\uFEFF1\r\n00:00:00,000 --> 00:00:01,000\r\nHi\r\n")[0].text).toBe("Hi");
    });
    it("rejects broken timestamps and inverted or duplicate rows", () => {
        expect(() => captionsFromSrt("1\n00:70:00,000 --> 00:71:00,000\nHi")).toThrow();
        expect(() => validateCaptions([{ id: "a", start: 3, end: 2, text: "Hi" }])).toThrow();
        expect(() =>
            validateCaptions([
                { id: "a", start: 0, end: 1, text: "Hi" },
                { id: "a", start: 2, end: 3, text: "There" },
            ])
        ).toThrow();
        expect(() => captionTimestamp(NaN)).toThrow();
    });
    it("exports stable chronological captions", () => {
        const result = captionsToSrt([
            { id: "b", start: 3, end: 4, text: "Later" },
            { id: "a", start: 0, end: 1, text: "First" },
        ]);
        expect(result.indexOf("First")).toBeLessThan(result.indexOf("Later"));
    });
});
