import { ArrowLeft, ArrowUp, Code2, FileText, Folder, LoaderCircle, Monitor, TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { loadLocalWorkspace, saveLocalWorkspace, updateWorkspaceFile } from "../lib/kron-local-workspace";
import {
    cleanTerminalOutput,
    getLocalShellStatus,
    isKronosCodeCommand,
    runNativeLocalCommand,
    type LocalShellStatus,
} from "../lib/local-shell";

interface LocalToolsProps {
    blocked: boolean;
    onBack: () => void;
    onRemoteShell: () => Promise<void>;
}

const LocalTabs = [
    { id: "files", label: "Files", icon: Folder },
    { id: "code", label: "Editor", icon: Code2 },
    { id: "terminal", label: "iPhone shell", icon: TerminalSquare },
    { id: "preview", label: "HTML preview", icon: Monitor },
] as const;

export function LocalTools({ blocked, onBack, onRemoteShell }: LocalToolsProps) {
    const [workspace, setWorkspace] = useState(loadLocalWorkspace);
    const [tab, setTab] = useState<string>("files");
    const [selectedPath, setSelectedPath] = useState(workspace.files[0]?.path);
    const [shell, setShell] = useState<LocalShellStatus | null>();
    const [command, setCommand] = useState("");
    const [lines, setLines] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const submitting = useRef(false);
    useEffect(() => {
        try {
            saveLocalWorkspace(workspace);
        } catch {
            setError("Could not save your files. Keep this screen open and copy your changes.");
        }
    }, [workspace]);
    useEffect(() => {
        let disposed = false;
        void getLocalShellStatus().then((value) => {
            if (!disposed) setShell(value);
        });
        return () => {
            disposed = true;
        };
    }, []);
    const selected = workspace.files.find((file) => file.path === selectedPath) ?? workspace.files[0];
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        const input = command.trim();
        if (!input || submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        try {
            if (isKronosCodeCommand(input)) {
                await onRemoteShell();
                return;
            }
            if (input === "clear") {
                setLines([]);
                setCommand("");
                return;
            }
            const result = await runNativeLocalCommand(input);
            if (!result)
                throw new Error(
                    "The native iPhone shell is unavailable here. Open a connected terminal to run commands."
                );
            setLines((previous) =>
                [
                    ...previous,
                    `$ ${input}`,
                    ...cleanTerminalOutput(result.output),
                    ...(result.exitCode ? [`Exit status ${result.exitCode}`] : []),
                ].slice(-1500)
            );
            setShell((previous) => (previous ? { ...previous, cwd: result.cwd } : previous));
            setCommand("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            submitting.current = false;
            setBusy(false);
        }
    };
    return (
        <section className="local-tools" aria-label="Local tools" inert={blocked}>
            <header className="mobile-workspace-header">
                <button type="button" aria-label="Back to workspace" onClick={onBack}>
                    <ArrowLeft />
                </button>
                <strong>
                    On this iPhone <small>Labs</small>
                </strong>
                <span className="local-header-spacer" />
            </header>
            <nav className="workspace-filters" aria-label="Local tools">
                {LocalTabs.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        aria-label={label}
                        title={label}
                        aria-pressed={tab === id}
                        onClick={() => setTab(id)}
                    >
                        <Icon />
                    </button>
                ))}
            </nav>
            {error && (
                <p className="local-error" role="alert">
                    {error}
                </p>
            )}
            {tab === "files" && (
                <div className="local-file-list">
                    <p>App-saved workspace files</p>
                    {workspace.files.map((file) => (
                        <button
                            key={file.path}
                            type="button"
                            onClick={() => {
                                setSelectedPath(file.path);
                                setTab("code");
                            }}
                        >
                            <FileText />
                            <span>{file.path}</span>
                            <small>{file.language}</small>
                        </button>
                    ))}
                    {!workspace.files.length && <p>No files saved yet.</p>}
                </div>
            )}
            {tab === "code" && selected && (
                <div className="local-editor">
                    <label htmlFor="local-file-editor">{selected.path}</label>
                    <textarea
                        id="local-file-editor"
                        aria-label={`Edit ${selected.path}`}
                        spellCheck={false}
                        value={selected.content}
                        onChange={(event) =>
                            setWorkspace((previous) => updateWorkspaceFile(previous, selected.path, event.target.value))
                        }
                    />
                    <small>Saved in app storage. These files are not synced to the shell yet.</small>
                </div>
            )}
            {tab === "preview" && (
                <div className="local-preview">
                    <iframe
                        title="Local HTML preview"
                        srcDoc={
                            workspace.files.find((file) => file.path === "index.html")?.content ??
                            "<p>No index.html file saved.</p>"
                        }
                        sandbox="allow-scripts"
                    />
                </div>
            )}
            {tab === "terminal" && (
                <div className="local-shell">
                    <p role="status">
                        {shell == null
                            ? "Native shell unavailable in this view"
                            : shell.available
                              ? shell.cwd
                              : "Native shell unavailable"}
                    </p>
                    <button
                        className="local-remote-shell"
                        type="button"
                        disabled={busy}
                        onClick={() => void onRemoteShell().catch((reason) => setError(String(reason)))}
                    >
                        Open connected KronosCode terminal
                    </button>
                    <pre role="log" aria-label="Shell output">
                        {lines.join("\n") || "No commands run."}
                    </pre>
                    <form onSubmit={(event) => void submit(event)}>
                        <span>$</span>
                        <input
                            aria-label="iPhone shell command"
                            value={command}
                            onChange={(event) => setCommand(event.target.value)}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            disabled={busy || !shell?.available}
                        />
                        <button
                            type="submit"
                            aria-label="Run shell command"
                            disabled={busy || !command.trim() || !shell?.available}
                        >
                            {busy ? <LoaderCircle className="spin" /> : <ArrowUp />}
                        </button>
                    </form>
                </div>
            )}
        </section>
    );
}
