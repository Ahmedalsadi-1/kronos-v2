// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const PenEditorMethods = [
    "get_app_state",
    "get_tools",
    "execute",
    "read_skill",
    "save",
    "undo",
    "redo",
    "fit",
    "set_theme",
    "export",
] as const;
export type PenEditorMethod = (typeof PenEditorMethods)[number];
type EditorRequest = (method: PenEditorMethod, params?: Record<string, unknown>) => Promise<unknown>;
const Editors = new Map<string, EditorRequest>();
const Waiters = new Map<string, Set<(request: EditorRequest) => void>>();

export function registerPenEditor(tabId: string, request: EditorRequest) {
    Editors.set(tabId, request);
    for (const ready of Waiters.get(tabId) ?? []) ready(request);
    Waiters.delete(tabId);
    return () => {
        if (Editors.get(tabId) === request) Editors.delete(tabId);
    };
}

export async function requestPenEditor(tabId: string, method: PenEditorMethod, params: Record<string, unknown> = {}) {
    if (!PenEditorMethods.includes(method)) throw new Error("Unsupported Design editor operation.");
    const request =
        Editors.get(tabId) ??
        (await new Promise<EditorRequest>((resolve, reject) => {
            const waiters = Waiters.get(tabId) ?? new Set();
            const ready = (editor: EditorRequest) => {
                clearTimeout(timer);
                resolve(editor);
            };
            const timer = setTimeout(() => {
                waiters.delete(ready);
                if (!waiters.size) Waiters.delete(tabId);
                reject(new Error("The Pen editor is not ready. Open Design and check its startup status."));
            }, 20000);
            waiters.add(ready);
            Waiters.set(tabId, waiters);
        }));
    return request(method, params);
}

export function makePenFrameClient(frame: Window, origin: string) {
    const pending = new Map<
        string,
        { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
    >();
    return {
        request(method: PenEditorMethod, params: Record<string, unknown> = {}) {
            return new Promise<unknown>((resolve, reject) => {
                const id = crypto.randomUUID();
                const timer = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error(`Design ${method} timed out.`));
                }, 65000);
                pending.set(id, { resolve, reject, timer });
                frame.postMessage({ source: "kronos-pen-host", id, method, params }, origin === "null" ? "*" : origin);
            });
        },
        receive(event: MessageEvent) {
            if (event.source !== frame || event.origin !== origin || event.data?.source !== "kronos-pen") return false;
            const entry = pending.get(event.data.id);
            if (entry) {
                clearTimeout(entry.timer);
                pending.delete(event.data.id);
                if (event.data.error) entry.reject(new Error(String(event.data.error)));
                else entry.resolve(event.data.result);
            }
            return true;
        },
        dispose() {
            for (const entry of pending.values()) {
                clearTimeout(entry.timer);
                entry.reject(new Error("Design editor closed before the operation completed."));
            }
            pending.clear();
        },
    };
}
