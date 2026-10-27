// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { CodeEditor } from "@/app/view/codeeditor/codeeditor";
import type { PreviewModel } from "@/app/view/preview/preview-model";
import "@/app/workspace/coucou-chrome.css";
import { NativeFileWorkbench } from "@/app/workspace/native-file-workbench";
import { persistString } from "@hermes/lib/storage";
import { atom, useAtomValue } from "jotai";
import { useMemo } from "react";

const FixtureRoot = "/fixture/project";
const FixtureSource = "export function greet(name: string): string {\n    return `Hello, ${name}`;\n}\n";

export function AdePreview() {
    const model = useMemo(() => {
        const path = atom(`${FixtureRoot}/main.ts`);
        const draft = atom(null as string);
        const edits = new Map<string, string>();
        const files = ["main.ts", "settings.ts", "README.md"].map((name) => ({
            name,
            path: `${FixtureRoot}/${name}`,
            isdir: false,
        }));
        return {
            blockId: "ade-fixture",
            viewType: "preview",
            metaFilePath: path,
            connectionImmediate: atom(""),
            newFileContent: draft,
            editMode: atom(true),
            errorMsgAtom: atom(null),
            monacoRef: { current: null },
            statFile: atom((get) =>
                Promise.resolve({ path: get(path), dir: FixtureRoot, isdir: get(path) === FixtureRoot })
            ),
            formatRemoteUri: async (value: string) => value,
            env: {
                rpc: {
                    FileReadCommand: async () => ({ entries: files }),
                    FileInfoCommand: async (_client: unknown, request: { info: { path: string } }) => ({
                        notfound: !files.some((file) => file.path === request.info.path),
                    }),
                    FileAppendCommand: async () => {
                        throw new Error("Fixture preview does not write files.");
                    },
                    FileMkdirCommand: async () => {
                        throw new Error("Fixture preview does not create folders.");
                    },
                },
            },
            goHistory: async (next: string) => {
                const previous = globalStore.get(path);
                const content = globalStore.get(draft);
                if (content != null) edits.set(previous, content);
                else edits.delete(previous);
                globalStore.set(path, next);
                globalStore.set(draft, edits.get(next) ?? null);
            },
            hasFileDraft: (value: string) => edits.has(value),
            discardFileDraft: (value: string) => edits.delete(value),
            setEditMode: async () => {},
            handleFileSave: async () => {
                globalStore.set(draft, null);
                edits.delete(globalStore.get(path));
            },
            updateOpenFileModalAndError: () => {},
        } as unknown as PreviewModel;
    }, []);
    const path = useAtomValue(model.metaFilePath);
    const draft = useAtomValue(model.newFileContent);
    return (
        <div className="absolute inset-x-0 bottom-0 top-12 flex flex-col">
            <div className="flex h-10 shrink-0 items-center gap-3 bg-panel px-3 text-xs text-foreground">
                <span className="flex-1">ADE component fixture · no disk writes or agent execution</span>
                <button className="cursor-pointer" onClick={() => persistString("hermes-desktop-mode-v1", "light")}>
                    Light
                </button>
                <button className="cursor-pointer" onClick={() => persistString("hermes-desktop-mode-v1", "dark")}>
                    Dark
                </button>
            </div>
            <NativeFileWorkbench blockId={model.blockId} previewModel={model}>
                <CodeEditor
                    treeCodeAppearance
                    key={path}
                    blockId={model.blockId}
                    readonly={false}
                    fileName={path}
                    language="typescript"
                    text={draft ?? FixtureSource}
                    onChange={(text) => globalStore.set(model.newFileContent, text)}
                    onMount={(editor) => {
                        model.monacoRef.current = editor;
                        window.dispatchEvent(new CustomEvent("preview-editor-ready", { detail: model.blockId }));
                        return () => {
                            model.monacoRef.current = null;
                        };
                    }}
                />
            </NativeFileWorkbench>
        </div>
    );
}
