import { describe, expect, test } from "vitest";
import type { BrowserGrabPayload } from "../../../types/browser-grab";
import { BrowserResearchStore, formatResearchMarkdown } from "./browser-research-store";

const fixture = {
    page: {
        title: "Source",
        sanitizedUrl: "https://user:secret@example.com/report#private",
        capturedAt: "2026-10-10T12:00:00Z",
    },
    target: { selector: "article", textSnippet: "Observed evidence", selectedText: "Selected quote" },
} as BrowserGrabPayload;
function storage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
}
describe("browser research notebook", () => {
    test("captures explicit selections with provenance and persists notes across reloads", () => {
        const disk = storage();
        const notebook = new BrowserResearchStore(disk);
        const captured = notebook.capture("browser-1", fixture, "Compare with second source");
        expect(captured).toMatchObject({
            url: "https://example.com/report",
            excerpt: "Selected quote",
            blockId: "browser-1",
        });
        notebook.updateNote(captured.id, "Reviewed");
        const restored = new BrowserResearchStore(disk);
        expect(restored.snapshot()[0].note).toBe("Reviewed");
        expect(formatResearchMarkdown(restored.snapshot())).toContain("Captured: 2026-10-10T12:00:00Z");
        expect(formatResearchMarkdown(restored.snapshot())).toContain("> Selected quote");
        restored.remove(captured.id);
        expect(new BrowserResearchStore(disk).snapshot()).toEqual([]);
    });
    test("storage failures do not report saved findings or erase unreadable data", () => {
        const notebook = new BrowserResearchStore({
            getItem: () => "[]",
            setItem: () => {
                throw new Error("Storage full");
            },
        });
        expect(() => notebook.capture("browser", fixture, "")).toThrow("Storage full");
        expect(notebook.snapshot()).toEqual([]);
        const invalid = new BrowserResearchStore({
            getItem: () => "broken",
            setItem: () => {
                throw new Error("Must not overwrite");
            },
        });
        expect(invalid.loadError).toBeTruthy();
        expect(() => invalid.capture("browser", fixture, "")).toThrow();
    });
    test("rejects empty captures and unsafe source URLs", () => {
        const notebook = new BrowserResearchStore(storage());
        expect(() =>
            notebook.capture(
                "browser",
                { ...fixture, page: { ...fixture.page, sanitizedUrl: "javascript:alert(1)" } },
                ""
            )
        ).toThrow("HTTP");
        expect(() =>
            notebook.capture(
                "browser",
                { ...fixture, target: { ...fixture.target, selectedText: "", textSnippet: "" } },
                ""
            )
        ).toThrow("text");
        expect(notebook.snapshot()).toEqual([]);
    });
    test("validates restored source links and does not overwrite unsafe saved notebooks", () => {
        const disk = storage();
        const notebook = new BrowserResearchStore(disk);
        const finding = notebook.capture("browser", fixture, "");
        disk.setItem("kronterm.browser.research.v1", JSON.stringify([{ ...finding, url: "javascript:alert(1)" }]));
        const restored = new BrowserResearchStore(disk);
        expect(restored.loadError).toContain("HTTP");
        expect(restored.snapshot()).toEqual([]);
        expect(() => restored.capture("browser", fixture, "")).toThrow("HTTP");
        expect(disk.getItem("kronterm.browser.research.v1")).toContain("javascript:");
        disk.setItem("kronterm.browser.research.v1", JSON.stringify([finding, finding]));
        expect(new BrowserResearchStore(disk).loadError).toContain("Duplicate");
        expect(() =>
            notebook.capture("browser", { ...fixture, page: { ...fixture.page, capturedAt: "invalid" } }, "")
        ).toThrow("capture time");
    });
});
