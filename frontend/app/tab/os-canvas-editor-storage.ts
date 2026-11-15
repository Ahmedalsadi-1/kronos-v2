// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import type { editor } from "monaco-editor";

type CanvasDraft = { text: string; base: { text: string; size: number } };

function storageKey(id: string, path: string, kind: "draft" | "view"): string {
    return `kronos.canvas-editor.v1.${kind}:${JSON.stringify([id, path])}`;
}

function readStored(id: string, path: string, kind: "draft" | "view"): unknown {
    try {
        return JSON.parse(localStorage.getItem(storageKey(id, path, kind)) ?? "null");
    } catch {
        return null;
    }
}

function writeStored(id: string, path: string, kind: "draft" | "view", value: unknown): boolean {
    try {
        const key = storageKey(id, path, kind);
        if (value == null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export function readCanvasDraft(id: string, path: string): CanvasDraft | undefined {
    if (!id) return;
    const value = readStored(id, path, "draft") as Partial<CanvasDraft>;
    if (
        typeof value?.text !== "string" ||
        typeof value.base?.text !== "string" ||
        !Number.isSafeInteger(value.base.size)
    )
        return;
    return { text: value.text, base: value.base };
}

export function writeCanvasDraft(id: string, path: string, draft?: CanvasDraft): boolean {
    return !id || writeStored(id, path, "draft", draft);
}

export function readCanvasEditorView(id: string, path: string): editor.ICodeEditorViewState | undefined {
    if (!id) return;
    return readStored(id, path, "view") as editor.ICodeEditorViewState;
}

export function writeCanvasEditorView(id: string, path: string, view: editor.ICodeEditorViewState): void {
    if (id && view) writeStored(id, path, "view", view);
}
