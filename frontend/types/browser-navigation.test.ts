import { describe, expect, it } from "vitest";
import { browserNavigationSnapshot } from "./browser-navigation";

describe("saved browser navigation", () => {
    it("keeps the selected history index and excludes opaque page state and credential URLs", () => {
        const snapshot = browserNavigationSnapshot({ entries: [{ url: "https://example.com/first", title: "First", pageState: "form-password" }, { url: "https://user:password@example.com/next?token=secret&tab=files", title: "Next" }], index: 0 });
        expect(snapshot).toEqual({ entries: [{ url: "https://example.com/first", title: "First" }, { url: "https://example.com/next?tab=files", title: "Next" }], index: 0 });
    });
    it("rejects invalid indexes, oversized histories, and executable schemes", () => {
        expect(browserNavigationSnapshot({ entries: [{ url: "javascript:alert(1)", title: "Bad" }], index: 0 })).toBeNull();
        expect(browserNavigationSnapshot({ entries: [{ url: "https://example.com", title: "Page" }], index: 1 })).toBeNull();
        expect(browserNavigationSnapshot({ entries: Array.from({ length: 61 }, () => ({ url: "https://example.com", title: "Page" })), index: 0 })).toBeNull();
    });
});
