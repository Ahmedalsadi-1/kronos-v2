import { FolderInput, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copySandboxArtifacts, type SandboxCodeResult } from "../lib/agent-linux-sandbox";
import { localLinux } from "../lib/local-linux";
import { dispatchMobileVMTool } from "../lib/mobile-vm-tools";

export function LinuxCodeTools({ controlEnabled = true }: { controlEnabled?: boolean }) {
    const [script, setScript] = useState("");
    const [paths, setPaths] = useState("");
    const [result, setResult] = useState<SandboxCodeResult>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [copying, setCopying] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isolated, setIsolated] = useState(false);
    const [resultInUserVM, setResultInUserVM] = useState(false);
    const controller = useRef<AbortController | undefined>(undefined);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            controller.current?.abort();
        };
    }, []);
    const run = async () => {
        if (!controlEnabled) return;
        if (controller.current) return;
        const abort = new AbortController();
        controller.current = abort;
        setBusy(true);
        setResult(undefined);
        setCopied(false);
        setError("");
        try {
            const next = await dispatchMobileVMTool(
                "vm_exec",
                {
                    script,
                    isolated,
                    outputPaths: paths
                        .split("\n")
                        .map((path) => path.trim())
                        .filter(Boolean),
                },
                abort.signal
            );
            if (mounted.current) {
                setResult(next as SandboxCodeResult);
                setResultInUserVM(!isolated);
            }
        } catch (reason) {
            if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            controller.current = undefined;
            if (mounted.current) setBusy(false);
        }
    };
    const copy = async () => {
        if (!controlEnabled || !result || copying) return;
        setCopying(true);
        setError("");
        try {
            await copySandboxArtifacts(result, localLinux);
            await localLinux.save();
            if (mounted.current) setCopied(true);
        } catch (reason) {
            if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
            if (mounted.current) setCopying(false);
        }
    };
    return (
        <div className="linux-tool-pane">
            <p className="linux-pane-note">
                {isolated
                    ? "Disposable phone sandbox · network off · 120 second limit."
                    : "Run commands in your saved phone VM. Commands can change its files and processes."}
            </p>
            <label>
                <select
                    aria-label="Code execution target"
                    value={isolated ? "isolated" : "local"}
                    disabled={busy}
                    onChange={(event) => setIsolated(event.target.value === "isolated")}
                >
                    <option value="local">My phone VM</option>
                    <option value="isolated">Disposable sandbox</option>
                </select>
            </label>
            <label>
                Shell script
                <textarea
                    aria-label="Sandbox script"
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    disabled={busy}
                    placeholder="Write a shell script"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                />
            </label>
            <label>
                Output files <small>One path per line, relative to /mnt</small>
                <textarea
                    aria-label="Sandbox output files"
                    value={paths}
                    onChange={(e) => setPaths(e.target.value)}
                    disabled={busy}
                    placeholder="result.txt"
                />
            </label>
            <div className="linux-tool-buttons">
                <button type="button" disabled={!controlEnabled || busy || !script.trim()} onClick={() => void run()}>
                    <Play /> {isolated ? "Run in sandbox" : "Run in my phone VM"}
                </button>
                {busy && (
                    <button type="button" onClick={() => controller.current?.abort()}>
                        <Square /> Cancel
                    </button>
                )}
            </div>
            {error && (
                <p role="alert" className="local-error">
                    {error}
                </p>
            )}
            {busy && <p role="status">Starting sandbox and running script…</p>}
            {result && (
                <>
                    <p role="status">Exit {result.exitCode}</p>
                    <pre className="linux-tool-output">{result.output || "No output"}</pre>
                    {result.artifacts.map((file) => (
                        <details key={file.path}>
                            <summary>{file.path}</summary>
                            <pre className="linux-tool-output">{file.content}</pre>
                        </details>
                    ))}
                    {resultInUserVM && <p role="status">Saved in your phone VM</p>}
                    {result.artifacts.length > 0 && !resultInUserVM && (
                        <button
                            type="button"
                            disabled={!controlEnabled || result.exitCode !== 0 || copying || copied}
                            onClick={() => void copy()}
                        >
                            <FolderInput />{" "}
                            {copied ? "Copied and saved in VM" : copying ? "Copying…" : "Copy these files into my VM"}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
