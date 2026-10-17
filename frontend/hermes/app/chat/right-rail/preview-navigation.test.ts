import { describe, expect, it } from "vitest";

import { normalizePreviewNavigationInput } from "./preview-navigation";

describe("preview navigation", () => {
    it.each([
        ["example.com", "https://example.com"],
        ["localhost:3000/app", "http://localhost:3000/app"],
        ["https://example.com/docs", "https://example.com/docs"],
    ])("normalizes %s", (input, expected) => {
        expect(normalizePreviewNavigationInput(input)).toBe(expected);
    });
});
