// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { attachOSResourceToKronos } from "@/app/store/os-resource-service";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { PreviewModel } from "@/app/view/preview/preview-model";
import { createBlockSplitHorizontally, getApi, getBlockComponentModel } from "@/store/global";
import { atom, useAtomValue } from "jotai";
import {
    ChevronDown,
    ChevronRight,
    Copy,
    FileCode2,
    Folder,
    FolderOpen,
    Pencil,
    RefreshCw,
    Save,
    Search,
    X,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { subscribeAgentActivityStream } from "../../types/agent-activity";
import type { NotchExplorerEntry } from "../../types/native-notch";
import { AdeDiagnostics } from "./ade-diagnostics";
import { useCoucouWorkbenchAppearance } from "./coucou-workbench-appearance";

type LogEntry = { time: number; text: string; error?: boolean; output?: boolean };
const DefaultFocused = atom(true);

export function NativeFileWorkbench({
    blockId,
    children,
    previewModel,
    searchAnchorRef,
    overlay,
}: {
    blockId: string;
    children: ReactNode;
    previewModel?: PreviewModel;
    searchAnchorRef?: React.RefObject<HTMLDivElement>;
    overlay?: ReactNode;
}) {
    const [model, setModel] = useState<PreviewModel>(previewModel);
    const appearance = useCoucouWorkbenchAppearance();
    useEffect(() => {
        if (previewModel) {
            setModel(previewModel);
            return;
        }
        const find = () => {
            const next = getBlockComponentModel(blockId)?.viewModel as PreviewModel;
            if (next?.viewType === "preview") setModel(next);
        };
        find();
        const timer = window.setInterval(find, 250);
        return () => clearInterval(timer);
    }, [blockId, previewModel]);
    return (
        <div className="coucou-chrome relative flex min-h-0 flex-1 flex-col overflow-hidden" style={appearance}>
            {model ? (
                <NativeFileTabs model={model} searchAnchorRef={searchAnchorRef}>
                    {children}
                </NativeFileTabs>
            ) : (
                children
            )}
            {overlay}
        </div>
    );
}

function NativeFileTabs({
    model,
    children,
    searchAnchorRef,
}: {
    model: PreviewModel;
    children: ReactNode;
    searchAnchorRef?: React.RefObject<HTMLDivElement>;
}) {
    const path = useAtomValue(model.metaFilePath);
    const connection = useAtomValue(model.connectionImmediate);
    const draft = useAtomValue(model.newFileContent);
    const editMode = useAtomValue(model.editMode);
    const focused = useAtomValue(model.nodeModel?.isFocused ?? DefaultFocused);
    const [resolvedPath, setResolvedPath] = useState(path);
    const [directory, setDirectory] = useState(false);
    const [tabs, setTabs] = useState<string[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [panel, setPanel] = useState<"output" | "logs" | "problems">("output");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const navigationBusy = useRef(false);
    const [inventory, setInventory] = useState<NotchExplorerEntry[]>([]);
    const [filter, setFilter] = useState("");
    const [treeLoading, setTreeLoading] = useState(true);
    const [explorerOpen, setExplorerOpen] = useState(true);
    const [activityOpen, setActivityOpen] = useState(false);
    const [sidebar, setSidebar] = useState<"files" | "changes">("files");
    const [changes, setChanges] = useState<OSWorktreeChange[]>([]);
    const [changesLoading, setChangesLoading] = useState(false);
    const [changesError, setChangesError] = useState("");
    const [diff, setDiff] = useState<{ path: string; text: string; loading: boolean; error: string }>();
    const diffEpoch = useRef(0);
    const changesEpoch = useRef(0);
    const tree = useRef({ root: "", entries: new Map<string, FileInfo[]>(), expanded: new Set<string>() });
    const requestEpoch = useRef(0);
    const currentPath = useRef(path);
    currentPath.current = path;
    const log = useCallback(
        (text: string, error = false, output = false) =>
            setLogs((rows) => [...rows, { time: Date.now(), text, error, output }].slice(-100)),
        []
    );

    const publish = useCallback(() => {
        const entries: NotchExplorerEntry[] = [];
        const visit = (folder: string, depth: number) => {
            if (depth > 12 || entries.length >= 300) return;
            for (const file of tree.current.entries.get(folder) ?? []) {
                if (entries.length >= 300) break;
                const expanded = tree.current.expanded.has(file.path);
                entries.push({ path: file.path, name: file.name, directory: file.isdir === true, depth, expanded });
                if (expanded) visit(file.path, depth + 1);
            }
        };
        visit(tree.current.root, 0);
        setInventory(entries);
        if (model.nodeModel && !globalStore.get(model.nodeModel.isFocused)) return;
        getApi().syncNativeNotch({
            explorer: {
                blockId: model.blockId,
                root: tree.current.root,
                selected: currentPath.current ?? "",
                entries,
                error: "",
            },
        });
    }, [model]);
    useEffect(() => {
        if (focused) publish();
    }, [focused, publish]);

    const readFolder = useCallback(
        async (folder: string) => {
            const epoch = requestEpoch.current;
            const result = await model.env.rpc.FileReadCommand(TabRpcClient, {
                info: { path: await model.formatRemoteUri(folder, globalStore.get) },
            });
            if (epoch !== requestEpoch.current) return;
            const entries = (result.entries ?? []).filter((row) => row.name && row.name !== "." && row.name !== "..");
            entries.sort((a, b) => Number(b.isdir) - Number(a.isdir) || a.name.localeCompare(b.name));
            tree.current.entries.set(folder, entries);
            publish();
        },
        [model, publish]
    );

    const open = useCallback(
        async (next: string) => {
            if (navigationBusy.current || next === currentPath.current) return;
            navigationBusy.current = true;
            setBusy(true);
            try {
                await model.goHistory(next);
                log(`Opened ${next}`);
                setError("");
            } catch (e) {
                setError(String(e));
                log(String(e), true);
            } finally {
                navigationBusy.current = false;
                setBusy(false);
            }
        },
        [model, log]
    );

    useEffect(() => {
        let active = true;
        requestEpoch.current++;
        changesEpoch.current++;
        diffEpoch.current++;
        setChanges([]);
        setChangesError("");
        setDiff(undefined);
        setTreeLoading(true);
        setInventory([]);
        tree.current = { root: "", entries: new Map(), expanded: new Set() };
        setTabs([]);
        void globalStore
            .get(model.statFile)
            .then(async (info) => {
                if (!active || !info) return;
                tree.current.root = info.isdir ? info.path : info.dir;
                await readFolder(tree.current.root);
            })
            .catch((e) => {
                if (!active) return;
                setError(String(e));
                getApi().syncNativeNotch({
                    explorer: {
                        blockId: model.blockId,
                        root: "",
                        selected: "",
                        entries: [],
                        error: String(e).slice(0, 300),
                    },
                });
            })
            .finally(() => {
                if (active) setTreeLoading(false);
            });
        return () => {
            active = false;
        };
    }, [connection, model, readFolder]);

    useEffect(() => {
        let active = true;
        void globalStore
            .get(model.statFile)
            .then(async (info) => {
                if (!active || !info) return;
                setResolvedPath(info.path);
                setDirectory(info.isdir === true);
                if (info.isdir) {
                    if (tree.current.root && tree.current.root !== info.path) {
                        requestEpoch.current++;
                        changesEpoch.current++;
                        diffEpoch.current++;
                        setDiff(undefined);
                        setChanges([]);
                        setSidebar("files");
                        tree.current = { root: info.path, entries: new Map(), expanded: new Set() };
                        setTreeLoading(true);
                        try {
                            await readFolder(info.path);
                        } finally {
                            if (active) setTreeLoading(false);
                        }
                    }
                    return;
                }
                setTabs((rows) => (rows.includes(info.path) ? rows : [...rows, info.path]));
                publish();
            })
            .catch((e) => {
                if (active) setError(`Could not open path: ${String(e)}`);
            });
        return () => {
            active = false;
        };
    }, [path, model, publish, readFolder]);

    const explorerAction = useCallback(
        (next: string) => {
            if (next.startsWith(":")) {
                const action = next.slice(1);
                void (async () => {
                    try {
                        if (action === "collapse") {
                            tree.current.expanded.clear();
                            publish();
                            return;
                        }
                        if (action === "refresh") {
                            await Promise.all([tree.current.root, ...tree.current.expanded].map(readFolder));
                            return;
                        }
                        if (!["new-file", "new-folder"].includes(action)) return;
                        const name = window.prompt(action === "new-file" ? "New file name" : "New folder name");
                        if (!name || !name.trim()) return;
                        if (/[/\\]/.test(name) || [".", ".."].includes(name.trim()))
                            throw new Error("Enter a name without path separators");
                        const file = tree.current.root.replace(/\/$/, "") + "/" + name.trim();
                        const info = { path: await model.formatRemoteUri(file, globalStore.get) };
                        const existing = await model.env.rpc.FileInfoCommand(TabRpcClient, { info });
                        if (!existing?.notfound) throw new Error("A file or folder with that name already exists");
                        // Empty append cannot truncate a file created concurrently after the existence check.
                        if (action === "new-file")
                            await model.env.rpc.FileAppendCommand(TabRpcClient, { info, data64: "" });
                        else await model.env.rpc.FileMkdirCommand(TabRpcClient, { info });
                        await readFolder(tree.current.root);
                        if (action === "new-file") {
                            await open(file);
                            await model.setEditMode(true);
                        }
                        setError("");
                    } catch (e) {
                        setError(String(e));
                        log(String(e), true);
                    }
                })();
                return;
            }
            const row = [...tree.current.entries.values()].flat().find((entry) => entry.path === next);
            if (!row) return;
            if (!row.isdir) {
                void open(next);
                return;
            }
            if (tree.current.expanded.has(next)) {
                tree.current.expanded.delete(next);
                publish();
                return;
            }
            tree.current.expanded.add(next);
            void readFolder(next).catch((e) => {
                tree.current.expanded.delete(next);
                setError(String(e));
                log(String(e), true);
                publish();
            });
        },
        [open, publish, readFolder, log]
    );
    useEffect(
        () =>
            getApi().onNativeNotchExplorer((next) => {
                if (model.nodeModel && !globalStore.get(model.nodeModel.isFocused)) return;
                explorerAction(next);
            }),
        [model, explorerAction]
    );

    useEffect(
        () =>
            subscribeAgentActivityStream((activity) => {
                if (activity.blockid && activity.blockid !== model.blockId) return;
                log(
                    activity.detail ?? activity.action,
                    ["failed", "error"].includes(activity.phase),
                    ["succeeded", "finish"].includes(activity.phase)
                );
            }),
        [model, log]
    );

    const visibleLogs = panel === "output" ? logs.filter((row) => row.output || row.error) : logs;
    const toggleFolder = async (folder: string) => {
        if (tree.current.expanded.has(folder)) {
            tree.current.expanded.delete(folder);
            publish();
            return;
        }
        tree.current.expanded.add(folder);
        try {
            await readFolder(folder);
        } catch (e) {
            tree.current.expanded.delete(folder);
            setError(`Could not load folder: ${String(e)}`);
            publish();
        }
    };
    const refreshChanges = async () => {
        const epoch = ++changesEpoch.current;
        setChangesLoading(true);
        setChangesError("");
        try {
            const rows = await RpcApi.OSWorktreeChangesCommand(TabRpcClient, tree.current.root);
            if (epoch === changesEpoch.current) setChanges(rows ?? []);
        } catch (e) {
            if (epoch === changesEpoch.current) setChangesError(`Could not load changes: ${String(e)}`);
        } finally {
            if (epoch === changesEpoch.current) setChangesLoading(false);
        }
    };
    const showDiff = async (file: string) => {
        const epoch = ++diffEpoch.current;
        setDiff({ path: file, text: "", loading: true, error: "" });
        try {
            const text = await RpcApi.OSWorktreeFileDiffCommand(TabRpcClient, {
                repopath: tree.current.root,
                path: file,
            });
            if (epoch === diffEpoch.current) setDiff({ path: file, text, loading: false, error: "" });
        } catch (e) {
            if (epoch === diffEpoch.current)
                setDiff({ path: file, text: "", loading: false, error: `Could not load diff: ${String(e)}` });
        }
    };
    return (
        <div className="ade-workbench flex min-h-0 flex-1 flex-col" aria-label="KronTerm development environment">
            <div ref={searchAnchorRef} className="ade-heading flex h-10 shrink-0 items-center gap-3 px-3 pr-28">
                <button
                    className="ade-control cursor-pointer rounded p-1.5"
                    aria-label="Toggle project explorer"
                    aria-expanded={explorerOpen}
                    onClick={() => setExplorerOpen(!explorerOpen)}
                >
                    <Folder size={16} />
                </button>
                <span className="text-xs font-medium">ADE</span>
                <span className="ade-secondary truncate text-xs" title={tree.current.root}>
                    {tree.current.root.split("/").pop() || "Project"}
                </span>
                <button
                    className="ade-control cursor-pointer rounded px-2 py-1 text-xs"
                    onClick={() => model.updateOpenFileModalAndError(true)}
                >
                    Open file
                </button>
                <button
                    className="ade-control cursor-pointer rounded px-2 py-1 text-xs"
                    disabled={directory || busy}
                    title={
                        draft != null
                            ? "Save changes before opening a second editor"
                            : "Open this file in a separate editor widget"
                    }
                    onClick={() => {
                        if (draft != null) {
                            setError("Save this file before opening a second editor.");
                            return;
                        }
                        void createBlockSplitHorizontally(
                            { meta: { view: "preview", file: resolvedPath, connection } },
                            model.blockId,
                            "after"
                        ).catch((e) => setError(String(e)));
                    }}
                >
                    Split editor
                </button>
                <button
                    className="ade-control cursor-pointer rounded px-2 py-1 text-xs"
                    disabled={Boolean(connection)}
                    title={
                        connection
                            ? "Remote file handoff is unavailable"
                            : "Attach this file or project to existing chat"
                    }
                    onClick={() =>
                        attachOSResourceToKronos({
                            id: `ade:${resolvedPath}`,
                            kind: resolvedPath === tree.current.root ? "folder" : "file",
                            name: resolvedPath.split("/").pop() || "Project",
                            resource: resolvedPath,
                        })
                    }
                >
                    Ask agent
                </button>
                <button
                    className="ade-control ml-auto cursor-pointer rounded px-2 py-1 text-xs"
                    aria-expanded={activityOpen}
                    onClick={() => setActivityOpen(!activityOpen)}
                >
                    Activity
                </button>
            </div>
            <div className="flex min-h-0 flex-1">
                <aside
                    hidden={!explorerOpen}
                    className="ade-explorer flex w-56 shrink-0 flex-col overflow-hidden max-[700px]:w-40"
                    aria-label="Project explorer"
                >
                    <div className="flex h-10 shrink-0 items-center gap-2 px-3">
                        <button
                            className="ade-control cursor-pointer rounded px-1 py-1 text-xs"
                            aria-pressed={sidebar === "files"}
                            onClick={() => setSidebar("files")}
                        >
                            Explorer
                        </button>
                        <button
                            className="ade-control cursor-pointer rounded px-1 py-1 text-xs"
                            disabled={Boolean(connection)}
                            aria-pressed={sidebar === "changes"}
                            onClick={() => {
                                setSidebar("changes");
                                void refreshChanges();
                            }}
                        >
                            Changes
                        </button>
                        <button
                            className="ade-control cursor-pointer rounded p-1.5"
                            aria-label="Refresh project files"
                            disabled={treeLoading}
                            onClick={async () => {
                                setTreeLoading(true);
                                try {
                                    await Promise.all(
                                        [tree.current.root, ...tree.current.expanded].filter(Boolean).map(readFolder)
                                    );
                                    setError("");
                                } catch (e) {
                                    setError(`Could not refresh files: ${String(e)}`);
                                } finally {
                                    setTreeLoading(false);
                                }
                            }}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                    {sidebar === "files" ? (
                        <>
                            <label className="ade-filter mx-2 mb-2 flex items-center gap-2 rounded px-2 py-1.5">
                                <Search size={13} aria-hidden="true" />
                                <input
                                    className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                                    aria-label="Filter loaded project files"
                                    placeholder="Filter loaded files"
                                    value={filter}
                                    onChange={(event) => setFilter(event.target.value)}
                                />
                            </label>
                            <div className="min-h-0 flex-1 overflow-auto pb-3" aria-busy={treeLoading}>
                                {treeLoading && (
                                    <p className="ade-secondary px-3 text-xs" role="status">
                                        Loading project files…
                                    </p>
                                )}
                                <div className="flex gap-2 px-3 pb-2">
                                    <button
                                        className="ade-control cursor-pointer rounded px-1 py-1 text-xs"
                                        disabled={treeLoading || !tree.current.root}
                                        onClick={() => explorerAction(":new-file")}
                                    >
                                        New file
                                    </button>
                                    <button
                                        className="ade-control cursor-pointer rounded px-1 py-1 text-xs"
                                        disabled={treeLoading || !tree.current.root}
                                        onClick={() => explorerAction(":new-folder")}
                                    >
                                        New folder
                                    </button>
                                </div>
                                {!treeLoading && inventory.length === 0 && (
                                    <p className="ade-secondary px-3 text-xs">
                                        {error
                                            ? "Files could not load. Retry with Refresh."
                                            : "This folder is empty. Create a file to start editing."}
                                    </p>
                                )}
                                {inventory
                                    .filter(
                                        (entry) => !filter || entry.path.toLowerCase().includes(filter.toLowerCase())
                                    )
                                    .map((entry) => (
                                        <button
                                            key={entry.path}
                                            type="button"
                                            className="ade-tree-row flex w-full cursor-pointer items-center gap-1.5 py-1.5 pr-2 text-left text-xs"
                                            data-selected={entry.path === resolvedPath}
                                            aria-current={entry.path === resolvedPath ? "page" : undefined}
                                            aria-expanded={entry.directory ? entry.expanded : undefined}
                                            title={entry.path}
                                            style={{ paddingLeft: 10 + entry.depth * 14 }}
                                            onClick={() =>
                                                entry.directory ? void toggleFolder(entry.path) : void open(entry.path)
                                            }
                                        >
                                            {entry.directory ? (
                                                <>
                                                    {entry.expanded ? (
                                                        <ChevronDown size={12} />
                                                    ) : (
                                                        <ChevronRight size={12} />
                                                    )}
                                                    {entry.expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                                                </>
                                            ) : (
                                                <FileCode2 size={14} className="ml-4" />
                                            )}
                                            <span className="truncate">{entry.name}</span>
                                            {(entry.path === path ? draft != null : model.hasFileDraft(entry.path)) && (
                                                <span aria-label="Unsaved changes">•</span>
                                            )}
                                        </button>
                                    ))}
                                {filter &&
                                    inventory.length > 0 &&
                                    !inventory.some((entry) =>
                                        entry.path.toLowerCase().includes(filter.toLowerCase())
                                    ) && (
                                        <p className="ade-secondary px-3 text-xs">
                                            No loaded files match. Clear the filter or expand a folder.
                                        </p>
                                    )}
                            </div>
                        </>
                    ) : (
                        <div className="min-h-0 flex-1 overflow-auto px-2 text-xs" aria-busy={changesLoading}>
                            {changesLoading && <p role="status">Loading Git changes…</p>}
                            {changesError && <p role="alert">{changesError}</p>}
                            {!changesLoading && !changesError && changes.length === 0 && (
                                <p className="ade-secondary">No uncommitted changes in this project.</p>
                            )}
                            {changes.map((change) => (
                                <button
                                    key={change.path}
                                    className="ade-tree-row flex w-full cursor-pointer items-center gap-2 p-2 text-left"
                                    title={`Review ${change.path}`}
                                    onClick={() => void showDiff(change.path)}
                                >
                                    <FileCode2 size={14} />
                                    <span className="min-w-0 flex-1 truncate">{change.path}</span>
                                    <span>{change.status}</span>
                                </button>
                            ))}
                            <button
                                className="ade-control mt-2 cursor-pointer rounded px-2 py-1"
                                disabled={changesLoading}
                                onClick={() => void refreshChanges()}
                            >
                                Refresh changes
                            </button>
                        </div>
                    )}
                </aside>
                <div className="flex min-w-0 flex-1 flex-col">
                    <div
                        className="ade-tabs flex h-10 shrink-0 items-center"
                        role="tablist"
                        aria-label="Open files"
                        onKeyDown={(event) => {
                            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                            const buttons = [
                                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
                            ];
                            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                            if (index < 0 || buttons.length === 0) return;
                            event.preventDefault();
                            const next =
                                event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? buttons.length - 1
                                      : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                                        buttons.length;
                            buttons[next].focus();
                            buttons[next].click();
                        }}
                    >
                        <div className="flex min-w-0 flex-1 overflow-x-auto">
                            {tabs.map((file) => (
                                <div
                                    key={file}
                                    className="ade-file-tab flex shrink-0 items-center"
                                    data-active={file === resolvedPath}
                                >
                                    <button
                                        role="tab"
                                        id={`ade-tab-${model.blockId}-${encodeURIComponent(file)}`}
                                        aria-controls={`ade-editor-${model.blockId}`}
                                        tabIndex={file === resolvedPath ? 0 : -1}
                                        aria-selected={file === resolvedPath}
                                        title={file}
                                        disabled={busy}
                                        className="flex h-10 cursor-pointer items-center gap-2 px-3 text-xs"
                                        onClick={() => void open(file)}
                                    >
                                        <FileCode2 size={14} />
                                        {file.split("/").pop()}
                                        {(file === path ? draft != null : model.hasFileDraft(file)) && " •"}
                                    </button>
                                    <button
                                        className="cursor-pointer px-2"
                                        disabled={busy}
                                        title="Close file tab"
                                        aria-label={`Close ${file.split("/").pop()}`}
                                        onClick={() => {
                                            if (
                                                (file === path ? draft != null : model.hasFileDraft(file)) &&
                                                !window.confirm("Discard unsaved changes in this file?")
                                            )
                                                return;
                                            const remaining = tabs.filter((tab) => tab !== file);
                                            if (file === path) globalStore.set(model.newFileContent, null);
                                            model.discardFileDraft(file);
                                            if (file === path)
                                                void open(remaining[remaining.length - 1] ?? tree.current.root);
                                            setTabs(remaining);
                                        }}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            aria-label={editMode ? "Preview file" : "Edit file"}
                            disabled={directory}
                            className="ade-control flex h-9 cursor-pointer items-center gap-1 rounded px-2 text-xs"
                            onClick={() => void model.setEditMode(!editMode).catch((e) => setError(String(e)))}
                        >
                            <Pencil size={14} />
                            {editMode ? "Preview" : "Edit"}
                        </button>
                        <button
                            aria-label="Save file"
                            title="Save file (⌘S)"
                            disabled={busy || draft == null}
                            className="ade-control cursor-pointer rounded p-2 disabled:opacity-30"
                            onClick={() => {
                                globalStore.set(model.errorMsgAtom, null);
                                void model
                                    .handleFileSave()
                                    .then(() => {
                                        const saveError = globalStore.get(model.errorMsgAtom);
                                        if (saveError?.status === "Save Failed") {
                                            throw new Error(saveError?.text ?? "Could not save file");
                                        }
                                        setError("");
                                        log(`Saved ${path}`, false, true);
                                    })
                                    .catch((e) => {
                                        setError(String(e));
                                        log(String(e), true);
                                    });
                            }}
                        >
                            <Save size={15} />
                        </button>
                    </div>
                    <div className="ade-breadcrumb flex shrink-0 items-center gap-2 px-3 py-1 text-xs">
                        <div className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap" title={resolvedPath}>
                            {resolvedPath}
                        </div>
                        <button
                            aria-label="Copy full file path"
                            title="Copy full file path"
                            className="ade-control grid size-8 shrink-0 cursor-pointer place-items-center rounded"
                            onClick={() =>
                                void navigator.clipboard.writeText(resolvedPath).catch((e) => setError(String(e)))
                            }
                        >
                            <Copy size={14} />
                        </button>
                    </div>
                    {error && (
                        <p role="alert" className="shrink-0 px-3 text-xs text-red-600 dark:text-red-300">
                            {error}
                        </p>
                    )}
                    <div className="relative flex min-h-0 flex-1 flex-col">
                        {diff && (
                            <section className="ade-diff flex min-h-0 flex-1 flex-col" aria-label="Git diff">
                                <div className="ade-breadcrumb flex items-center gap-2 px-3 py-2 text-xs">
                                    <span className="min-w-0 flex-1 truncate">Changes · {diff.path}</span>
                                    <button
                                        className="ade-control cursor-pointer rounded px-2 py-1"
                                        onClick={() => {
                                            void open(`${tree.current.root.replace(/\/$/, "")}/${diff.path}`);
                                            diffEpoch.current++;
                                            setDiff(undefined);
                                        }}
                                    >
                                        Open file
                                    </button>
                                    <button
                                        className="ade-control cursor-pointer rounded px-2 py-1"
                                        onClick={() => {
                                            diffEpoch.current++;
                                            setDiff(undefined);
                                        }}
                                    >
                                        Close diff
                                    </button>
                                </div>
                                {diff.loading ? (
                                    <p role="status" className="p-3 text-xs">
                                        Loading diff…
                                    </p>
                                ) : diff.error ? (
                                    <div className="p-3 text-xs">
                                        <p role="alert">{diff.error}</p>
                                        <button
                                            className="ade-control cursor-pointer rounded p-2"
                                            onClick={() => void showDiff(diff.path)}
                                        >
                                            Retry diff
                                        </button>
                                    </div>
                                ) : (
                                    <pre className="min-h-0 flex-1 overflow-auto p-3 text-xs">
                                        {diff.text || "No textual diff is available for this file."}
                                    </pre>
                                )}
                            </section>
                        )}
                        <div
                            id={`ade-editor-${model.blockId}`}
                            role="tabpanel"
                            aria-label={resolvedPath}
                            hidden={Boolean(diff) || directory}
                            className="ade-editor flex min-h-0 flex-1 flex-col"
                        >
                            {children}
                        </div>
                        {!diff && directory && (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                                <FolderOpen size={28} className="ade-secondary" />
                                <p className="text-sm font-medium">{tree.current.root.split("/").pop() || "Project"}</p>
                                <p className="ade-secondary text-xs">
                                    Choose a file in Explorer, or search for a project file.
                                </p>
                                <button
                                    className="ade-control cursor-pointer rounded px-3 py-2 text-xs"
                                    onClick={() => model.updateOpenFileModalAndError(true)}
                                >
                                    Open file
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div hidden={!activityOpen} className="native-file-output ade-activity shrink-0">
                <div className="flex h-7 items-center gap-4 px-3" role="tablist" aria-label="File activity">
                    {(["output", "logs", "problems"] as const).map((name) => (
                        <button
                            key={name}
                            role="tab"
                            id={`ade-activity-tab-${model.blockId}-${name}`}
                            aria-controls={`ade-activity-${model.blockId}`}
                            aria-selected={panel === name}
                            className="ade-panel-tab h-full cursor-pointer border-b text-[11px] capitalize"
                            data-active={panel === name}
                            onClick={() => setPanel(name)}
                        >
                            {name === "output" ? "Output" : name === "logs" ? "Logs" : "Problems"}
                        </button>
                    ))}
                    <button
                        hidden={panel === "problems"}
                        className="ade-secondary ml-auto cursor-pointer text-[11px]"
                        onClick={() => setLogs([])}
                    >
                        Clear
                    </button>
                </div>
                <div
                    role="tabpanel"
                    id={`ade-activity-${model.blockId}`}
                    aria-labelledby={`ade-activity-tab-${model.blockId}-${panel}`}
                    aria-label={panel}
                    className="ade-secondary h-24 overflow-auto px-3 pb-2 font-mono text-[11px]"
                >
                    {panel === "problems" ? (
                        <AdeDiagnostics model={model} />
                    ) : visibleLogs.length ? (
                        visibleLogs.map((row, index) => (
                            <div key={index} className={row.error ? "text-red-300" : ""}>
                                <span className="ade-secondary mr-3">{new Date(row.time).toLocaleTimeString()}</span>
                                {row.text}
                            </div>
                        ))
                    ) : (
                        <span>
                            {panel === "output"
                                ? "File saves and completed agent actions appear here."
                                : "No file activity yet."}
                        </span>
                    )}
                </div>
            </div>
            <footer className="ade-status flex h-7 shrink-0 items-center gap-3 px-3 text-[11px]">
                <span>{connection || "Local project"}</span>
                <span className="ade-secondary">
                    {tabs.length} open {tabs.length === 1 ? "file" : "files"}
                </span>
            </footer>
        </div>
    );
}
