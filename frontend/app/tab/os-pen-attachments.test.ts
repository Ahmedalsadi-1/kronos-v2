// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { penComposerAttachments } from "./os-pen-attachments";

describe("Pen attachment normalization", () => {
    it("preserves UTF-8 text, PDF bytes and image bytes for the existing Hermes staging path", () => {
        const files = penComposerAttachments([
            { type: "text", name: "notes.md", content: "Hello مرحبا 🌍" },
            { type: "pdf", name: "reference.pdf", data: "JVBERg==" },
            {
                type: "image",
                name: "photo.png",
                path: "/untrusted/path",
                source: { type: "base64", media_type: "image/png", data: "aW1hZ2U=" },
            },
        ]);
        expect(Buffer.from(files[0].fileDataUrl.split(",")[1], "base64").toString("utf8")).toBe("Hello مرحبا 🌍");
        expect(files[1].fileDataUrl).toBe("data:application/pdf;base64,JVBERg==");
        expect(files[2]).toMatchObject({
            kind: "image",
            path: "photo.png",
            imageDataUrl: "data:image/png;base64,aW1hZ2U=",
        });
        expect(new Set(files.map(({ id }) => id)).size).toBe(3);
    });

    it("fails an entire submission for malformed or unsupported files rather than dropping one", () => {
        for (const file of [
            { type: "pdf", name: "bad.pdf", data: "not base64" },
            { type: "path", name: "secret.txt", path: "/private/secret.txt" },
            { type: "audio", name: "voice.wav", data: "aGVsbG8=" },
            { type: "text", name: "..", content: "" },
            {
                type: "image",
                name: "bad.svg",
                source: { type: "base64", media_type: "image/svg+xml", data: "aGVsbG8=" },
            },
        ]) {
            expect(() => penComposerAttachments([{ type: "text", name: "valid.txt", content: "ok" }, file])).toThrow();
        }
    });

    it("bounds file count, individual data and cumulative bytes", () => {
        expect(() => penComposerAttachments(Array(21).fill({ type: "text", name: "x", content: "" }))).toThrow(
            /at most/
        );
        expect(() =>
            penComposerAttachments([{ type: "text", name: "large", content: "x".repeat(20 * 1024 * 1024 + 1) }])
        ).toThrow(/limit/);
        const file = { type: "text", name: "large.txt", content: "x".repeat(11 * 1024 * 1024) };
        expect(() => penComposerAttachments([file, file])).toThrow(/total/);
        expect(penComposerAttachments(undefined)).toEqual([]);
    });
});
