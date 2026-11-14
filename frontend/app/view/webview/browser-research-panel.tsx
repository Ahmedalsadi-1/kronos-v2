// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { getApi } from "@/store/global";
import { useAtomValue } from "jotai";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { BrowserGrabController } from "./browser-grab-controller";
import { formatResearchMarkdown, getBrowserResearchStore } from "./browser-research-store";

const ButtonClass = "cursor-pointer rounded border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50";

export function BrowserResearchPanel({ controller }: { controller: BrowserGrabController }) {
    const open = useAtomValue(controller.researchOpen);
    const selection = useAtomValue(controller.selection);
    const store = getBrowserResearchStore();
    const findings = useSyncExternalStore(store.subscribe, store.snapshot);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [notes, setNotes] = useState<Record<string, string>>({});
    useEffect(() => {
        if (!open) return;
        const close = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            globalStore.set(controller.researchOpen, false);
        };
        window.addEventListener("keydown", close);
        return () => window.removeEventListener("keydown", close);
    }, [open, controller]);
    if (!open) return null;
    const filtered = findings.filter((finding) =>
        `${finding.title} ${finding.url} ${finding.excerpt} ${finding.note}`
            .toLowerCase()
            .includes(search.toLowerCase())
    );
    const chosen = selected.length ? findings.filter((finding) => selected.includes(finding.id)) : filtered;
    const attach = async (compare: boolean) => {
        setSending(true);
        setError("");
        setMessage("");
        try {
            const instruction = compare
                ? "Compare the claims in these cited findings. Distinguish observations from inference and retain source citations."
                : "Use these cited research findings as source data for our current task. Retain source citations.";
            await getApi().sendHermesContext(`${instruction}\n\n${formatResearchMarkdown(chosen)}`);
            setMessage("Findings sent to existing Hermes chat");
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not attach findings");
        } finally {
            setSending(false);
        }
    };
    const act = (action: () => void) => {
        setError("");
        setMessage("");
        try {
            action();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Research action failed");
        }
    };
    const exportFile = (format: "markdown" | "json") =>
        act(() => {
            const content = format === "markdown" ? formatResearchMarkdown(chosen) : JSON.stringify(chosen, null, 2);
            const url = URL.createObjectURL(
                new Blob([content], { type: format === "markdown" ? "text/markdown" : "application/json" })
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `kronterm-research.${format === "markdown" ? "md" : "json"}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            setMessage("Research export requested. Check Downloads for the saved file.");
        });
    return (
        <aside
            aria-label="Research notebook"
            className="absolute inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col border-l border-border bg-background p-4 text-foreground shadow-lg"
        >
            <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-medium">Research notebook</h2>
                <button className={ButtonClass} onClick={() => globalStore.set(controller.researchOpen, false)}>
                    Close
                </button>
            </header>
            <p className="mb-3 text-xs text-muted-foreground">
                Findings from all browser widgets. Capture an element, then choose Save finding. Quotes retain their
                source and capture time.
            </p>
            <input
                aria-label="Search research"
                className="mb-3 rounded border border-border bg-background p-2 text-sm"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search sources, quotes and notes"
            />
            <div className="mb-3 flex flex-wrap gap-2">
                <button className={ButtonClass} onClick={() => void controller.setIntent("grab")}>
                    Capture finding
                </button>
                <button
                    className={ButtonClass}
                    disabled={!selection}
                    onClick={() => act(() => controller.saveResearchFinding(""))}
                >
                    Save finding
                </button>
                <button className={ButtonClass} disabled={!chosen.length} onClick={() => exportFile("markdown")}>
                    Export Markdown
                </button>
                <button className={ButtonClass} disabled={!chosen.length} onClick={() => exportFile("json")}>
                    Export JSON
                </button>
                <button className={ButtonClass} disabled={!chosen.length || sending} onClick={() => void attach(false)}>
                    {sending ? "Attaching…" : "Attach findings to chat"}
                </button>
                <button
                    className={ButtonClass}
                    disabled={chosen.length < 2 || sending}
                    onClick={() => void attach(true)}
                >
                    Compare in chat
                </button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
                {selected.length ? `${chosen.length} selected` : `${filtered.length} shown`} · Select multiple findings
                to compare or export together.
            </p>
            {(error || store.loadError) && (
                <p role="alert" className="mb-2 text-xs text-red-400">
                    {error || store.loadError}
                </p>
            )}
            {message && (
                <p role="status" className="mb-2 text-xs text-muted-foreground">
                    {message}
                </p>
            )}
            <div className="flex-1 overflow-y-auto">
                {!filtered.length && (
                    <p className="text-sm text-muted-foreground">
                        {findings.length ? "No findings match this search." : "No saved findings yet."}
                    </p>
                )}
                {filtered.map((finding) => (
                    <article key={finding.id} className="mb-4 border-b border-border pb-4">
                        <label className="flex cursor-pointer items-start gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={selected.includes(finding.id)}
                                onChange={(event) =>
                                    setSelected(
                                        event.target.checked
                                            ? [...selected, finding.id]
                                            : selected.filter((id) => id !== finding.id)
                                    )
                                }
                            />
                            {finding.title || finding.url}
                        </label>
                        <a
                            href={finding.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block cursor-pointer break-all text-xs underline"
                        >
                            {finding.url}
                        </a>
                        <p className="mt-1 text-xs text-muted-foreground">{finding.capturedAt}</p>
                        <blockquote className="my-2 whitespace-pre-wrap border-l-2 border-border pl-2 text-xs">
                            {finding.excerpt}
                        </blockquote>
                        <textarea
                            aria-label={`Notes for ${finding.title}`}
                            className="w-full rounded border border-border bg-background p-2 text-xs"
                            value={notes[finding.id] ?? finding.note}
                            maxLength={4000}
                            rows={2}
                            placeholder="Your analysis or comparison notes"
                            onChange={(event) => setNotes({ ...notes, [finding.id]: event.target.value })}
                        />
                        <div className="mt-2 flex gap-2">
                            <button
                                className={ButtonClass}
                                disabled={notes[finding.id] == null || notes[finding.id] === finding.note}
                                onClick={() =>
                                    act(() => {
                                        store.updateNote(finding.id, notes[finding.id]);
                                        setMessage("Note saved");
                                    })
                                }
                            >
                                Save note
                            </button>
                            <button
                                className={ButtonClass}
                                onClick={() =>
                                    act(() => {
                                        store.remove(finding.id);
                                        setSelected(selected.filter((id) => id !== finding.id));
                                    })
                                }
                            >
                                Remove finding
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </aside>
    );
}
