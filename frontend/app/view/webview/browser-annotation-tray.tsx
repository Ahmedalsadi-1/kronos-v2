// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { subscribeAgentWidgetDesignSelection, type AgentWidgetDesignSelection } from "@/app/view/agent-widget-bridge";
import { getApi } from "@/store/global";
import { fireAndForget } from "@/util/util";
import { useAtom } from "jotai";
import { memo, useEffect, useState } from "react";
import {
    BrowserAnnotationsMaxPerPage,
    formatAnnotationsBundle,
    getBrowserAnnotationsAtom,
    makeBrowserAnnotation,
    type BrowserAnnotation,
    type BrowserAnnotationIntent,
} from "./browser-annotations";

const AnnotationIntents: readonly BrowserAnnotationIntent[] = ["fix", "change", "question", "approve"];

function annotationFromSelection(selection: AgentWidgetDesignSelection): BrowserAnnotation {
    return makeBrowserAnnotation(selection, selection.comment ?? "", selection.annotationIntent ?? "change");
}

export const BrowserAnnotationTray = memo(({ blockId, url }: { blockId: string; url?: string }) => {
    const [allAnnotations, setAnnotations] = useAtom(getBrowserAnnotationsAtom(blockId));
    const pageKey = (value: string) => {
        try {
            const parsed = new URL(value);
            parsed.search = "";
            parsed.hash = "";
            return parsed.toString();
        } catch {
            return value;
        }
    };
    const annotations = allAnnotations.filter((row) => !url || pageKey(row.url) === pageKey(url));
    const [copied, setCopied] = useState(false);
    const [sendError, setSendError] = useState("");

    useEffect(() => {
        return subscribeAgentWidgetDesignSelection((selection) => {
            if (selection.blockId !== blockId) {
                return;
            }
            if (!selection.comment?.trim()) return;
            setAnnotations((current) =>
                [
                    ...current.filter((row) => pageKey(row.url) !== pageKey(selection.url)),
                    ...current
                        .filter((row) => pageKey(row.url) === pageKey(selection.url))
                        .slice(-(BrowserAnnotationsMaxPerPage - 1)),
                    annotationFromSelection(selection),
                ].slice(-100)
            );
        });
    }, [blockId]);

    useEffect(() => {
        try {
            localStorage.setItem(`kronterm.browser.annotations.${blockId}`, JSON.stringify(allAnnotations));
        } catch {
            /* Session state remains available if storage is full. */
        }
    }, [allAnnotations, blockId]);

    useEffect(() => {
        if (!copied) {
            return;
        }
        const timer = window.setTimeout(() => setCopied(false), 2000);
        return () => window.clearTimeout(timer);
    }, [copied]);

    if (annotations.length === 0) {
        return null;
    }
    const pageUrl = annotations[annotations.length - 1].url;

    const updateAnnotation = (id: string, patch: Partial<Pick<BrowserAnnotation, "comment" | "intent">>) => {
        setAnnotations((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };

    const deleteAnnotation = (id: string) => {
        setAnnotations((current) => current.filter((item) => item.id !== id));
    };

    const copyBundle = () => {
        fireAndForget(async () => {
            await navigator.clipboard.writeText(formatAnnotationsBundle(pageUrl, annotations));
            setCopied(true);
        });
    };

    return (
        <aside aria-label="Browser annotations" className="browser-annotation-tray">
            <header className="browser-annotation-tray-header">
                <i className="fa-solid fa-message-plus" aria-hidden="true" />
                <span className="browser-annotation-tray-count">
                    {annotations.length === 1 ? "1 annotation" : `${annotations.length} annotations`}
                </span>
                <span className="browser-annotation-tray-actions">
                    <button
                        type="button"
                        aria-label="Send browser annotations to Hermes"
                        title="Send to Hermes"
                        onClick={() => {
                            setSendError("");
                            void getApi()
                                .sendHermesSelection({
                                    target: "current",
                                    text: `Revalidate the selected elements with widget_snapshot on browser block ${JSON.stringify(blockId)} before acting.\n\n${formatAnnotationsBundle(pageUrl, annotations)}`,
                                })
                                .catch((error) =>
                                    setSendError(error instanceof Error ? error.message : "Could not send annotations.")
                                );
                        }}
                    >
                        <i className="fa-solid fa-arrow-up" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={copyBundle} aria-label="Copy annotations" title="Copy annotations">
                        <i className={`fa-solid fa-${copied ? "check" : "copy"}`} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            setAnnotations((current) =>
                                current.filter((row) => url && pageKey(row.url) !== pageKey(url))
                            )
                        }
                        aria-label="Clear annotations"
                        title="Clear annotations"
                    >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                    </button>
                </span>
            </header>
            {sendError && <p role="alert">{sendError}</p>}
            <ol className="browser-annotation-tray-list">
                {annotations.map((annotation) => (
                    <li key={annotation.id} className="browser-annotation-tray-item">
                        <div className="browser-annotation-tray-label">{annotation.elementLabel}</div>
                        <div className="browser-annotation-tray-row">
                            <input
                                value={annotation.comment}
                                maxLength={2000}
                                onChange={(event) => updateAnnotation(annotation.id, { comment: event.target.value })}
                                placeholder="Add a comment…"
                                aria-label={`Comment for ${annotation.elementLabel}`}
                                spellCheck={false}
                            />
                            <select
                                value={annotation.intent}
                                onChange={(event) =>
                                    updateAnnotation(annotation.id, {
                                        intent: event.target.value as BrowserAnnotationIntent,
                                    })
                                }
                                aria-label={`Intent for ${annotation.elementLabel}`}
                            >
                                {AnnotationIntents.map((intent) => (
                                    <option key={intent} value={intent}>
                                        {intent}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={() => deleteAnnotation(annotation.id)}
                                aria-label={`Delete annotation for ${annotation.elementLabel}`}
                                title="Delete"
                            >
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                            </button>
                        </div>
                    </li>
                ))}
            </ol>
        </aside>
    );
});
BrowserAnnotationTray.displayName = "BrowserAnnotationTray";
