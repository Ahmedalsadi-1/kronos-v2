import { describe, expect, it } from "vitest";
import { validateBrowserPreferences, type BrowserPreferences } from "./browser-preferences";
const defaults: BrowserPreferences = {
    "web:defaulturl": "about:blank",
    "web:defaultsearch": "https://example.com/search?q={query}",
    "web:openlinksinternally": true,
};
describe("browser preferences", () => {
    it("accepts an empty start page and a query template", () => expect(validateBrowserPreferences(defaults)).toBe(""));
    it("rejects executable URLs and malformed URLs", () => {
        expect(validateBrowserPreferences({ ...defaults, "web:defaulturl": "javascript:alert(1)" })).toContain("http");
        expect(validateBrowserPreferences({ ...defaults, "web:defaulturl": "example" })).toContain("complete URL");
    });
    it("requires search templates to preserve the user's search terms", () =>
        expect(validateBrowserPreferences({ ...defaults, "web:defaultsearch": "https://example.com" })).toContain(
            "{query}"
        ));
});
