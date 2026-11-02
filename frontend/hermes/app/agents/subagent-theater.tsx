import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";

import { Codicon } from "@hermes/components/ui/codicon";
import { subscribeSubagentSurface, type SubagentSurfaceSnapshot } from "@hermes/lib/subagent-surface";
import type { SubagentProgress } from "@hermes/store/subagents";
import "./subagent-theater.css";

const StatusLabels = {
    running: "Running",
    queued: "Queued",
    completed: "Done",
    failed: "Failed",
    interrupted: "Stopped",
};

export function SubagentTheater({
    agents,
    initialAgentId,
    onClose,
    onStop,
}: {
    agents: SubagentProgress[];
    initialAgentId?: string;
    onClose: () => void;
    onStop?: (agent: SubagentProgress) => Promise<void>;
}) {
    const [selectedId, setSelectedId] = useState(initialAgentId);
    const [surface, setSurface] = useState<SubagentSurfaceSnapshot & { agentId?: string }>({});
    const [stopError, setStopError] = useState("");
    const [stopping, setStopping] = useState(false);
    const feedRef = useRef<HTMLOListElement>(null);
    const followRef = useRef(true);
    const selectedRef = useRef<string>(undefined);
    const selected = agents.find((agent) => agent.id === selectedId) ?? agents[0];
    const currentSurface = surface.agentId === selected?.id ? surface : {};
    const running = selected?.status === "running" || selected?.status === "queued";

    useEffect(() => {
        if (selectedRef.current !== selected?.id) setSurface({});
        selectedRef.current = selected?.id;
        setStopError("");
        setStopping(false);
        followRef.current = true;
        if (!selected) return;
        return subscribeSubagentSurface({ id: selected.id, sessionId: selected.sessionId, live: running }, (snapshot) =>
            setSurface((current) => ({
                ...snapshot,
                imageUrl:
                    snapshot.imageUrl ?? (!running && current.agentId === selected.id ? current.imageUrl : undefined),
                agentId: selected.id,
            }))
        );
    }, [selected?.id, selected?.sessionId, running]);

    useEffect(() => {
        const feed = feedRef.current;
        if (feed && followRef.current) feed.scrollTop = feed.scrollHeight;
    }, [selected?.id, selected?.stream]);

    const stop = async () => {
        if (!selected?.sessionId || stopping) return;
        const stoppingId = selected.id;
        setStopping(true);
        setStopError("");
        try {
            if (onStop) {
                await onStop(selected);
            } else {
                const { activeGateway } = await import("@hermes/store/gateway");
                const gateway = activeGateway();
                if (!gateway) throw new Error("Agent connection unavailable.");
                await gateway.request("session.interrupt", { session_id: selected.sessionId });
            }
        } catch (error) {
            if (selectedRef.current === stoppingId) {
                setStopError(error instanceof Error ? error.message : "Could not stop this agent.");
            }
        } finally {
            if (selectedRef.current === stoppingId) setStopping(false);
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
                <Dialog.Content className="subagent-theater" aria-describedby="subagent-theater-description">
                    <header className="subagent-theater-header">
                        <Dialog.Title>Subagents</Dialog.Title>
                        <Dialog.Close className="subagent-theater-icon-button" aria-label="Close subagents">
                            <Codicon name="close" size={16} />
                        </Dialog.Close>
                    </header>
                    <Dialog.Description id="subagent-theater-description" className="sr-only">
                        Watch agent activity. Closing this view keeps agents running.
                    </Dialog.Description>
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
                                            {StatusLabels[agent.status]}
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
                                    {currentSurface.imageUrl ? (
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
                                        <div className="subagent-theater-empty">
                                            <Codicon name="preview" size={28} />
                                            <h3>{running ? "Waiting for screenshot" : "No screenshot"}</h3>
                                            <p>
                                                {currentSurface.detail ||
                                                    "Screenshots appear when the agent uses a widget."}
                                            </p>
                                            {selected.currentTool && (
                                                <span>{selected.currentTool.replace(/_/g, " ")}</span>
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
                            <footer className="subagent-theater-footer">
                                <div>
                                    <span>{selected.model || "Task"}</span>
                                    <p>{selected.goal}</p>
                                    {stopError && (
                                        <p role="alert" className="subagent-theater-error">
                                            {stopError}
                                        </p>
                                    )}
                                </div>
                                {running && selected.sessionId && (
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
                                <span className="subagent-theater-close-hint">Agents keep running</span>
                            </footer>
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
