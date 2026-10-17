import {
    ArrowLeft,
    ArrowUp,
    Code2,
    Folder,
    FolderInput,
    Globe,
    LoaderCircle,
    Monitor,
    Pause,
    Play,
    Save,
    TerminalSquare,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { loadLocalWorkspace } from "../lib/kron-local-workspace";
import { pauseLocalAgentForTakeover } from "../lib/local-agent-control";
import { localLinux } from "../lib/local-linux";
import { handleWidgetDialogKey } from "../lib/widget-dialog-keys";
import { LinuxCodeTools } from "./linux-code-tools";
import { LinuxDesktop } from "./linux-desktop";
import { LocalVMFiles } from "./local-vm-files";
import { PhoneBrowser } from "./phone-browser";
import { SessionTimeline } from "./session-timeline";

export function LocalLinuxPanel({
    onBack,
    open = true,
    foreground = true,
    initialTab = "terminal",
    initialBrowserPageId,
    onAgent,
    onResumeAgent,
}: {
    onBack: () => void;
    open?: boolean;
    foreground?: boolean;
    initialTab?: string;
    initialBrowserPageId?: string;
    onAgent?: () => void;
    onResumeAgent?: (note: string) => void;
}) {
    const state = useSyncExternalStore(localLinux.subscribe, localLinux.getSnapshot);
    const [command, setCommand] = useState("");
    const [path, setPath] = useState("index.html");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState("terminal");
    useEffect(() => {
        if (open) setTab(initialTab);
    }, [open, initialTab]);
    const [preview, setPreview] = useState("");
    const [takeover, setTakeover] = useState(false);
    const [handoffOpen, setHandoffOpen] = useState(false);
    const [handoffNote, setHandoffNote] = useState("");
    useEffect(() => {
        setTakeover(false);
        setHandoffOpen(false);
    }, [open, initialTab]);
    const commandRef = useRef<HTMLInputElement>(null);
    const outputRef = useRef<HTMLPreElement>(null);
    const nearBottom = useRef(true);
    useEffect(() => {
        if (nearBottom.current && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }, [state.output]);
    const action = async (perform: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await perform();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            setBusy(false);
        }
    };
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!command.trim()) return;
        void action(async () => {
            await localLinux.input(`${command}\n`);
            setCommand("");
        });
    };
    const importFiles = () =>
        action(async () => {
            const workspace = loadLocalWorkspace();
            await localLinux.writeFiles(workspace.files);
            await localLinux.save();
        });
    return (
        <section className="local-linux-panel" aria-label="Local Linux sandbox" hidden={!open} inert={!open}>
            <header className="mobile-workspace-header">
                <button type="button" aria-label="Back to workspace" onClick={onBack}>
                    <ArrowLeft />
                </button>
                <strong>
                    <TerminalSquare aria-hidden="true" /> Local Linux <small>Labs</small>
                </strong>
                <button
                    type="button"
                    aria-label="Save Linux checkpoint"
                    disabled={busy || !state.ready}
                    onClick={() => void action(() => localLinux.save())}
                >
                    <Save />
                </button>
                {onAgent && (
                    <button type="button" onClick={onAgent} aria-label="Return to agent">
                        Chat
                    </button>
                )}
            </header>
            <div className="linux-browser-tabs" role="tablist" aria-label="Linux workspace tabs">
                {[
                    { id: "terminal", label: "Terminal", icon: TerminalSquare },
                    { id: "desktop", label: "Desktop", icon: Monitor },
                    { id: "browser", label: "Browser", icon: Globe },
                    { id: "files", label: "Files", icon: Folder },
                    { id: "sandbox", label: "Code", icon: Code2 },
                ].map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        id={`linux-tab-${id}`}
                        aria-controls={`linux-pane-${id}`}
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                    >
                        <Icon />
                        {label}
                    </button>
                ))}
            </div>
            <div className="local-linux-status" role="status">
                <span>
                    {state.phase === "starting"
                        ? "Booting Linux on this device…"
                        : state.phase === "running"
                          ? "Running on this device"
                          : state.phase === "paused"
                            ? "Paused on this device"
                            : state.phase === "failed"
                              ? "Could not start Local Linux"
                              : "Local Linux"}
                </span>
                <small>
                    {tab === "browser" ? "Web networking on" : `${tab === "desktop" ? "128" : "64"} MB · Network off`}
                </small>
            </div>
            {(error || state.error) && (
                <p className="local-error" role="alert">
                    {error || state.error}
                </p>
            )}
            {state.phase === "failed" && (
                <button
                    className="local-remote-shell"
                    type="button"
                    disabled={busy}
                    onClick={() => void action(() => localLinux.start())}
                >
                    Retry Local Linux
                </button>
            )}
            <div
                className="linux-tab-content"
                role="tabpanel"
                id="linux-pane-terminal"
                aria-labelledby="linux-tab-terminal"
                hidden={tab !== "terminal"}
            >
                <pre
                    ref={outputRef}
                    className="local-linux-output"
                    aria-label="Linux console"
                    onScroll={() => {
                        const node = outputRef.current!;
                        nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
                    }}
                >
                    {state.output || "Starting the bundled Linux guest…"}
                </pre>
                {takeover && (
                    <div className="terminal-keyboard-tools" role="toolbar" aria-label="Terminal keyboard tools">
                        {[
                            { label: "Tab", text: "\t" },
                            { label: "Esc", text: "\x1b" },
                            { label: "Ctrl-C", text: "\x03" },
                            { label: "↑", text: "\x1b[A" },
                            { label: "↓", text: "\x1b[B" },
                        ].map(({ label, text }) => (
                            <button
                                key={label}
                                type="button"
                                disabled={busy || !state.ready || state.phase !== "running"}
                                onPointerDown={(event) => event.preventDefault()}
                                onClick={() => void action(() => localLinux.input(text))}
                            >
                                {label}
                            </button>
                        ))}
                        <button type="button" onClick={() => commandRef.current?.focus()}>
                            Keyboard
                        </button>
                    </div>
                )}
                <form className="local-linux-composer" onSubmit={submit}>
                    <span>$</span>
                    <input
                        ref={commandRef}
                        enterKeyHint="send"
                        aria-label="Linux command"
                        placeholder={state.ready ? "Linux command" : "Waiting for Linux"}
                        value={command}
                        onChange={(event) => setCommand(event.target.value)}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        disabled={busy || !state.ready || state.phase !== "running" || !takeover}
                    />
                    <button
                        type="submit"
                        aria-label="Send Linux command"
                        disabled={busy || !command.trim() || state.phase !== "running" || !takeover}
                    >
                        {busy ? <LoaderCircle className="spin" /> : <ArrowUp />}
                    </button>
                </form>
                <div className="local-linux-actions">
                    <button
                        type="button"
                        aria-label={state.phase === "paused" ? "Resume Linux" : "Pause Linux"}
                        disabled={busy || !takeover || state.phase === "failed" || state.phase === "idle"}
                        onClick={() =>
                            void action(() => (state.phase === "paused" ? localLinux.resume() : localLinux.pause()))
                        }
                    >
                        {state.phase === "paused" ? <Play /> : <Pause />}
                    </button>
                    <button
                        type="button"
                        aria-label="Send Ctrl-C to Linux"
                        disabled={!state.ready || busy || state.phase !== "running" || !takeover}
                        onClick={() => void action(() => localLinux.input("\x03"))}
                    >
                        Ctrl-C
                    </button>
                    <button
                        type="button"
                        aria-label="Import workspace files into Linux"
                        disabled={!state.ready || busy || !takeover}
                        onClick={() => void importFiles()}
                    >
                        <FolderInput />
                    </button>
                </div>
            </div>
            <div
                className="linux-tab-content linux-tool-pane"
                role="tabpanel"
                id="linux-pane-desktop"
                aria-labelledby="linux-tab-desktop"
                hidden={tab !== "desktop"}
            >
                <LinuxDesktop active={open && foreground && tab === "desktop"} controlEnabled={takeover} />
            </div>
            <div
                className="linux-tab-content linux-tool-pane"
                role="tabpanel"
                id="linux-pane-browser"
                aria-labelledby="linux-tab-browser"
                hidden={tab !== "browser"}
            >
                <PhoneBrowser
                    active={open && tab === "browser"}
                    requestedPageId={initialBrowserPageId}
                    controlEnabled={takeover}
                />
                <p className="linux-pane-note">
                    Open a static HTML preview from /mnt in an isolated frame. Scripts are disabled.
                </p>
                <label>
                    HTML path
                    <input value={path} aria-label="HTML preview path" onChange={(e) => setPath(e.target.value)} />
                </label>
                <button
                    type="button"
                    disabled={!state.ready || busy}
                    onClick={() => void action(async () => setPreview(await localLinux.readFile(path)))}
                >
                    Open preview
                </button>
                {preview && (
                    <iframe
                        title="Linux HTML preview"
                        sandbox=""
                        referrerPolicy="no-referrer"
                        srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">${preview}`}
                    />
                )}
            </div>
            <div
                className="linux-tab-content"
                role="tabpanel"
                id={tab === "sandbox" ? "linux-pane-sandbox" : "linux-pane-files"}
                aria-labelledby={tab === "sandbox" ? "linux-tab-sandbox" : "linux-tab-files"}
                hidden={tab !== "files" && tab !== "sandbox"}
            >
                <LocalVMFiles
                    active={open && ["files", "sandbox"].includes(tab) && state.ready}
                    controlEnabled={takeover}
                    editor={tab === "sandbox"}
                />
                <div hidden={tab !== "files"} className="linux-tool-pane">
                    <button
                        type="button"
                        disabled={!state.ready || busy || !takeover}
                        onClick={() => void importFiles()}
                    >
                        <FolderInput /> Copy workspace files into VM
                    </button>
                </div>
                <details hidden={tab !== "sandbox"} className="local-code-runner">
                    <summary>Run a script</summary>
                    <LinuxCodeTools controlEnabled={takeover} />
                </details>
            </div>
            <SessionTimeline />
            {["terminal", "browser", "desktop", "files", "sandbox"].includes(tab) && (
                <div className="local-widget-control-bar">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            if (takeover) {
                                setTakeover(false);
                                setHandoffNote("");
                                setHandoffOpen(true);
                                return;
                            }
                            void action(async () => {
                                await pauseLocalAgentForTakeover();
                                await localLinux.resume();
                                setTakeover(true);
                                requestAnimationFrame(() => commandRef.current?.focus());
                            });
                        }}
                    >
                        {takeover ? "Exit takeover" : "Take control"}
                    </button>
                </div>
            )}
            {handoffOpen && (
                <div className="widget-handoff-backdrop">
                    <form
                        className="widget-handoff"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Tell the agent what you changed"
                        onKeyDown={(event) => handleWidgetDialogKey(event, () => setHandoffOpen(false))}
                        onSubmit={(event) => {
                            event.preventDefault();
                            setHandoffOpen(false);
                            onResumeAgent?.(handoffNote);
                        }}
                    >
                        <button
                            type="button"
                            className="widget-handoff-close"
                            aria-label="Close handoff"
                            onClick={() => setHandoffOpen(false)}
                        >
                            ×
                        </button>
                        <h2>Tell the agent what you changed</h2>
                        <p>Describe what you did so it can continue from here.</p>
                        <textarea
                            autoFocus
                            aria-label="Local takeover handoff note"
                            value={handoffNote}
                            onChange={(event) => setHandoffNote(event.target.value)}
                            placeholder="I opened the file and updated the settings."
                        />
                        <button type="submit">Send and continue</button>
                    </form>
                </div>
            )}
        </section>
    );
}
