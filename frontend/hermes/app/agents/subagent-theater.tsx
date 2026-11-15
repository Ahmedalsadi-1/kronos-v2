import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";

import { Codicon } from "@hermes/components/ui/codicon";
import {
    requestSwarmWorkerStop,
    subscribeSubagentSurface,
    type SubagentSurfaceSnapshot,
} from "@hermes/lib/subagent-surface";
import type { SubagentProgress } from "@hermes/store/subagents";
import "./subagent-theater.css";
import { SwarmRecovery } from "./swarm-recovery";

const StatusLabels = {
    running: "Running",
    queued: "Queued",
    completed: "Done",
    failed: "Failed",
    interrupted: "Stopped",
};

const SwarmOutcomeLabels = { blocked: "Blocked", uncertain: "Uncertain" };

export function SubagentTheater({
    agents,
    initialAgentId,
    onClose,
    onStop,
    showRecovery = false,
    contentClassName,
}: {
    agents: SubagentProgress[];
    initialAgentId?: string;
    onClose: () => void;
    onStop?: (agent: SubagentProgress) => Promise<void>;
    showRecovery?: boolean;
    contentClassName?: string;
}) {
    const [selectedId, setSelectedId] = useState(initialAgentId);
    const [surface, setSurface] = useState<SubagentSurfaceSnapshot & { selectionKey?: string }>({});
    const [stopError, setStopError] = useState("");
    const [stopping, setStopping] = useState(false);
    const feedRef = useRef<HTMLOListElement>(null);
    const followRef = useRef(true);
    const selectedRef = useRef<string>(undefined);
    const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
    const selectionKey = selected ? JSON.stringify([selected.id, selected.sessionId]) : undefined;
    const currentSurface = surface.selectionKey === selectionKey ? surface : {};
    const tool = selected?.currentTool || selected?.lastTool;
    const toolEntry = selected?.stream
        .slice()
        .reverse()
        .find((entry) => entry.kind === "tool");
    const isVisualTool =
        tool &&
        /browser|widget|computer|desktop|device|sandbox|vm_|screenshot/.test(tool) &&
        !/file|patch|edit|write/.test(tool);
    const showImage = currentSurface.imageUrl && (!tool || isVisualTool);
    const running = selected?.status === "running" || selected?.status === "queued";

    const swarm = selected?.swarm != null;
    const canStop = !!selected?.sessionId && (swarm ? selected.status === "running" : running);
    const livePreview = running && (!swarm || canStop) && (!tool || !!isVisualTool);

    useEffect(() => {
        if (selectedRef.current !== selectionKey) setSurface({});
        selectedRef.current = selectionKey;
        setStopError("");
        setStopping(false);
    }, [selectionKey]);

    useEffect(() => {
        followRef.current = true;
        if (!selected) return;
        return subscribeSubagentSurface(
            { id: selected.id, sessionId: selected.sessionId, live: livePreview, swarm },
            (snapshot) =>
                setSurface((current) => ({
                    ...snapshot,
                    imageUrl:
                        snapshot.imageUrl ??
                        (!running &&
                        !snapshot.captureError &&
                        snapshot.targetKey &&
                        snapshot.targetKey === current.targetKey &&
                        current.selectionKey === selectionKey
                            ? current.imageUrl
                            : undefined),
                    selectionKey,
                }))
        );
    }, [selected?.id, selected?.sessionId, running, livePreview, swarm, selectionKey]);

    useEffect(() => {
        const feed = feedRef.current;
        if (feed && followRef.current) feed.scrollTop = feed.scrollHeight;
    }, [selected?.id, selected?.stream]);

    const stop = async () => {
        if (!canStop || stopping) return;
        const stoppingKey = selectionKey;
        setStopping(true);
        setStopError("");
        try {
            if (onStop) {
                await onStop(selected);
            } else if (swarm) {
                await requestSwarmWorkerStop(selected.sessionId);
            } else {
                const { activeGateway } = await import("@hermes/store/gateway");
                const gateway = activeGateway();
                if (!gateway) throw new Error("Agent connection unavailable.");
                await gateway.request("session.interrupt", { session_id: selected.sessionId });
            }
        } catch (error) {
            if (selectedRef.current === stoppingKey) {
                setStopError(error instanceof Error ? error.message : "Could not stop this agent.");
            }
        } finally {
            if (selectedRef.current === stoppingKey) setStopping(false);
        }
    };

    return (
        <Dialog.Root
            open
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay className="subagent-theater-backdrop" />
                <Dialog.Content className={["subagent-theater", contentClassName].filter(Boolean).join(" ")} aria-describedby="subagent-theater-description">
                    <header className="subagent-theater-header">
                        <Dialog.Title>Subagents</Dialog.Title>
                        <div className="subagent-theater-controls">
                            {canStop && (
                                <button
                                    type="button"
                                    className="subagent-theater-stop"
                                    disabled={stopping}
                                    onClick={() => void stop()}
                                >
                                    <Codicon name="debug-stop" />
                                    {stopping ? "Stopping…" : "Stop agent"}
                                </button>
                            )}
                            <Dialog.Close className="subagent-theater-icon-button" aria-label="Close subagents">
                                <Codicon name="close" size={16} />
                            </Dialog.Close>
                        </div>
                    </header>
                    {stopError && (
                        <p role="alert" className="subagent-theater-error">
                            {stopError}
                        </p>
                    )}
                    <Dialog.Description id="subagent-theater-description" className="sr-only">
                        Watch agent activity. Closing this view keeps agents running.
                    </Dialog.Description>
                    {showRecovery && (
                        <SwarmRecovery
                            uncertainCount={agents.filter((agent) => agent.swarm?.outcome === "uncertain").length}
                        />
                    )}
                    {selected ? (
                        <>
                            <div className="subagent-theater-tabs" role="tablist" aria-label="Subagents">
                                {agents.map((agent, index) => (
                                    <button
                                        key={agent.id}
                                        type="button"
                                        role="tab"
                                        id={`subagent-tab-${index}`}
                                        aria-controls="subagent-theater-panel"
                                        aria-selected={agent.id === selected.id}
                                        tabIndex={agent.id === selected.id ? 0 : -1}
                                        onClick={() => setSelectedId(agent.id)}
                                        onKeyDown={(event) => {
                                            let next: number;
                                            if (event.key === "ArrowRight") next = (index + 1) % agents.length;
                                            else if (event.key === "ArrowLeft")
                                                next = (index + agents.length - 1) % agents.length;
                                            else if (event.key === "Home") next = 0;
                                            else if (event.key === "End") next = agents.length - 1;
                                            else return;
                                            event.preventDefault();
                                            setSelectedId(agents[next].id);
                                            event.currentTarget.parentElement
                                                .querySelectorAll<HTMLButtonElement>('[role="tab"]')
                                                [next]?.focus();
                                        }}
                                    >
                                        <span className="subagent-theater-tab-title">{agent.goal}</span>
                                        <span className="subagent-theater-status" data-status={agent.status}>
                                            {agent.swarm?.outcome
                                                ? SwarmOutcomeLabels[agent.swarm.outcome]
                                                : StatusLabels[agent.status]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div
                                className="subagent-theater-body"
                                role="tabpanel"
                                id="subagent-theater-panel"
                                aria-labelledby={`subagent-tab-${agents.indexOf(selected)}`}
                            >
                                <section className="subagent-theater-surface" aria-label="Selected agent surface">
                                    {showImage ? (
                                        <>
                                            <div className="subagent-theater-surface-label">
                                                <Codicon name="preview" />
                                                {currentSurface.title || "Agent surface"}
                                                <span>{running ? "Live snapshots" : "Last captured surface"}</span>
                                            </div>
                                            <div className="subagent-theater-image">
                                                <img
                                                    src={currentSurface.imageUrl}
                                                    alt={`${currentSurface.title || "Selected agent"} live surface`}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="subagent-theater-tool-context" aria-label="Selected agent tool">
                                            <div className="subagent-theater-tool-heading">
                                                <Codicon
                                                    name={selected.filesWritten.length ? "edit" : "tools"}
                                                    size={22}
                                                />
                                                <div>
                                                    <span>{running ? "Current activity" : "Last activity"}</span>
                                                    <h3>
                                                        {tool?.replace(/_/g, " ") ||
                                                            currentSurface.title ||
                                                            (running ? "Agent working" : "Agent finished")}
                                                    </h3>
                                                </div>
                                            </div>
                                            {(currentSurface.captureError ||
                                                (isVisualTool && !currentSurface.imageUrl)) && (
                                                <p className="subagent-theater-capture-status" role="status">
                                                    {currentSurface.captureError ||
                                                        "Surface snapshots will appear here when available."}
                                                </p>
                                            )}
                                            {currentSurface.filepath && (
                                                <p className="subagent-theater-tool-path">{currentSurface.filepath}</p>
                                            )}
                                            <pre className="subagent-theater-tool-preview">
                                                {selected.toolPreview ||
                                                    toolEntry?.text ||
                                                    currentSurface.detail ||
                                                    selected.summary ||
                                                    selected.goal}
                                            </pre>
                                            {selected.inlineDiff && (
                                                <pre className="subagent-theater-tool-diff" aria-label="File changes">
                                                    {selected.inlineDiff}
                                                </pre>
                                            )}
                                            {(selected.filesWritten.length > 0 || selected.filesRead.length > 0) && (
                                                <div className="subagent-theater-tool-files">
                                                    {selected.filesWritten.length > 0 && (
                                                        <section aria-label="Files changed">
                                                            <h4>Files changed</h4>
                                                            <ul>
                                                                {selected.filesWritten.map((path) => (
                                                                    <li key={path}>{path}</li>
                                                                ))}
                                                            </ul>
                                                        </section>
                                                    )}
                                                    {selected.filesRead.length > 0 && (
                                                        <section aria-label="Files read">
                                                            <h4>Files read</h4>
                                                            <ul>
                                                                {selected.filesRead.map((path) => (
                                                                    <li key={path}>{path}</li>
                                                                ))}
                                                            </ul>
                                                        </section>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </section>
                                <ol
                                    className="subagent-theater-feed"
                                    aria-label="Agent activity"
                                    ref={feedRef}
                                    onScroll={(event) => {
                                        const feed = event.currentTarget;
                                        followRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
                                    }}
                                >
                                    {selected.stream.length === 0 && (
                                        <li className="subagent-theater-feed-empty">
                                            {running ? "Waiting…" : "No activity."}
                                        </li>
                                    )}
                                    {selected.stream.map((entry, index) => (
                                        <li
                                            key={`${entry.at}:${entry.kind}:${index}`}
                                            data-error={entry.isError || undefined}
                                        >
                                            <Codicon
                                                name={
                                                    entry.isError
                                                        ? "error"
                                                        : entry.kind === "tool"
                                                          ? "tools"
                                                          : entry.kind === "summary"
                                                            ? "pass"
                                                            : "circle-filled"
                                                }
                                                size={15}
                                            />
                                            <details>
                                                <summary className="subagent-theater-entry-heading">
                                                    <span title={entry.text}>{entry.text.split("\n")[0]}</span>
                                                    <time>
                                                        {new Date(entry.at).toLocaleTimeString([], {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </time>
                                                </summary>
                                                <p>{entry.text}</p>
                                            </details>
                                        </li>
                                    ))}
                                    {running && selected.currentTool && (
                                        <li className="subagent-theater-active">
                                            <Codicon name="loading" className="subagent-theater-spinner" />
                                            <div>
                                                <strong>{selected.currentTool.replace(/_/g, " ")}</strong>
                                            </div>
                                        </li>
                                    )}
                                </ol>
                            </div>
                        </>
                    ) : (
                        <div className="subagent-theater-empty">
                            <Codicon name="agent" size={28} />
                            <h3>No subagents yet</h3>
                            <p>Delegated agents will appear here with their activity and connected surfaces.</p>
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
