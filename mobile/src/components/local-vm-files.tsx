import { ArrowLeft, Download, FileCode2, FilePlus2, Folder, RefreshCw, Save, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { localLinux } from "../lib/local-linux";
import { safeGuestPath, type LocalLinuxEntry } from "../lib/local-linux-protocol";
import "./local-vm-files.css";

export function LocalVMFiles({
    active,
    controlEnabled,
    editor = false,
}: {
    active: boolean;
    controlEnabled: boolean;
    editor?: boolean;
}) {
    const [directory, setDirectory] = useState("");
    const [entries, setEntries] = useState<LocalLinuxEntry[]>([]);
    const [selected, setSelected] = useState("");
    const [content, setContent] = useState("");
    const [savedContent, setSavedContent] = useState("");
    const [query, setQuery] = useState("");
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const revision = useRef(0);
    const dirty = content !== savedContent;
    const refresh = async (path = directory) => {
        const request = ++revision.current;
        setError("");
        try {
            const next = await localLinux.listFiles(path);
            if (request === revision.current) setEntries(next);
        } catch (reason) {
            if (request === revision.current) setError(reason instanceof Error ? reason.message : String(reason));
        }
    };
    useEffect(() => {
        if (!active) return;
        void refresh();
        const timer = setInterval(() => {
            if (!document.hidden) void refresh();
        }, 4000);
        return () => {
            clearInterval(timer);
            revision.current++;
        };
    }, [active, directory]);
    const open = async (entry: LocalLinuxEntry) => {
        if (dirty) {
            setError("Save or discard your edits before opening another file.");
            return;
        }
        if (entry.kind === "directory") {
            setDirectory(entry.path);
            setSelected("");
            return;
        }
        setBusy(true);
        setError("");
        setMessage("");
        try {
            const text = await localLinux.readFile(entry.path);
            setSelected(entry.path);
            setContent(text);
            setSavedContent(text);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };
    const save = async () => {
        if (!controlEnabled || busy || !selected) return;
        if (new TextEncoder().encode(content).length > 1_000_000) {
            setError("Keep text files below 1 MB.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await localLinux.writeFiles([{ path: selected, content }]);
            setSavedContent(content);
            await localLinux.save();
            setMessage("Saved to your VM");
            await refresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };
    const create = async () => {
        const path = directory ? `${directory}/${newName.trim()}` : newName.trim();
        if (!controlEnabled || busy || dirty) return;
        if (!safeGuestPath(path) || newName.includes("/") || newName.startsWith(".kron-")) {
            setError("Enter a filename without slashes.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const current = await localLinux.listFiles(directory);
            if (current.some((entry) => entry.path === path)) throw new Error("A file with that name already exists.");
            await localLinux.writeFiles([{ path, content: "" }]);
            await localLinux.save();
            setSelected(path);
            setContent("");
            setSavedContent("");
            setCreating(false);
            setNewName("");
            await refresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };
    const download = () => {
        const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = selected.split("/").pop()!;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
        <div className={`vm-file-center ${editor ? "is-editor" : ""}`}>
            <div className="vm-files-toolbar">
                <button
                    type="button"
                    aria-label="Parent folder"
                    disabled={!directory || dirty}
                    onClick={() => {
                        setDirectory(directory.split("/").slice(0, -1).join("/"));
                        setSelected("");
                    }}
                >
                    <ArrowLeft size={18} />
                </button>
                <span className="vm-files-path">/mnt{directory ? `/${directory}` : ""}</span>
                <button type="button" aria-label="Refresh files" onClick={() => void refresh()}>
                    <RefreshCw size={18} />
                </button>
                <button
                    type="button"
                    aria-label="New file"
                    disabled={!controlEnabled || busy || dirty}
                    onClick={() => setCreating(!creating)}
                >
                    <FilePlus2 size={18} />
                </button>
            </div>
            <label className="vm-files-search">
                <Search size={16} />
                <input
                    aria-label="Search files"
                    placeholder="Search this folder"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </label>
            {creating && (
                <form
                    className="vm-files-create"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void create();
                    }}
                >
                    <input
                        autoFocus
                        aria-label="New filename"
                        placeholder="notes.md"
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                    />
                    <button disabled={busy || !newName.trim()} type="submit">
                        Create
                    </button>
                </form>
            )}
            {error && (
                <p className="vm-files-error" role="alert">
                    {error}
                </p>
            )}
            {message && (
                <p className="vm-files-message" role="status">
                    {message}
                </p>
            )}
            <div className="vm-files-layout">
                <div className="vm-files-list" aria-label="VM files">
                    {entries
                        .filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase()))
                        .map((entry) => (
                            <button
                                key={entry.path}
                                type="button"
                                className={selected === entry.path ? "is-selected" : ""}
                                disabled={busy || entry.kind === "other"}
                                onClick={() => void open(entry)}
                            >
                                {entry.kind === "directory" ? <Folder size={19} /> : <FileCode2 size={19} />}
                                <span>{entry.name}</span>
                                <small>
                                    {entry.kind === "directory" ? "Folder" : `${entry.size.toLocaleString()} B`}
                                </small>
                            </button>
                        ))}
                    {!entries.length && <p className="vm-files-empty">No files in this folder yet.</p>}
                </div>
                <div className="vm-files-editor">
                    {selected ? (
                        <>
                            <div className="vm-editor-toolbar">
                                <span>
                                    {selected.split("/").pop()}
                                    {dirty ? " •" : ""}
                                </span>
                                <button type="button" aria-label="Download file" onClick={download}>
                                    <Download size={17} />
                                </button>
                                <button
                                    type="button"
                                    disabled={!controlEnabled || busy || !dirty}
                                    onClick={() => void save()}
                                >
                                    <Save size={17} />
                                    Save
                                </button>
                                {dirty && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setContent(savedContent);
                                            setError("");
                                        }}
                                    >
                                        Discard edits
                                    </button>
                                )}
                            </div>
                            <textarea
                                aria-label={`Edit ${selected}`}
                                readOnly={!controlEnabled || busy}
                                spellCheck={false}
                                autoCapitalize="off"
                                autoCorrect="off"
                                value={content}
                                onChange={(event) => {
                                    setContent(event.target.value);
                                    setMessage("");
                                }}
                            />
                        </>
                    ) : (
                        <p className="vm-files-empty">
                            Select a file to read or edit.
                            <br />
                            Agent-created files appear here.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
