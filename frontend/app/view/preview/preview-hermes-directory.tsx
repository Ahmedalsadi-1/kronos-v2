// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { attachOSResourceToKronos } from "@/app/store/os-resource-service";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { formatRemoteUri } from "@/util/waveutil";
import { FileActionDialogs } from "@hermes/app/right-sidebar/file-actions";
import { ProjectTree } from "@hermes/app/right-sidebar/files/tree";
import type { TreeNode } from "@hermes/app/right-sidebar/files/use-project-tree";
import "@hermes/styles.css";
import { atom, useAtomValue } from "jotai";
import { ArrowUp, Folder, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PreviewModel } from "./preview-model";

const AlwaysFocused = atom(true);
const ToolbarButton =
    "grid size-8 cursor-pointer place-items-center rounded-md hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-accent";

function setChildren(nodes: TreeNode[], directory: string, children: TreeNode[]): TreeNode[] {
    return nodes.map((node) => {
        if (node.id === directory) return { ...node, children };
        return node.children?.length ? { ...node, children: setChildren(node.children, directory, children) } : node;
    });
}

async function listDirectory(model: PreviewModel, directory: string): Promise<TreeNode[]> {
    const entries = await model.env.rpc.FileListCommand(TabRpcClient, {
        path: formatRemoteUri(directory, "local"),
        opts: { all: false },
    });
    return entries
        .filter(
            (entry) => !entry.notfound && !entry.staterror && entry.name && entry.name !== "." && entry.name !== ".."
        )
        .map((entry) => ({
            id: directory.replace(/[\\/]$/, "") + "/" + entry.name,
            name: entry.name,
            isDirectory: entry.isdir,
        }));
}

export function HermesDirectoryPreview({ model }: { model: PreviewModel }) {
    const info = useAtomValue(model.statFile);
    const focused = useAtomValue(model.nodeModel?.isFocused ?? AlwaysFocused);
    const directory =
        info?.path?.startsWith("~") && info.dir && info.name
            ? info.dir.replace(/\/$/, "") + "/" + info.name
            : info?.path;
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [revision, setRevision] = useState(0);
    const [folderPath, setFolderPath] = useState<string | null>(null);
    const [folderError, setFolderError] = useState("");
    const [openingFolder, setOpeningFolder] = useState(false);
    const folderButton = useRef<HTMLButtonElement>(null);
    const current = useRef(0);
    const inflight = useRef(new Set<string>());

    useEffect(() => {
        if (!directory) return;
        const generation = ++current.current;
        inflight.current.clear();
        setTree([]);
        setOpen({});
        setError("");
        setLoading(true);
        void listDirectory(model, directory)
            .then((nodes) => {
                if (generation === current.current) setTree(nodes);
            })
            .catch((failure) => {
                if (generation === current.current) setError(failure.message ?? String(failure));
            })
            .finally(() => {
                if (generation === current.current) setLoading(false);
            });
        return () => {
            current.current++;
        };
    }, [directory, model, revision]);

    const loadChildren = useCallback(
        async (id: string) => {
            if (inflight.current.has(id)) return;
            inflight.current.add(id);
            const generation = current.current;
            try {
                const nodes = await listDirectory(model, id);
                if (generation === current.current) setTree((previous) => setChildren(previous, id, nodes));
            } catch (failure) {
                if (generation === current.current) setError(failure.message ?? String(failure));
            } finally {
                if (generation === current.current) inflight.current.delete(id);
            }
        },
        [directory, model]
    );

    const attach = (resource: string, kind: "file" | "folder") => {
        attachOSResourceToKronos({
            id: `local:${resource}`,
            kind,
            name: resource.split(/[\\/]/).pop() || resource,
            resource,
        });
    };

    const openFolder = async () => {
        const input = folderPath?.trim();
        if (openingFolder) return;
        if (!input) {
            setFolderError("Enter a folder path.");
            return;
        }
        setOpeningFolder(true);
        setFolderError("");
        const path = /^(?:[/\\]|~(?:[/\\]|$)|[a-z]:[/\\])/i.test(input)
            ? input
            : directory.replace(/[\\/]$/, "") + "/" + input;
        try {
            const target = await model.env.rpc.FileInfoCommand(TabRpcClient, {
                info: { path: formatRemoteUri(path, "local") },
            });
            if (!target?.isdir || target.notfound || target.staterror) {
                setFolderError("That path is not an accessible folder.");
                return;
            }
            await model.goHistory(path);
            setFolderPath(null);
        } catch {
            setFolderError("Could not open that folder.");
        } finally {
            setOpeningFolder(false);
        }
    };

    return (
        <section
            aria-label="KronFiles"
            className="flex h-full min-h-0 flex-col bg-panel text-foreground"
            data-hermes-app=""
        >
            <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1">
                <Folder size={15} aria-hidden="true" />
                {folderPath == null ? (
                    <button
                        ref={folderButton}
                        type="button"
                        aria-label={`Edit folder path: ${directory}`}
                        className="min-w-0 flex-1 cursor-pointer truncate rounded px-1 text-left text-xs hover:bg-black/10"
                        title={directory}
                        onClick={() => setFolderPath(directory)}
                    >
                        {directory}
                    </button>
                ) : (
                    <form
                        className="min-w-0 flex-1"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void openFolder();
                        }}
                    >
                        <input
                            autoFocus
                            aria-label="Folder path"
                            aria-invalid={Boolean(folderError)}
                            className="w-full rounded border border-border bg-panel px-1 py-1 text-xs"
                            readOnly={openingFolder}
                            value={folderPath}
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => {
                                setFolderPath(event.target.value);
                                setFolderError("");
                            }}
                            onKeyDown={(event) => {
                                if (event.key !== "Escape" || openingFolder) return;
                                event.stopPropagation();
                                setFolderPath(null);
                                setFolderError("");
                                requestAnimationFrame(() => folderButton.current?.focus());
                            }}
                        />
                    </form>
                )}
                <button
                    type="button"
                    aria-label="Parent folder"
                    className={ToolbarButton}
                    onClick={() => void model.goParentDirectory({})}
                >
                    <ArrowUp size={15} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    aria-label="Refresh files"
                    className={ToolbarButton}
                    onClick={() => setRevision((value) => value + 1)}
                >
                    <RefreshCw size={15} aria-hidden="true" />
                </button>
            </header>
            {folderError && (
                <p className="px-3 py-2 text-sm" role="alert">
                    {folderError}
                </p>
            )}
            {loading && (
                <p className="px-3 py-2 text-sm" role="status">
                    Loading files…
                </p>
            )}
            {error && (
                <p className="px-3 py-2 text-sm" role="alert">
                    {error}
                </p>
            )}
            {!loading && !error && tree.length === 0 && <p className="px-3 py-2 text-sm">This folder is empty.</p>}
            {tree.length > 0 && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <ProjectTree
                        collapseNonce={revision}
                        cwd={directory}
                        data={tree}
                        onActivateFile={(file) => attach(file, "file")}
                        onActivateFolder={(folder) => attach(folder, "folder")}
                        onLoadChildren={loadChildren}
                        onNodeOpenChange={(id, expanded) => setOpen((value) => ({ ...value, [id]: expanded }))}
                        onPreviewFile={(file) => void model.goHistory(file)}
                        openState={open}
                        isDirty={(file) => model.hasFileDraft(file)}
                    />
                </div>
            )}
            {focused && <FileActionDialogs />}
        </section>
    );
}
