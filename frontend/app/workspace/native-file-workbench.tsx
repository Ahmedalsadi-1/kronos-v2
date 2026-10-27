// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { attachOSResourceToKronos } from "@/app/store/os-resource-service";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import type { PreviewModel } from "@/app/view/preview/preview-model";
import { createBlockSplitHorizontally, getApi, getBlockComponentModel } from "@/store/global";
import { resolveAgentFilePath } from "@/types/agent-file-activity";
import { atom, useAtomValue } from "jotai";
import {
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    ChevronDown,
    ChevronRight,
    ChevronsDownUp,
    Copy,
    FileCode2,
    FilePlus2,
    Folder,
    FolderOpen,
    FolderPlus,
    Home,
    MoreHorizontal,
    PanelLeftClose,
    PanelLeftOpen,
    Pencil,
    RefreshCw,
    Save,
    Search,
    X,
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
    agentActivityTimeline,
    subscribeAgentActivityStream,
    type LiveAgentSurfaceActivity,
} from "../../types/agent-activity";
import type { NotchExplorerEntry } from "../../types/native-notch";
import { AdeDiagnostics } from "./ade-diagnostics";
import { AdeProjectTree } from "./ade-project-tree";
import "./ade-tree-code.css";
import { useCoucouWorkbenchAppearance } from "./coucou-workbench-appearance";

type LogEntry = { time: number; text: string; error?: boolean; output?: boolean };
const DefaultFocused = atom(true);

function resolvedFileInfoPath(info: FileInfo): string {
    return info.path === "~" && info.dir && info.name ? `${info.dir.replace(/\/$/, "")}/${info.name}` : info.path;
}

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
        <div
            className="coucou-chrome ade-tree-shell relative flex min-h-0 flex-1 flex-col overflow-hidden"
            style={appearance}
        >
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
    const [copied, setCopied] = useState(false);
    const [controlsOpen, setControlsOpen] = useState(false);
    const copyTimeout = useRef<ReturnType<typeof setTimeout>>(null);
    useEffect(() => () => clearTimeout(copyTimeout.current), []);
    const navigationBusy = useRef(false);
    const [inventory, setInventory] = useState<NotchExplorerEntry[]>([]);
    const [filter, setFilter] = useState("");
    const [treeLoading, setTreeLoading] = useState(true);
    const [explorerOpen, setExplorerOpen] = useState(true);
    const [explorerWidth, setExplorerWidth] = useState(250);
    const [followAgent, setFollowAgent] = useState(true);
    const [newEntry, setNewEntry] = useState<"new-file" | "new-folder">(null);
    const [newEntryName, setNewEntryName] = useState("");
    const [creatingEntry, setCreatingEntry] = useState(false);
    const followedFile = useRef<string>(null);
    const followEpoch = useRef(0);
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
                tree.current.root = info.isdir ? resolvedFileInfoPath(info) : info.dir;
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
                const resolved = resolvedFileInfoPath(info);
                setResolvedPath(resolved);
                setDirectory(info.isdir === true);
                if (info.isdir) {
                    if (tree.current.root && tree.current.root !== resolved) {
                        requestEpoch.current++;
                        changesEpoch.current++;
                        diffEpoch.current++;
                        setDiff(undefined);
                        setChanges([]);
                        setSidebar("files");
                        tree.current = { root: resolved, entries: new Map(), expanded: new Set() };
                        setTreeLoading(true);
                        try {
                            await readFolder(resolved);
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
        (next: string, entryName?: string) => {
            if (next.startsWith(":")) {
                const action = next.slice(1);
                if ((action === "new-file" || action === "new-folder") && entryName == null) {
                    setExplorerOpen(true);
                    setNewEntry(action);
                    setNewEntryName("");
                    return;
                }
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
                        const name = entryName;
                        if (!name || !name.trim()) return;
                        if (/[/\\]/.test(name) || [".", ".."].includes(name.trim()))
                            throw new Error("Enter a name without path separators");
                        const file = tree.current.root.replace(/\/$/, "") + "/" + name.trim();
                        setCreatingEntry(true);
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
                        setNewEntry(null);
                        setNewEntryName("");
                    } catch (e) {
                        setError(String(e));
                        log(String(e), true);
                    } finally {
                        setCreatingEntry(false);
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

    useEffect(() => {
        if (!followAgent || connection || treeLoading) return;
        let refreshTimer: ReturnType<typeof setInterval>;
        let followTask = Promise.resolve();
        let refreshDeadline = 0;
        const refresh = () => {
            if (Date.now() > refreshDeadline) {
                clearInterval(refreshTimer);
                return;
            }
            if (
                globalStore.get(model.metaFilePath) !== followedFile.current ||
                globalStore.get(model.newFileContent) != null
            )
                return;
            if (model.fileContentSaved) globalStore.set(model.fileContentSaved, null);
            if (model.refreshVersion) globalStore.set(model.refreshVersion, (version) => version + 1);
        };
        const accept = (activity: LiveAgentSurfaceActivity) => {
            if (activity.surface !== "file" || !activity.filepath) return;
            const next = resolveAgentFilePath(activity.filepath, tree.current.root);
            if (!next) return;
            if (["failed", "cancelled"].includes(activity.phase)) {
                if (next === followedFile.current) {
                    followEpoch.current++;
                    clearInterval(refreshTimer);
                }
                return;
            }
            if (!["running", "succeeded"].includes(activity.phase)) return;
            const epoch = ++followEpoch.current;
            clearInterval(refreshTimer);
            followedFile.current = next;
            refreshDeadline = Date.now() + 30000;
            followTask = followTask.then(async () => {
                if (epoch !== followEpoch.current) return;
                try {
                    await open(next);
                    if (epoch !== followEpoch.current) return;
                    await model.setEditMode(true);
                    refresh();
                    if (activity.phase === "running") refreshTimer = setInterval(refresh, 500);
                    else await Promise.all([tree.current.root, ...tree.current.expanded].map(readFolder));
                    await getApi().selectNativeHudWidget?.(model.blockId, true);
                } catch (e) {
                    if (epoch === followEpoch.current) setError(`Could not follow agent file: ${String(e)}`);
                }
            });
        };
        const off = subscribeAgentActivityStream(accept);
        const latest = agentActivityTimeline
            .getAll()
            .filter(
                (activity) =>
                    activity.surface === "file" &&
                    activity.filepath &&
                    Date.now() - activity.timestamp < 30000 &&
                    resolveAgentFilePath(activity.filepath, tree.current.root)
            )
            .at(-1);
        if (latest) accept(latest);
        return () => {
            followEpoch.current++;
            clearInterval(refreshTimer);
            off();
        };
    }, [followAgent, connection, treeLoading, model, open, readFolder]);

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
        <div
            ref={searchAnchorRef}
            className="ade-workbench ade-tree-code flex min-h-0 flex-1 flex-col"
            aria-label="KronTerm development environment"
        >
            <button
                type="button"
                className="ade-workspace-toggle"
                aria-label="Toggle workspace controls"
                aria-expanded={controlsOpen}
                onClick={() => setControlsOpen(!controlsOpen)}
            >
                <MoreHorizontal size={16} aria-hidden="true" />
            </button>
            <div hidden={!controlsOpen} className="ade-heading flex h-10 shrink-0 items-center gap-3 px-3 pr-28">
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
                {!explorerOpen && (
                    <button
                        type="button"
                        className="ade-sidebar-open"
                        aria-label="Expand file explorer"
                        onClick={() => setExplorerOpen(true)}
                    >
                        <PanelLeftOpen size={16} />
                    </button>
                )}
                <aside
                    hidden={!explorerOpen}
                    className="ade-explorer flex w-56 shrink-0 flex-col overflow-hidden max-[700px]:w-40"
                    aria-label="Project explorer"
                    style={{ width: `clamp(140px, ${explorerWidth}px, 60%)` }}
                >
                    <div className="ade-explorer-path" title={tree.current.root}>
                        <button
                            type="button"
                            aria-label="Open folder path"
                            onClick={() => model.updateOpenFileModalAndError(true)}
                        >
                            <FolderOpen size={15} aria-hidden="true" />
                            <span>{path === "~" ? `~ (${tree.current.root})` : tree.current.root || path}</span>
                        </button>
                        <button type="button" aria-label="Fold file explorer" onClick={() => setExplorerOpen(false)}>
                            <PanelLeftClose size={16} />
                        </button>
                    </div>
                    <nav className="ade-explorer-nav" aria-label="File explorer navigation">
                        <button
                            type="button"
                            aria-label="Follow agent files"
                            aria-pressed={followAgent}
                            title="Follow files opened or changed by the agent"
                            onClick={() => setFollowAgent(!followAgent)}
                        >
                            <FileCode2 size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="Back"
                            onClick={() => void model.goHistoryBack().catch((e) => setError(String(e)))}
                        >
                            <ArrowLeft size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="Forward"
                            onClick={() => void model.goHistoryForward().catch((e) => setError(String(e)))}
                        >
                            <ArrowRight size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="Parent folder"
                            onClick={() => void model.goParentDirectory({}).catch((e) => setError(String(e)))}
                        >
                            <ArrowUp size={15} />
                        </button>
                        <button type="button" aria-label="Home folder" onClick={() => void open("~")}>
                            <Home size={15} />
                        </button>
                        <button type="button" aria-label="New file" onClick={() => explorerAction(":new-file")}>
                            <FilePlus2 size={15} />
                        </button>
                        <button type="button" aria-label="New folder" onClick={() => explorerAction(":new-folder")}>
                            <FolderPlus size={15} />
                        </button>
                        <button
                            type="button"
                            aria-label="Collapse all folders"
                            onClick={() => explorerAction(":collapse")}
                        >
                            <ChevronsDownUp size={15} />
                        </button>
                    </nav>
                    {newEntry && (
                        <form
                            className="ade-create-entry"
                            aria-label={newEntry === "new-file" ? "Create new file" : "Create new folder"}
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!creatingEntry) explorerAction(`:${newEntry}`, newEntryName);
                            }}
                        >
                            <input
                                autoFocus
                                aria-label={newEntry === "new-file" ? "New file name" : "New folder name"}
                                placeholder={newEntry === "new-file" ? "File name" : "Folder name"}
                                value={newEntryName}
                                onChange={(event) => setNewEntryName(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        event.preventDefault();
                                        setNewEntry(null);
                                    }
                                }}
                                disabled={creatingEntry}
                            />
                            <button type="submit" disabled={creatingEntry || !newEntryName.trim()}>
                                {creatingEntry ? "Creating…" : "Create"}
                            </button>
                            <button
                                type="button"
                                aria-label="Cancel creation"
                                disabled={creatingEntry}
                                onClick={() => setNewEntry(null)}
                            >
                                <X size={14} />
                            </button>
                        </form>
                    )}
                    <div
                        hidden={!controlsOpen}
                        className="ade-explorer-tools flex h-10 shrink-0 items-center gap-2 px-3"
                    >
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
                            <label
                                hidden={!controlsOpen}
                                className="ade-filter mx-2 mb-2 flex items-center gap-2 rounded px-2 py-1.5"
                            >
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
                                <div hidden={!controlsOpen} className="ade-explorer-tools flex gap-2 px-3 pb-2">
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
                                {!connection && !treeLoading && inventory.length > 0 && (
                                    <AdeProjectTree
                                        entries={inventory}
                                        root={tree.current.root}
                                        selectedPath={resolvedPath}
                                        isDirty={(entryPath) =>
                                            entryPath === path ? draft != null : model.hasFileDraft(entryPath)
                                        }
                                        filter={filter}
                                        focused={focused}
                                        onOpen={(path) => void open(path)}
                                        onAttach={(resource) =>
                                            void attachOSResourceToKronos({
                                                id: `local:${resource}`,
                                                kind: inventory.find((entry) => entry.path === resource)?.directory
                                                    ? "folder"
                                                    : "file",
                                                name: resource.split("/").pop(),
                                                resource,
                                            })
                                        }
                                        onLoad={async (folder) => {
                                            try {
                                                await readFolder(folder);
                                            } catch (reason) {
                                                setError(String(reason));
                                            }
                                        }}
                                        onToggle={(folder, expanded) => {
                                            if (expanded) tree.current.expanded.add(folder);
                                            else tree.current.expanded.delete(folder);
                                            publish();
                                        }}
                                        onRefresh={() => explorerAction(":refresh")}
                                    />
                                )}
                                {connection &&
                                    inventory
                                        .filter(
                                            (entry) =>
                                                !filter || entry.path.toLowerCase().includes(filter.toLowerCase())
                                        )
                                        .map((entry) => (
                                            <button
                                                key={entry.path}
                                                type="button"
                                                className="ade-tree-row flex w-full cursor-pointer items-center gap-1.5 py-1.5 pr-2 text-left text-xs"
                                                data-selected={entry.path === resolvedPath}
                                                data-json={entry.name.endsWith(".json") || undefined}
                                                aria-current={entry.path === resolvedPath ? "page" : undefined}
                                                aria-expanded={entry.directory ? entry.expanded : undefined}
                                                title={entry.path}
                                                style={{ paddingLeft: 20 + entry.depth * 20 }}
                                                onClick={() =>
                                                    entry.directory
                                                        ? void toggleFolder(entry.path)
                                                        : void open(entry.path)
                                                }
                                            >
                                                {entry.depth > 0 && (
                                                    <span
                                                        className="ade-tree-guides"
                                                        aria-hidden="true"
                                                        style={{ width: entry.depth * 20 }}
                                                    />
                                                )}
                                                {entry.directory ? (
                                                    <>
                                                        {entry.expanded ? (
                                                            <ChevronDown size={12} />
                                                        ) : (
                                                            <ChevronRight size={12} />
                                                        )}
                                                        {entry.expanded ? (
                                                            <FolderOpen size={14} />
                                                        ) : (
                                                            <Folder size={14} />
                                                        )}
                                                    </>
                                                ) : (
                                                    <FileCode2 size={14} className="ml-4" />
                                                )}
                                                <span className="truncate">{entry.name}</span>
                                                {(entry.path === path
                                                    ? draft != null
                                                    : model.hasFileDraft(entry.path)) && (
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
                {explorerOpen && (
                    <div
                        className="ade-explorer-resizer"
                        role="separator"
                        tabIndex={0}
                        aria-label="Resize file explorer"
                        aria-orientation="vertical"
                        aria-valuemin={140}
                        aria-valuemax={600}
                        aria-valuenow={explorerWidth}
                        onDoubleClick={() => setExplorerWidth(250)}
                        onKeyDown={(event) => {
                            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                            event.preventDefault();
                            setExplorerWidth((width) =>
                                event.key === "Home"
                                    ? 140
                                    : event.key === "End"
                                      ? 600
                                      : Math.max(140, Math.min(600, width + (event.key === "ArrowRight" ? 20 : -20)))
                            );
                        }}
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                            const bounds = event.currentTarget.parentElement.getBoundingClientRect();
                            setExplorerWidth(
                                Math.max(140, Math.min(600, bounds.width * 0.6, event.clientX - bounds.left))
                            );
                        }}
                        onPointerUp={(event) => {
                            if (event.currentTarget.hasPointerCapture(event.pointerId))
                                event.currentTarget.releasePointerCapture(event.pointerId);
                        }}
                    />
                )}
                <div className="ade-code-frame flex min-w-0 flex-1 flex-col">
                    <div
                        className="ade-tabs flex h-10 shrink-0 items-center"
                        hidden={!controlsOpen}
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
                    <div
                        hidden={!controlsOpen}
                        className="ade-breadcrumb flex shrink-0 items-center gap-2 px-3 py-1 text-xs"
                    >
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
                            <button
                                type="button"
                                className="ade-copy-code"
                                aria-label={copied ? "Code copied" : "Copy file contents"}
                                title={copied ? "Code copied" : "Copy file contents"}
                                onClick={async () => {
                                    try {
                                        const content =
                                            draft ??
                                            model.monacoRef?.current?.getValue() ??
                                            (await globalStore.get(model.fileContent));
                                        await navigator.clipboard.writeText(content);
                                        setCopied(true);
                                        clearTimeout(copyTimeout.current);
                                        copyTimeout.current = setTimeout(() => setCopied(false), 2000);
                                    } catch (e) {
                                        setError(`Could not copy file contents: ${String(e)}`);
                                    }
                                }}
                            >
                                <Copy size={16} aria-hidden="true" />
                            </button>
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
            <footer hidden={!controlsOpen} className="ade-status flex h-7 shrink-0 items-center gap-3 px-3 text-[11px]">
                <span>{connection || "Local project"}</span>
                <span className="ade-secondary">
                    {tabs.length} open {tabs.length === 1 ? "file" : "files"}
                </span>
            </footer>
        </div>
    );
}
