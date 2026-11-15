// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton } from "@/app/components/system-ui";
import { useState } from "react";
import { requestPenEditor, type PenEditorMethod } from "./os-pen-editor-bridge";
import { penDownload } from "./os-pen-export";

export function OSPenCanvasActions({ tabId }: { tabId: string }) {
    const [error, setError] = useState("");
    const run = async (method: PenEditorMethod) => {
        try {
            setError("");
            const result = await requestPenEditor(tabId, method);
            if (method !== "export") return;
            const file = penDownload(result as Parameters<typeof penDownload>[0]);
            const url = URL.createObjectURL(new Blob([new Uint8Array(file.bytes)], { type: file.type }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = file.name;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setError((result as { warning?: string }).warning ?? "");
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Canvas action failed.");
        }
    };
    return (
        <section className="flex flex-col gap-3 border-b border-border p-3" aria-label="Canvas actions">
            <h2 className="text-[13px] font-medium">Workspace canvas</h2>
            <div className="flex flex-wrap gap-1">
                <SystemButton size="small" onClick={() => void run("undo")}>
                    Undo design
                </SystemButton>
                <SystemButton size="small" onClick={() => void run("redo")}>
                    Redo design
                </SystemButton>
                <SystemButton size="small" onClick={() => void run("fit")}>
                    Fit design
                </SystemButton>
                <SystemButton size="small" onClick={() => void run("export")}>
                    Export design
                </SystemButton>
            </div>
            {error && (
                <p role="alert" className="text-[12px]">
                    {error}
                </p>
            )}
        </section>
    );
}
