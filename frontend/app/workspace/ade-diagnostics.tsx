// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PreviewModel } from "@/app/view/preview/preview-model";
import { useAtomValue } from "jotai";
import * as monaco from "monaco-editor";
import { useEffect, useState } from "react";

export function AdeDiagnostics({ model }: { model: PreviewModel }) {
    const path = useAtomValue(model.metaFilePath);
    const [markers, setMarkers] = useState<monaco.editor.IMarker[]>([]);
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        let modelSubscription: monaco.IDisposable;
        const refresh = () => {
            const document = model.monacoRef.current?.getModel();
            setAvailable(document != null);
            setMarkers(document ? monaco.editor.getModelMarkers({ resource: document.uri }) : []);
        };
        const bind = () => {
            modelSubscription?.dispose();
            modelSubscription = model.monacoRef.current?.onDidChangeModel(refresh);
            refresh();
        };
        const ready = (event: Event) => {
            if ((event as CustomEvent<string>).detail === model.blockId) bind();
        };
        const markerSubscription = monaco.editor.onDidChangeMarkers(refresh);
        window.addEventListener("preview-editor-ready", ready);
        bind();
        return () => {
            markerSubscription.dispose();
            modelSubscription?.dispose();
            window.removeEventListener("preview-editor-ready", ready);
        };
    }, [model, path]);

    const navigate = (marker: monaco.editor.IMarker) => {
        const editor = model.monacoRef.current;
        if (editor?.getModel()?.uri.toString() !== marker.resource.toString()) return;
        editor.setPosition({ lineNumber: marker.startLineNumber, column: marker.startColumn });
        editor.revealLineInCenter(marker.startLineNumber);
        editor.focus();
    };

    return (
        <section aria-label="Current file problems" className="h-full overflow-auto text-[var(--coucou-label)]">
            <p className="px-3 py-2 text-xs text-[var(--coucou-secondary)]">
                {!available
                    ? "Open a file in the editor to see its diagnostics."
                    : markers.length === 0
                      ? "No diagnostics reported for this file."
                      : `${markers.length} reported ${markers.length === 1 ? "problem" : "problems"} in this file`}
            </p>
            <ul className="m-0 list-none p-0">
                {markers.map((marker, index) => (
                    <li key={`${marker.resource}:${marker.startLineNumber}:${marker.startColumn}:${index}`}>
                        <button
                            type="button"
                            className="flex w-full cursor-pointer gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--coucou-card)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--coucou-accent)]"
                            onClick={() => navigate(marker)}
                        >
                            <span className="shrink-0 text-[var(--coucou-secondary)]">
                                {marker.severity === monaco.MarkerSeverity.Error
                                    ? "Error"
                                    : marker.severity === monaco.MarkerSeverity.Warning
                                      ? "Warning"
                                      : "Info"}
                            </span>
                            <span className="min-w-0 break-words">
                                {marker.message}
                                <span className="ml-2 text-[var(--coucou-secondary)]">
                                    {marker.source ? `${marker.source} · ` : ""}line {marker.startLineNumber}, column{" "}
                                    {marker.startColumn}
                                </span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
