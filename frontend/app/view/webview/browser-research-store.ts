// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { BrowserGrabPayload } from "../../../types/browser-grab";

export type BrowserResearchFinding = {
    id: string;
    blockId: string;
    title: string;
    url: string;
    capturedAt: string;
    selector: string;
    excerpt: string;
    note: string;
};
const StorageKey = "kronterm.browser.research.v1";

function sourceUrl(value: string): string {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Research sources must use an HTTP or HTTPS URL");
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
}

export function formatResearchMarkdown(findings: BrowserResearchFinding[]): string {
    return [
        "# Research findings",
        ...findings.map((finding, index) =>
            [
                `## ${index + 1}. ${finding.title.replace(/[\r\n]/g, " ")}`,
                `Source: ${finding.url}`,
                `Captured: ${finding.capturedAt}`,
                `Element: ${finding.selector}`,
                finding.excerpt
                    .split("\n")
                    .map((line) => `> ${line}`)
                    .join("\n"),
                finding.note ? `Notes: ${finding.note}` : "",
            ]
                .filter(Boolean)
                .join("\n\n")
        ),
    ].join("\n\n");
}

export class BrowserResearchStore {
    private findings: BrowserResearchFinding[] = [];
    private listeners = new Set<() => void>();
    readonly loadError: string;
    constructor(private storage: Pick<Storage, "getItem" | "setItem">) {
        try {
            const saved = JSON.parse(storage.getItem(StorageKey) ?? "[]");
            if (
                !Array.isArray(saved) ||
                saved.length > 200 ||
                saved.some(
                    (entry) =>
                        !entry ||
                        ["id", "blockId", "title", "url", "capturedAt", "selector", "excerpt", "note"].some(
                            (key) => typeof entry[key] !== "string"
                        )
                )
            )
                throw new Error("Invalid saved research notebook");
            const ids = new Set<string>();
            this.findings = saved.map((finding: BrowserResearchFinding) => {
                if (ids.has(finding.id)) throw new Error("Duplicate saved research finding");
                ids.add(finding.id);
                if (!Number.isFinite(Date.parse(finding.capturedAt))) throw new Error("Invalid research capture time");
                return { ...finding, url: sourceUrl(finding.url) };
            });
        } catch (error) {
            this.loadError = error instanceof Error ? error.message : "Research storage is unavailable";
        }
    }
    snapshot = () => this.findings;
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    private persist(findings: BrowserResearchFinding[]) {
        if (this.loadError) throw new Error(this.loadError);
        this.storage.setItem(StorageKey, JSON.stringify(findings));
        this.findings = findings;
        for (const listener of this.listeners) listener();
    }
    capture(blockId: string, payload: BrowserGrabPayload, note: string): BrowserResearchFinding {
        if (this.findings.length >= 200)
            throw new Error("Notebook has 200 findings. Export or remove some before adding more.");
        const url = sourceUrl(payload.page.sanitizedUrl);
        if (!Number.isFinite(Date.parse(payload.page.capturedAt))) throw new Error("Invalid research capture time");
        const excerpt = (payload.target.selectedText || payload.target.textSnippet).trim().slice(0, 16000);
        if (!excerpt) throw new Error("Select an element containing text to save a finding");
        const finding = {
            id: crypto.randomUUID(),
            blockId,
            title: payload.page.title.slice(0, 300),
            url,
            capturedAt: payload.page.capturedAt,
            selector: payload.target.selector.slice(0, 1000),
            excerpt,
            note: note.trim().slice(0, 4000),
        };
        this.persist([...this.findings, finding]);
        return finding;
    }
    updateNote(id: string, note: string) {
        if (!this.findings.some((finding) => finding.id === id)) throw new Error("Finding no longer exists");
        this.persist(
            this.findings.map((finding) => (finding.id === id ? { ...finding, note: note.slice(0, 4000) } : finding))
        );
    }
    remove(id: string) {
        this.persist(this.findings.filter((finding) => finding.id !== id));
    }
}
let notebook: BrowserResearchStore;
export function getBrowserResearchStore(): BrowserResearchStore {
    return (notebook ??= new BrowserResearchStore({
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
    }));
}
