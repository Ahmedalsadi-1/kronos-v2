// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { useAtomValue } from "jotai";
import { useState } from "react";
import type { DocumentStudioModel } from "./documentstudio-model";
import { makeSource, type Report, reportMarkdown, ReportSizeLimit } from "./report";
import { reportHtml, ReportPreview } from "./report-render";

const Control =
    "cursor-pointer rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] px-2 py-1 text-xs disabled:opacity-50";
const Input = "rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-2 text-sm";

export function DocumentStudioView({ model }: ViewComponentProps<DocumentStudioModel>) {
    const appearance = useCoucouWorkbenchAppearance();
    const saved = useAtomValue(model.report);
    const error = useAtomValue(model.error);
    const [draft, setDraft] = useState<Report>(() => saved);
    const [sourceTitle, setSourceTitle] = useState("");
    const [sourceUrl, setSourceUrl] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [status, setStatus] = useState("");
    const [importing, setImporting] = useState(false);
    const [pane, setPane] = useState<"edit" | "preview">("edit");
    const dirty =
        draft.title !== saved.title ||
        draft.body !== saved.body ||
        JSON.stringify(draft.sources) !== JSON.stringify(saved.sources);
    const act = (action: () => void) => {
        setStatus("");
        globalStore.set(model.error, "");
        try {
            action();
        } catch (error) {
            globalStore.set(model.error, error instanceof Error ? error.message : "Document action failed");
        }
    };
    const download = (html: boolean) =>
        act(() => {
            const content = html ? reportHtml(draft) : reportMarkdown(draft);
            const url = URL.createObjectURL(
                new Blob([content], { type: html ? "text/html;charset=utf-8" : "text/markdown;charset=utf-8" })
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `${
                draft.title
                    .replace(/[^a-zA-Z0-9 _-]/g, "")
                    .trim()
                    .slice(0, 80) || "report"
            }.${html ? "html" : "md"}`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            setStatus("Report download requested. Check Downloads for the saved file.");
        });
    return (
        <section
            aria-label="Document Studio"
            style={appearance}
            className="flex h-full flex-col gap-3 overflow-auto bg-[var(--coucou-surface)] p-4 text-[var(--coucou-label)]"
        >
            <header className="flex flex-wrap items-center gap-2">
                <h2 className="mr-2 text-sm font-medium">Document Studio</h2>
                <button
                    className={Control}
                    disabled={importing}
                    onClick={() =>
                        act(() => {
                            const next = model.save(draft);
                            setDraft(next);
                            setStatus(`Saved revision ${next.revision}`);
                        })
                    }
                >
                    Save report
                </button>
                <button
                    className={Control}
                    onClick={() =>
                        act(() => {
                            setDraft(model.reload());
                            setStatus("Saved report reloaded; draft replaced");
                        })
                    }
                >
                    Reload saved (discard draft)
                </button>
                <button className={Control} onClick={() => download(false)}>
                    Export Markdown
                </button>
                <button className={Control} onClick={() => download(true)}>
                    Export HTML
                </button>
            </header>
            <p className="text-xs text-[var(--coucou-secondary)]">
                {dirty ? "Unsaved draft" : saved.revision ? `Saved revision ${saved.revision}` : "New report"} ·{" "}
                {draft.sources.length} sources · Reports save locally in this widget
            </p>
            {error && (
                <p role="alert" className="text-xs text-red-400">
                    {error}
                </p>
            )}
            {status && (
                <p role="status" className="text-xs text-[var(--coucou-secondary)]">
                    {status}
                </p>
            )}
            <input
                className={Input}
                aria-label="Report title"
                value={draft.title}
                maxLength={300}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            <div className="flex flex-wrap items-center gap-2">
                <button className={Control} aria-pressed={pane === "edit"} onClick={() => setPane("edit")}>
                    Edit
                </button>
                <button className={Control} aria-pressed={pane === "preview"} onClick={() => setPane("preview")}>
                    Preview
                </button>
                <label className={Control}>
                    Import TXT/Markdown (replace draft)
                    <input
                        type="file"
                        aria-label="Import TXT or Markdown"
                        accept=".txt,.md,.markdown,text/plain,text/markdown"
                        className="sr-only"
                        disabled={importing}
                        onChange={async (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            setImporting(true);
                            setStatus("");
                            globalStore.set(model.error, "");
                            try {
                                if (file.size > ReportSizeLimit)
                                    throw new Error("Imported text must be at most 256 KB");
                                const body = await file.text();
                                if (new TextEncoder().encode(body).length > ReportSizeLimit)
                                    throw new Error("Imported text must be at most 256 KB");
                                setDraft((current) => ({
                                    ...current,
                                    title: file.name.replace(/\.(txt|md|markdown)$/i, "").slice(0, 300),
                                    body,
                                    sources: [],
                                    nextSourceNumber: 1,
                                }));
                                setStatus("Text imported into draft; save to keep it");
                            } catch (error) {
                                globalStore.set(
                                    model.error,
                                    error instanceof Error ? error.message : "Text import failed"
                                );
                            } finally {
                                setImporting(false);
                            }
                        }}
                    />
                </label>
            </div>
            {pane === "edit" ? (
                <textarea
                    aria-label="Report Markdown"
                    className={`${Input} min-h-64 flex-1 font-mono text-xs`}
                    value={draft.body}
                    maxLength={ReportSizeLimit}
                    placeholder="Write your report in Markdown. Refer to sources as [1], [2]…"
                    onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
            ) : (
                <div className="min-h-64 flex-1 overflow-auto rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-4">
                    <ReportPreview report={draft} />
                </div>
            )}
            <details className="rounded border border-[var(--coucou-border)] p-3">
                <summary className="cursor-pointer text-sm">Sources and cited notes ({draft.sources.length})</summary>
                <p className="my-2 text-xs text-[var(--coucou-secondary)]">
                    Add source links and excerpts yourself. Sources are included in preview and exports.
                </p>
                <div className="mt-2 flex flex-col gap-2">
                    <input
                        aria-label="Source title"
                        className={Input}
                        value={sourceTitle}
                        maxLength={300}
                        placeholder="Source title"
                        onChange={(event) => setSourceTitle(event.target.value)}
                    />
                    <input
                        aria-label="Source URL"
                        className={Input}
                        type="url"
                        value={sourceUrl}
                        maxLength={4000}
                        placeholder="https://…"
                        onChange={(event) => setSourceUrl(event.target.value)}
                    />
                    <textarea
                        aria-label="Source excerpt"
                        className={Input}
                        value={excerpt}
                        maxLength={8000}
                        rows={3}
                        placeholder="Quoted excerpt or source notes"
                        onChange={(event) => setExcerpt(event.target.value)}
                    />
                    <button
                        className={`${Control} self-start`}
                        disabled={draft.sources.length >= 50}
                        onClick={() =>
                            act(() => {
                                const source = makeSource(sourceTitle, sourceUrl, excerpt, draft.nextSourceNumber);
                                setDraft({
                                    ...draft,
                                    sources: [...draft.sources, source],
                                    nextSourceNumber: draft.nextSourceNumber + 1,
                                });
                                setSourceTitle("");
                                setSourceUrl("");
                                setExcerpt("");
                                setStatus("Source added to draft; save to keep it");
                            })
                        }
                    >
                        Add source
                    </button>
                </div>
                <ol className="mt-3 flex flex-col gap-3 text-xs">
                    {draft.sources.map((source) => (
                        <li key={source.id} className="border-t border-[var(--coucou-border)] pt-2">
                            <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="cursor-pointer break-all underline"
                            >
                                [{source.number}] {source.title}
                            </a>
                            <blockquote className="my-2 whitespace-pre-wrap text-[var(--coucou-secondary)]">
                                {source.excerpt}
                            </blockquote>
                            <button
                                className={Control}
                                onClick={() =>
                                    setDraft({
                                        ...draft,
                                        sources: draft.sources.filter((entry) => entry.id !== source.id),
                                    })
                                }
                            >
                                Remove source
                            </button>
                        </li>
                    ))}
                </ol>
            </details>
        </section>
    );
}
