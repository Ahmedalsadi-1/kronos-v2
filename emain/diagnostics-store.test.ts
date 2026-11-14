// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnosticLocations, DiagnosticsStore } from "./diagnostics-store";

const Directories: string[] = [];
const Metadata = { version: "0.14.4", platform: "darwin", architecture: "arm64", electron: "41" };
function fixture() {
    const dir = mkdtempSync(path.join(os.tmpdir(), "kronos-diagnostics-"));
    Directories.push(dir);
    const file = path.join(dir, "diagnostics.json");
    return { file, store: new DiagnosticsStore(file, Metadata) };
}
afterEach(() => {
    for (const dir of Directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("local diagnostics privacy", () => {
    it("keeps shipped code locations and drops paths, messages, URLs, and keys", () => {
        const stack =
            "TypeError: secret sk-do-not-share and customer prompt\n" +
            " at run (file:///Users/alice/private/KronOS.app/dist/main/index.js:10:20)\n" +
            " at render (http://localhost:5173/assets/chat-abc.js:33:44)\n" +
            " at local (/Users/alice/private/project.ts:5:6)\n" +
            " at remote (https://example.com/user?token=secret:7:8)";
        const { file, store } = fixture();
        store.record({ source: "renderer", name: "TypeError", stack, message: "private" } as any);
        expect(store.report().entries[0].locations).toEqual([
            "main/index.js:10:20",
            "frontend/assets/chat-abc.js:33:44",
        ]);
        expect(readFileSync(file, "utf8")).not.toMatch(/alice|secret|customer|private|http|message|sk-/);
        expect(store.report().automaticUploads).toBe(false);
    });

    it("limits history, persists across launches, and clears it", () => {
        const { file, store } = fixture();
        for (let index = 0; index < 70; index++)
            store.record({
                source: "react",
                name: "TypeError",
                stack: `Error\n at /dist/frontend/assets/chat.js:${index}:1`,
            });
        const restored = new DiagnosticsStore(file, Metadata);
        expect(restored.report().entries).toHaveLength(50);
        restored.clear();
        expect(new DiagnosticsStore(file, Metadata).report().entries).toEqual([]);
    });

    it("deduplicates storms and never persists arbitrary error names", () => {
        const { store } = fixture();
        for (let index = 0; index < 100; index++) store.record({ source: "main", name: "customer-secret" });
        expect(store.report().entries).toHaveLength(1);
        expect(store.report().entries[0].kind).toBe("Error");
        store.report().entries.length = 0;
        expect(store.entries).toHaveLength(1);
    });

    it("tolerates malformed input, tampered history, and an unwritable store", () => {
        const { file } = fixture();
        writeFileSync(
            file,
            JSON.stringify([{ id: "secret", source: "main", kind: "Error", locations: ["/Users/alice"] }])
        );
        expect(new DiagnosticsStore(file, Metadata).entries).toEqual([]);
        writeFileSync(file, "not json");
        const store = new DiagnosticsStore(file, Metadata);
        expect(store.entries).toEqual([]);
        expect(() =>
            new DiagnosticsStore("/nonexistent/kronos/diagnostics.json", Metadata).record({ source: "main" })
        ).not.toThrow();
        expect(diagnosticLocations(null)).toEqual([]);
        expect(diagnosticLocations("Error\n at /dist/main/../../secret.js:1:2")).toEqual([]);
    });

    it("drops extra fields from otherwise valid saved records", () => {
        const { file, store } = fixture();
        store.record({ source: "main", name: "TypeError" });
        const entry = store.entries[0];
        writeFileSync(file, JSON.stringify([{ ...entry, message: "private conversation", apiKey: "secret" }]));
        const restored = new DiagnosticsStore(file, Metadata);
        expect(restored.report().entries).toEqual([entry]);
        expect(JSON.stringify(restored.report())).not.toMatch(/secret|private conversation|apiKey/);
    });
});
