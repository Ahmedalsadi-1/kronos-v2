import { describe, expect, it } from "vitest";
import { browserSelectionContext, browserSelectionPrompt, desktopSelectionPrompt } from "./selection-context";

describe("reviewed selection context", () => {
    it("sends the desktop identity, bounds, and comment without embedding image data in the prompt", () => {
        const prompt = desktopSelectionPrompt(
            {
                application: "Finder",
                bundleId: "com.apple.finder",
                window: "Downloads",
                role: "button",
                name: "Open",
                value: "",
                bounds: { x: 1, y: 2, width: 30, height: 20 },
                screenshot: "data:image/png;base64,private-image",
            },
            "Explain this control"
        );
        expect(prompt).toContain("Explain this control");
        expect(prompt).toContain('"bundleId": "com.apple.finder"');
        expect(prompt).toContain("revalidate before acting");
        expect(prompt).not.toContain("private-image");
    });
    it("preserves captured webpage context while bounding the comment", () => {
        const prompt = browserSelectionPrompt(
            {
                page: { sanitizedUrl: "https://example.com", title: "Example" },
                target: { selector: "#submit", textSnippet: "Submit" },
                screenshot: { dataUrl: "private-image" },
            } as any,
            "x".repeat(3000)
        );
        expect(prompt.split("\n")[0]).toHaveLength(2000);
        expect(prompt).toContain("#submit");
        expect(prompt).not.toContain("private-image");
    });
    it("compact context retains provenance and bounds while omitting DOM/styles and desktop values", () => {
        const context = browserSelectionContext(
            {
                page: { sanitizedUrl: "https://example.com", capturedAt: "now" },
                target: {
                    selector: "#button",
                    rectViewport: { x: 1, y: 2, width: 30, height: 20 },
                    htmlSnippet: "private DOM",
                    computedStyles: { color: "red" },
                },
                screenshot: { dataUrl: "private pixels" },
            } as any,
            "compact"
        );
        expect(context).toMatchObject({
            page: { capturedAt: "now" },
            target: { selector: "#button", rectViewport: { width: 30 } },
            screenshot: null,
        });
        expect(JSON.stringify(context)).not.toContain("private");
        expect(JSON.stringify(context)).not.toContain("computedStyles");
        expect(
            desktopSelectionPrompt(
                {
                    application: "Finder",
                    bundleId: "com.apple.finder",
                    bounds: { x: 1, y: 2, width: 30, height: 20 },
                    value: "full value",
                    screenshot: "private pixels",
                } as any,
                "Inspect",
                "compact"
            )
        ).not.toContain("full value");
    });
});
