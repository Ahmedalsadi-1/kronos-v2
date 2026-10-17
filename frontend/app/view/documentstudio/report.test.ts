// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import { emptyReport, makeSource, reportMarkdown, ReportSizeLimit, ReportStore, validateReport } from "./report";

function disk() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
}
describe("Document Studio reports", () => {
    test("saves body, source provenance and revision across reloads; rejects stale updates", () => {
        const storage = disk();
        const store = new ReportStore(storage, "doc");
        const source = makeSource("Evidence", "https://user:secret@example.com/report", "Quoted evidence");
        const saved = store.save(
            { ...emptyReport(), title: "Research", body: "A finding [1].", sources: [source], nextSourceNumber: 2 },
            0
        );
        expect(saved.revision).toBe(1);
        expect(new ReportStore(storage, "doc").load()).toEqual(saved);
        expect(source.url).toBe("https://example.com/report");
        expect(reportMarkdown(saved)).toContain("Source: <https://example.com/report>");
        expect(reportMarkdown(saved)).toContain("> Quoted evidence");
        expect(() => store.save({ ...saved, body: "Stale" }, 0)).toThrow("changed");
        expect(store.load().body).toBe("A finding [1].");
    });
    test("removing sources preserves remaining citation numbers and next number", () => {
        const report = {
            ...emptyReport(),
            sources: [makeSource("Second", "https://example.com/second", "quote", 2)],
            nextSourceNumber: 3,
        };
        expect(reportMarkdown(report)).toContain("### [2] Second");
        expect(validateReport(report).nextSourceNumber).toBe(3);
        expect(() => validateReport({ ...report, nextSourceNumber: 2 })).toThrow("next source");
    });
    test("rejects unsafe sources, excessive reports and duplicate provenance identifiers", () => {
        expect(() => makeSource("Unsafe", "javascript:alert(1)", "")).toThrow("HTTP");
        expect(() => makeSource("", "https://example.com", "")).toThrow("title");
        expect(() => validateReport({ ...emptyReport(), body: "x".repeat(ReportSizeLimit) })).toThrow("256 KB");
        const source = makeSource("Source", "https://example.com", "");
        expect(() => validateReport({ ...emptyReport(), sources: [source, source], nextSourceNumber: 2 })).toThrow(
            "source"
        );
    });
    test("write failures do not report a successful revision or replace saved content", () => {
        const storage = disk();
        const store = new ReportStore(storage, "doc");
        const saved = store.save({ ...emptyReport(), body: "Original" }, 0);
        const broken = new ReportStore(
            {
                getItem: storage.getItem,
                setItem: () => {
                    throw new Error("Storage full");
                },
            },
            "doc"
        );
        expect(() => broken.save({ ...saved, body: "Changed" }, 1)).toThrow("Storage full");
        expect(store.load()).toEqual(saved);
    });
});
