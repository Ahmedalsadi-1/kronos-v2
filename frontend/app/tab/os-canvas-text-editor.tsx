// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { MonacoCodeEditor } from "@/app/monaco/monaco-react";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { base64ToArray, stringToBase64 } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import type { editor } from "monaco-editor";
import { useId, useRef, useState } from "react";
import {
    readCanvasDraft,
    readCanvasEditorView,
    writeCanvasDraft,
    writeCanvasEditorView,
} from "./os-canvas-editor-storage";

const EditorOptions: editor.IEditorOptions & editor.IGlobalEditorOptions = {
    fontSize: 12,
    minimap: { enabled: false },
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    padding: { top: 32, bottom: 6 },
    automaticLayout: false,
    quickSuggestions: true,
    bracketPairColorization: { enabled: true },
    scrollbar: { useShadows: false, verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
};

export function CanvasTextEditor({
    objectId,
    path,
    name,
    text,
    fileSize,
    readOnly,
    onSaved,
    onShowPreview,
}: {
    objectId?: string;
    path: string;
    name: string;
    text: string;
    fileSize: number;
    readOnly: boolean;
    onSaved?: (text: string, size: number) => void;
    onShowPreview?: () => void;
}) {
    const id = useId();
    const pending = useRef(false);
    const [restored] = useState(() => {
        const draft = readCanvasDraft(objectId, path);
        return draft?.text !== text ? draft : undefined;
    });
    const initialText = restored?.text ?? text;
    const original = useRef(restored?.base ?? { text, size: fileSize });
    const current = useRef(initialText);
    const [dirty, setDirty] = useState(Boolean(restored));
    const [status, setStatus] = useState("");
    const modelPath = `canvas/${id}/${path}`;

    function checkpointDraft() {
        const changed = current.current !== original.current.text;
        setDirty(changed);
        return writeCanvasDraft(
            objectId,
            path,
            changed ? { text: current.current, base: original.current } : undefined
        );
    }

    async function save() {
        if (readOnly || pending.current || current.current === original.current.text) return;
        pending.current = true;
        const draft = current.current;
        setStatus("Saving…");
        try {
            const remotePath = formatRemoteUri(path, "local");
            const info = await RpcApi.FileInfoCommand(TabRpcClient, { info: { path: remotePath } });
            if (info?.notfound || info?.staterror || info?.isdir || info?.size !== original.current.size) {
                setStatus("File changed on disk. Save canceled.");
                return;
            }
            if (info.size > 0) {
                const disk = await RpcApi.FileReadCommand(TabRpcClient, {
                    info: { path: remotePath },
                    at: { offset: 0, size: info.size },
                });
                if (
                    !disk?.data64 ||
                    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(base64ToArray(disk.data64)) !==
                        original.current.text
                ) {
                    setStatus("File changed on disk. Save canceled.");
                    return;
                }
            }
            await RpcApi.FileWriteCommand(TabRpcClient, {
                info: { path: remotePath },
                data64: stringToBase64(draft),
            });
            const size = new TextEncoder().encode(draft).byteLength;
            original.current = { text: draft, size };
            const stored = checkpointDraft();
            setStatus(stored ? "Saved" : "Saved file. Draft recovery storage unavailable.");
            onSaved?.(draft, size);
        } catch {
            setStatus("Could not save the file.");
        } finally {
            pending.current = false;
        }
    }

    return (
        <div
            className="canvas-text-editor"
            data-canvas-shortcuts="ignore"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
        >
            <div className="canvas-text-editor-toolbar">
                <span title={path} className="canvas-text-editor-name">
                    {dirty && <i className="canvas-text-editor-dirty" role="img" aria-label="Unsaved changes" />}
                    {name}
                </span>
                {dirty && (
                    <button type="button" onClick={() => void save()}>
                        Save
                    </button>
                )}
                {onShowPreview && (
                    <button type="button" disabled={dirty} onClick={onShowPreview}>
                        Show page
                    </button>
                )}
                {status && <span role="status">{status}</span>}
            </div>
            <MonacoCodeEditor
                text={initialText}
                readonly={readOnly}
                path={modelPath}
                options={EditorOptions}
                onChange={(value) => {
                    current.current =
                        original.current.text.startsWith("\uFEFF") && !value.startsWith("\uFEFF")
                            ? `\uFEFF${value}`
                            : value;
                    setStatus(checkpointDraft() ? "" : "Could not store the draft for restart.");
                }}
                onMount={(instance, monaco) => {
                    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void save());
                    const view = readCanvasEditorView(objectId, path);
                    if (view) instance.restoreViewState(view);
                    const rememberView = () => writeCanvasEditorView(objectId, path, instance.saveViewState());
                    const position = instance.onDidChangeCursorPosition(rememberView);
                    const scroll = instance.onDidScrollChange(rememberView);
                    return () => {
                        position.dispose();
                        scroll.dispose();
                    };
                }}
            />
        </div>
    );
}
