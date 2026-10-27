// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { startLspClient, stopLspClient } from "@/app/lsp/lsp-client-manager";
import { LspService } from "@/app/lsp/lsp-service";
import { MonacoCodeEditor } from "@/app/monaco/monaco-react";
import { useOverrideConfigAtom } from "@/app/store/global";
import { useCoucouWorkbenchAppearance } from "@/app/workspace/coucou-workbench-appearance";
import { boundNumber } from "@/util/util";
import type * as MonacoTypes from "monaco-editor";
import * as MonacoModule from "monaco-editor";
import { useEffect, useMemo, useRef } from "react";

function defaultEditorOptions(): MonacoTypes.editor.IEditorOptions {
    const opts: MonacoTypes.editor.IEditorOptions = {
        scrollBeyondLastLine: false,
        fontSize: 12,
        fontFamily: "Hack",
        smoothScrolling: true,
        scrollbar: {
            useShadows: false,
            verticalScrollbarSize: 5,
            horizontalScrollbarSize: 5,
        },
        minimap: {
            enabled: true,
        },
        stickyScroll: {
            enabled: false,
        },
    };
    return opts;
}

interface CodeEditorProps {
    blockId: string;
    text: string;
    readonly: boolean;
    language?: string;
    fileName?: string;
    onChange?: (text: string) => void;
    treeCodeAppearance?: boolean;
    onMount?: (monacoPtr: MonacoTypes.editor.IStandaloneCodeEditor, monaco: typeof MonacoModule) => () => void;
}

export function CodeEditor({
    blockId,
    text,
    language,
    fileName,
    readonly,
    onChange,
    onMount,
    treeCodeAppearance = false,
}: CodeEditorProps) {
    const appearance = useCoucouWorkbenchAppearance();
    const divRef = useRef<HTMLDivElement>(null);
    const unmountRef = useRef<() => void>(null);
    const lspLanguageRef = useRef<string | undefined>(undefined);
    const minimapEnabled = useOverrideConfigAtom(blockId, "editor:minimapenabled") ?? false;
    const stickyScrollEnabled = useOverrideConfigAtom(blockId, "editor:stickyscrollenabled") ?? false;
    const wordWrap = useOverrideConfigAtom(blockId, "editor:wordwrap") ?? false;
    const fontSize = boundNumber(useOverrideConfigAtom(blockId, "editor:fontsize"), 6, 64);
    const uuidRef = useRef(crypto.randomUUID()).current;
    useEffect(() => {
        MonacoModule.editor.defineTheme("kronterm-coucou-editor", {
            base: treeCodeAppearance || appearance["--coucou-surface"] === "#000000" ? "vs-dark" : "vs",
            inherit: true,
            rules: treeCodeAppearance
                ? [
                      { token: "keyword", foreground: "c67880" },
                      { token: "string", foreground: "9ac7e3" },
                      { token: "delimiter", foreground: "c7cbd2" },
                  ]
                : [],
            colors: {
                "editor.background": treeCodeAppearance ? "#101114" : String(appearance["--coucou-surface"]),
                "editor.foreground": treeCodeAppearance ? "#e4e4e7" : String(appearance["--coucou-label"]),
                "editorCursor.foreground": String(appearance["--coucou-accent"]),
                "editorLineNumber.foreground": String(appearance["--coucou-secondary"]),
                "editorLineNumber.activeForeground": String(appearance["--coucou-label"]),
            },
        });
        MonacoModule.editor.setTheme("kronterm-coucou-editor");
    }, [appearance, treeCodeAppearance]);
    let editorPath: string;
    if (fileName) {
        const separator = fileName.startsWith("/") ? "" : "/";
        editorPath = blockId + separator + fileName;
    } else {
        editorPath = uuidRef;
    }

    // Initialize LSP service once
    useEffect(() => {
        LspService.init();
    }, []);

    useEffect(() => {
        return () => {
            // unmount function: stop LSP and run user cleanup
            if (lspLanguageRef.current) {
                stopLspClient(lspLanguageRef.current);
                lspLanguageRef.current = undefined;
            }
            if (unmountRef.current) {
                unmountRef.current();
            }
        };
    }, []);

    function handleEditorChange(text: string) {
        if (onChange) {
            onChange(text);
        }
    }

    function handleEditorOnMount(
        editor: MonacoTypes.editor.IStandaloneCodeEditor,
        monaco: typeof MonacoModule
    ): () => void {
        // Start LSP client for the current language
        if (language && !readonly) {
            const model = editor.getModel();
            if (model) {
                lspLanguageRef.current = language;
                startLspClient(model, language).catch((err) =>
                    console.warn(`[lsp] could not start client for "${language}":`, err)
                );
            }
        }

        if (onMount) {
            const cleanup = onMount(editor, monaco);
            unmountRef.current = cleanup;
            return cleanup;
        }
        return undefined;
    }

    const editorOpts = useMemo(() => {
        const opts = defaultEditorOptions();
        opts.minimap.enabled = minimapEnabled;
        opts.stickyScroll.enabled = stickyScrollEnabled;
        opts.wordWrap = wordWrap ? "on" : "off";
        opts.fontSize = fontSize;
        opts.copyWithSyntaxHighlighting = false;
        if (treeCodeAppearance) {
            opts.fontSize = 13;
            opts.lineHeight = 22;
            opts.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
            opts.lineNumbers = "off";
            opts.glyphMargin = false;
            opts.folding = false;
            opts.lineDecorationsWidth = 0;
            opts.renderLineHighlight = "none";
            opts.padding = { top: 16, bottom: 16 };
            opts.minimap.enabled = false;
        }
        return opts;
    }, [minimapEnabled, stickyScrollEnabled, wordWrap, fontSize, readonly, treeCodeAppearance]);

    return (
        <div className="flex flex-col w-full h-full overflow-hidden items-center justify-center">
            <div className="flex flex-col h-full w-full" ref={divRef}>
                <MonacoCodeEditor
                    readonly={readonly}
                    text={text}
                    options={editorOpts}
                    onChange={handleEditorChange}
                    onMount={handleEditorOnMount}
                    path={editorPath}
                    language={language}
                />
            </div>
        </div>
    );
}
