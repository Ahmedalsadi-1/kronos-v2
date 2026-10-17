// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { useRef, useState } from "react";
import {
    launchProjectEnvironment,
    planProjectEnvironment,
    ProjectEnvironmentLaunchError,
    type ProjectEnvironmentAdapter,
} from "./project-environment";
import "./project-environment-launcher.scss";

export function ProjectEnvironmentLauncher({
    adapter,
    initialRoot = "~",
    initialConnection = "",
    connections = [],
}: {
    adapter: ProjectEnvironmentAdapter;
    initialRoot?: string;
    initialConnection?: string;
    connections?: string[];
}) {
    const [root, setRoot] = useState(initialRoot);
    const [connection, setConnection] = useState(initialConnection);
    const [url, setUrl] = useState("http://localhost:3000");
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [failed, setFailed] = useState(false);
    const [cleanupBlocked, setCleanupBlocked] = useState(false);
    const launching = useRef(false);
    const hosts = Array.from(new Set([...connections, initialConnection].filter(Boolean)));

    return (
        <form
            className="project-environment-launcher"
            onSubmit={async (event) => {
                event.preventDefault();
                if (launching.current || cleanupBlocked) {
                    return;
                }
                launching.current = true;
                setBusy(true);
                setMessage("");
                setFailed(false);
                try {
                    const plan = planProjectEnvironment({ root, connection, url });
                    await launchProjectEnvironment(plan, adapter);
                    setMessage(
                        "Terminal, browser, and files are ready. Reopening this environment reuses its live widgets."
                    );
                } catch (error) {
                    setFailed(true);
                    setMessage(error instanceof Error ? error.message : String(error));
                    setCleanupBlocked(
                        error instanceof ProjectEnvironmentLaunchError && error.remainingBlockIds.length > 0
                    );
                } finally {
                    launching.current = false;
                    setBusy(false);
                }
            }}
        >
            <strong>Project environment</strong>
            <p>Linked terminal, browser, and files. Runs on your computer or a configured SSH host.</p>
            <label>
                Host
                <select value={connection} disabled={busy} onChange={(event) => setConnection(event.target.value)}>
                    <option value="">This computer</option>
                    {hosts.map((host) => (
                        <option key={host} value={host}>
                            {host}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Project folder
                <input
                    value={root}
                    disabled={busy}
                    onChange={(event) => setRoot(event.target.value)}
                    placeholder="/path/to/project"
                    required
                />
            </label>
            <label>
                Browser URL
                <input
                    value={url}
                    disabled={busy}
                    onChange={(event) => setUrl(event.target.value)}
                    type="url"
                    required
                />
            </label>
            {connection && (
                <p>
                    The terminal and files use {connection}. The browser runs on this computer; use a reachable URL or
                    your existing port forward.
                </p>
            )}
            <button type="submit" disabled={busy || cleanupBlocked}>
                {busy ? "Opening environment…" : "Open environment"}
            </button>
            {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        </form>
    );
}
