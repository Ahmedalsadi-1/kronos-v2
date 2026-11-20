// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { getApi } from "@/store/global";
import { formatRemoteUri } from "@/util/waveutil";
import type { HermesReviewFile } from "@hermes/global";
import { desktopGit } from "@hermes/lib/desktop-git";
import { ChevronRight, Copy, File, Folder, PanelRight, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const parent = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const join = (directory: string, name: string) => directory.replace(/\/$/, "") + "/" + name;
const list = (directory: string) =>
    RpcApi.FileListCommand(TabRpcClient, {
        path: formatRemoteUri(directory, "local"),
        opts: { all: false },
    }).then((entries) =>
        entries
            .filter((entry) => !entry.notfound && !entry.staterror && ![".", ".."].includes(entry.name))
            .sort((a, b) => Number(b.isdir) - Number(a.isdir) || a.name.localeCompare(b.name))
    );

function FolderMenu({
    folder,
    onBrowse,
    onOpen,
}: {
    folder: string;
    onBrowse: (folder: string) => void;
    onOpen: (folder: string, entry: FileInfo) => void;
}) {
    const [entries, setEntries] = useState<FileInfo[]>();
    const [query, setQuery] = useState("");
    const [child, setChild] = useState<string>();
    const [failed, setFailed] = useState(false);
    const level = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const chain = level.current?.closest<HTMLElement>(".pen-files-menu-chain");
        if (chain) chain.scrollLeft = chain.scrollWidth;
    }, [child]);
    const matches = entries?.filter(({ name }) => name.toLowerCase().includes(query.trim().toLowerCase()));

    useEffect(() => {
        let current = true;
        void list(folder).then(
            (rows) => {
                if (current) setEntries(rows);
            },
            () => {
                if (current) setFailed(true);
            }
        );
        return () => {
            current = false;
        };
    }, [folder]);

    return (
        <div className="pen-files-menu-level" ref={level}>
            <section
                className="pen-files-menu"
                aria-label={`Browse ${folder.split("/").filter(Boolean).at(-1) || "/"}`}
            >
                <button type="button" onClick={() => onBrowse(folder)}>
                    Browse this folder
                </button>
                <input
                    type="search"
                    aria-label="Search this folder"
                    placeholder="Search this folder…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
                <div className="pen-files-menu-results">
                    {failed ? (
                        <p role="alert">Could not list this folder.</p>
                    ) : !matches ? (
                        <p role="status">Loading folder…</p>
                    ) : matches.length === 0 ? (
                        <p role="status">{query ? "No matching files." : "This folder is empty."}</p>
                    ) : (
                        matches.map((entry) => {
                            const next = join(folder, entry.name);
                            return (
                                <button
                                    key={entry.name}
                                    type="button"
                                    aria-expanded={entry.isdir ? child === next : undefined}
                                    onClick={() =>
                                        entry.isdir
                                            ? setChild(child === next ? undefined : next)
                                            : onOpen(folder, entry)
                                    }
                                >
                                    {entry.isdir ? <Folder size={15} /> : <File size={15} />}
                                    <span>{entry.name}</span>
                                    {entry.isdir && <ChevronRight size={13} />}
                                </button>
                            );
                        })
                    )}
                </div>
            </section>
            {child && <FolderMenu key={child} folder={child} onBrowse={onBrowse} onOpen={onOpen} />}
        </div>
    );
}

export function OSPenFiles({
    id,
    root,
    path,
    children,
}: {
    id: string;
    root: string;
    path: string;
    children: ReactNode;
}) {
    const [file, setFile] = useState<FileInfo>();
    const [directory, setDirectory] = useState(root);
    const [entries, setEntries] = useState<FileInfo[]>([]);
    const [menu, setMenu] = useState<string>();
    const [browsing, setBrowsing] = useState(false);
    const [changes, setChanges] = useState<HermesReviewFile[]>([]);
    const [change, setChange] = useState<HermesReviewFile>();
    const [diff, setDiff] = useState("");
    const [filter, setFilter] = useState("");
    const [error, setError] = useState("");
    const [tree, setTree] = useState(true);
    const [revision, setRevision] = useState(0);
    const basename = (value: string) => value.split("/").filter(Boolean).at(-1) || value;

    useEffect(() => {
        setDirectory(root);
        setChange(undefined);
        setMenu(undefined);
    }, [root]);

    useEffect(() => {
        let current = true;
        setFile(undefined);
        setBrowsing(false);
        setChange(undefined);
        if (path && path !== root) {
            void RpcApi.FileInfoCommand(TabRpcClient, { info: { path: formatRemoteUri(path, "local") } }).then(
                (info) => {
                    if (!current) return;
                    if (info.notfound || info.staterror) {
                        setError("Could not open this path.");
                        return;
                    }
                    setFile(info);
                    setDirectory(info.isdir ? path : parent(path));
                },
                () => {
                    if (current) setError("Could not open this path.");
                }
            );
        }
        return () => {
            current = false;
        };
    }, [path, root]);

    useEffect(() => {
        let current = true;
        setEntries([]);
        setError("");
        void list(directory).then(
            (rows) => {
                if (current) setEntries(rows);
            },
            () => {
                if (current) setError("Could not list this folder.");
            }
        );
        return () => {
            current = false;
        };
    }, [directory, revision]);

    useEffect(() => {
        let current = true;
        const git = desktopGit()?.review;
        setChanges([]);
        void git?.list(root, "uncommitted", null).then(
            (result) => {
                if (current) setChanges(result.files);
            },
            () => {}
        );
        return () => {
            current = false;
        };
    }, [root, revision]);

    useEffect(() => {
        if (!change) return;
        let current = true;
        setDiff("Loading diff…");
        void desktopGit()
            ?.review?.diff(root, change.path, "uncommitted", null, change.staged)
            .then(
                (patch) => {
                    if (current) setDiff(patch || "No text diff available.");
                },
                () => {
                    if (current) setDiff("Could not load this diff.");
                }
            );
        return () => {
            current = false;
        };
    }, [change, root]);

    const browse = (folder: string) => {
        setDirectory(folder);
        setChange(undefined);
        setMenu(undefined);
        setBrowsing(true);
    };
    const open = (folder: string, entry: FileInfo) => {
        const next = join(folder, entry.name);
        setChange(undefined);
        setMenu(undefined);
        if (entry.isdir) {
            browse(next);
            return;
        }
        if (next === path) {
            setBrowsing(false);
            return;
        }
        void RpcApi.SetMetaCommand(TabRpcClient, { oref: `block:${id}`, meta: { file: next } }).catch(() =>
            setError("Could not open this file.")
        );
    };
    const target = change ? join(root, change.path) : path;
    const prefix = root.replace(/\/$/, "") + "/";
    const isFile = !!change || (!browsing && !!file && !file.isdir);
    const crumbDirectory = isFile ? parent(target) : directory;
    const crumbRoot = crumbDirectory.startsWith("~") ? "~" : "/";
    const relative = crumbDirectory.slice(crumbRoot.replace(/\/$/, "").length).split("/").filter(Boolean);
    const crumbs = [crumbRoot, ...relative.map((_, index) => join(crumbRoot, relative.slice(0, index + 1).join("/")))];
    const matches = (text: string) => text.toLowerCase().includes(filter.trim().toLowerCase());

    const rows = (items: FileInfo[], folder: string) =>
        items.map((entry) => (
            <button
                key={entry.name}
                type="button"
                aria-current={join(folder, entry.name) === target ? "true" : undefined}
                onClick={() => open(folder, entry)}
            >
                {entry.isdir ? <Folder size={15} /> : <File size={15} />}
                <span>{entry.name}</span>
                {entry.isdir && <ChevronRight size={13} />}
            </button>
        ));

    return (
        <div
            className="pen-files"
            onKeyDown={(event) => {
                if (event.key === "Escape") setMenu(undefined);
            }}
        >
            <header>
                <nav aria-label="File path">
                    {crumbs.map((folder) => (
                        <div key={folder} className="pen-files-crumb">
                            <button
                                type="button"
                                aria-expanded={menu === folder}
                                onClick={() => setMenu(menu === folder ? undefined : folder)}
                            >
                                {basename(folder)}
                            </button>
                            <ChevronRight size={13} />
                            {menu === folder && (
                                <div className="pen-files-menu-chain">
                                    <FolderMenu key={folder} folder={folder} onBrowse={browse} onOpen={open} />
                                </div>
                            )}
                        </div>
                    ))}
                    {isFile && <span>{basename(target)}</span>}
                </nav>
                {isFile && (
                    <>
                        <button
                            type="button"
                            title="Copy relative path"
                            aria-label="Copy relative path"
                            onClick={() => {
                                void navigator.clipboard
                                    .writeText(target.startsWith(prefix) ? target.slice(prefix.length) : target)
                                    .catch(() => setError("Could not copy the path."));
                            }}
                        >
                            <Copy size={16} />
                        </button>
                        <button type="button" onClick={() => getApi().revealNativePath(target)}>
                            Reveal file
                        </button>
                    </>
                )}
                <button type="button" aria-label="Refresh files" onClick={() => setRevision(revision + 1)}>
                    <RefreshCw size={15} />
                </button>
                <button type="button" aria-label="Toggle file tree" aria-pressed={tree} onClick={() => setTree(!tree)}>
                    <PanelRight size={16} />
                </button>
            </header>
            {error && <p role="alert">{error}</p>}
            <div className="pen-files-body">
                <main
                    onClick={() => {
                        if (menu) setMenu(undefined);
                    }}
                >
                    {change ? (
                        <pre aria-label="Inline Git diff">
                            {diff.split("\n").map((line, index) => (
                                <span
                                    key={index}
                                    data-diff={
                                        line.startsWith("+") ? "add" : line.startsWith("-") ? "remove" : undefined
                                    }
                                >
                                    {line}
                                    {"\n"}
                                </span>
                            ))}
                        </pre>
                    ) : isFile ? (
                        children
                    ) : (
                        <div className="pen-files-empty">
                            <Folder size={26} />
                            Open file
                        </div>
                    )}
                </main>
                {tree && (
                    <aside aria-label="Workspace files">
                        <input
                            aria-label="Filter files"
                            placeholder="Filter files…"
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                        />
                        {changes.length > 0 && (
                            <details open>
                                <summary>Changed files</summary>
                                {changes
                                    .filter(({ path }) => matches(path))
                                    .map((item) => (
                                        <button
                                            type="button"
                                            key={`${item.path}:${item.staged}`}
                                            title={item.path}
                                            aria-current={change === item ? "true" : undefined}
                                            onClick={() => {
                                                setMenu(undefined);
                                                setChange(item);
                                            }}
                                        >
                                            <File size={15} />
                                            <span>{item.path}</span>
                                            <small>
                                                +{item.added} −{item.removed}
                                            </small>
                                        </button>
                                    ))}
                            </details>
                        )}
                        <details open>
                            <summary>Workspace files</summary>
                            {directory !== "/" && (
                                <button
                                    type="button"
                                    onClick={() => browse(directory === "~" ? "/" : parent(directory))}
                                >
                                    ↑ Parent folder
                                </button>
                            )}
                            {rows(
                                entries.filter(({ name }) => matches(name)),
                                directory
                            )}
                        </details>
                    </aside>
                )}
            </div>
        </div>
    );
}
