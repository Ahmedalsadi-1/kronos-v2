import { describe, expect, it } from "vitest";
import { clampGrabPayload } from "./browser-grab-payload";

const raw = () => ({
    page: { sanitizedUrl: "https://user:password@example.com/page?access_token=secret#hash", title: "Example" },
    target: {
        tagName: "button",
        selector: "#save",
        textSnippet: "Save",
        htmlSnippet: "<button>Save</button>",
        attributes: {},
        rectViewport: { x: 10, y: 20, width: 30, height: 40 },
    },
    nearbyText: ["Save"],
    ancestorPath: ["main"],
});

describe("browser grab untrusted payloads", () => {
    it("rejects invalid shapes and guest supplied screenshots", () => {
        for (const value of [null, 5, {}, { page: {} }]) expect(clampGrabPayload(value)).toBeNull();
        expect(
            clampGrabPayload({ ...raw(), screenshot: { dataUrl: "data:image/png;base64,untrusted" } })?.screenshot
        ).toBeNull();
    });

    it("strips credentials, URL tokens, unsafe schemes, and executable attributes", () => {
        const source = raw();
        source.target.attributes = {
            href: "javascript:alert(1)",
            src: "data:text/html,markup",
            onclick: "steal()",
            title: "api_key=secret",
        };
        const result = clampGrabPayload(source);
        expect(result.page.sanitizedUrl).toBe("https://example.com/page");
        expect(result.target.attributes).toEqual({ href: "", src: "", title: "[redacted]" });
    });

    it("redacts metadata and text while retaining safe source context", () => {
        const source = raw();
        Object.assign(source.target, {
            selector: 'input[name="password"]',
            cssClasses: "access_token=secret",
            sourceFile: "src/Button.tsx:12:4",
            reactComponents: "<App> <Button>",
            selectedText: "password=secret",
            textSnippet: "Bearer abc123",
            htmlSnippet:
                '<input value="private" onclick="steal()"><textarea>private</textarea><script>steal()</script>',
        });
        source.nearbyText = ["token=private"];
        source.ancestorPath = ["client_secret"];
        const result = clampGrabPayload(source);
        expect(result.target.selector).toBe("[redacted]");
        expect(result.target.cssClasses).toBe("[redacted]");
        expect(result.target.selectedText).toBe("[redacted]");
        expect(result.target.sourceFile).toBe("src/Button.tsx:12:4");
        expect(result.target.textSnippet).toBe("Bearer [redacted]");
        expect(result.target.htmlSnippet).toBe("<input><textarea>[redacted]</textarea>");
        expect(result.nearbyText).toEqual(["token=[redacted]"]);
        expect(result.ancestorPath).toEqual(["[redacted]"]);
    });

    it("caps collection/string budgets and normalizes non-finite geometry", () => {
        const source = raw();
        Object.assign(source.target, {
            nearbyElements: Array.from({ length: 20 }, () => "context"),
            reactComponents: "<App>".repeat(500),
            rectViewport: { x: NaN, y: Infinity, width: 30, height: 40 },
        });
        const result = clampGrabPayload(source);
        expect(result.target.nearbyElements).toHaveLength(6);
        expect(result.target.reactComponents.length).toBeLessThanOrEqual(512);
        expect(result.target.rectViewport).toEqual({ x: 0, y: 0, width: 30, height: 40 });
    });
});
