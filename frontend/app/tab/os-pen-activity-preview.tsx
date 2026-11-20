// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { subscribeSubagentSurface, type SubagentSurfaceSnapshot } from "@hermes/lib/subagent-surface";
import { $subagentsBySession, type SubagentProgress } from "@hermes/store/subagents";
import { useStore } from "@nanostores/react";
import { ArrowUpRight, Info, Maximize2, Wrench, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { captureBrowserTab } from "./browser-tab-preview";
import "./os-pen-activity-preview.css";
import previewStyles from "./os-pen-activity-preview.css?raw";

export type PenActivityRow = {
    id: string;
    goal: string;
    status: string;
    detail: string;
    tool?: string;
    imageUrl?: string;
    blockId?: string;
    sessionId?: string;
    swarm?: boolean;
    since: number;
};

export type PenActivityRun = { rows: PenActivityRow[]; sessionId?: string; storedId?: string; since: number };

export function describePenWorker(worker: SubagentProgress, since: number): PenActivityRow {
    const { id, goal, status, currentTool, lastTool, summary, stream, sessionId, swarm } = worker;
    return {
        id,
        goal: goal.slice(0, 160),
        status,
        detail: (summary || stream.findLast(({ kind }) => kind === "summary" || kind === "progress")?.text || "").slice(
            0,
            400
        ),
        tool: currentTool || lastTool,
        sessionId,
        swarm: swarm != null,
        since,
    };
}

export function OSPenActivityPreview({
    editorDocument,
    runs,
    onOpenWidget,
    onOpenTheater,
}: {
    editorDocument: Document;
    runs: ReadonlyMap<string, PenActivityRun>;
    onOpenWidget: (id: string) => Promise<boolean>;
    onOpenTheater: (conversationId: string, workerId: string) => void;
}) {
    const [placement, setPlacement] = useState<{ mount: HTMLElement; split: boolean }>();
    const workersBySession = useStore($subagentsBySession);
    useEffect(() => {
        const view = editorDocument.defaultView;
        if (!view) return;
        const style = editorDocument.createElement("style");
        style.textContent = previewStyles;
        editorDocument.head.append(style);
        const sync = () => {
            const split = editorDocument.documentElement.hasAttribute("data-kronos-chat-split");
            const mounts = Array.from(
                editorDocument.querySelectorAll<HTMLElement>("[data-kronos-agent-preview]")
            ).filter(
                (element) =>
                    element.getClientRects().length > 0 &&
                    view.getComputedStyle(element).visibility === "visible"
            );
            const mount = mounts.find((element) => !element.closest("[data-kronos-spotlight-workers]")) ?? mounts[0];
            setPlacement((previous) =>
                previous?.mount === mount && previous?.split === split ? previous : { mount, split }
            );
        };
        const observer = new MutationObserver(sync);
        observer.observe(editorDocument.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "hidden", "data-kronos-chat-split", "data-kronos-floating-minimized"],
        });
        view.addEventListener("resize", sync);
        sync();
        return () => {
            observer.disconnect();
            view.removeEventListener("resize", sync);
            style.remove();
        };
    }, [editorDocument]);
    const conversationId = placement?.mount?.dataset.kronosAgentPreview;
    const run = runs.get(conversationId);
    if (!run) return null;
    const rows = new Map(run.rows.map((row) => [row.id, row]));
    for (const key of new Set([run.storedId, run.sessionId])) {
        for (const worker of key ? (workersBySession[key] ?? []) : []) {
            if (worker.startedAt < run.since) continue;
            const previous = rows.get(worker.id);
            const current = describePenWorker(worker, run.since);
            rows.set(worker.id, { ...previous, ...current, detail: current.detail || previous?.detail || "" });
        }
    }
    const eligible = Array.from(rows.values())
        .slice(0, 13)
        .filter((row) => row.id !== "main" || (!placement.split && (row.blockId || row.imageUrl)));
    if (!eligible.length) return null;
    return (
        <ActivityPreview
            key={JSON.stringify([conversationId, run.since])}
            rows={eligible}
            mount={placement.mount}
            onOpenWidget={onOpenWidget}
            onOpenTheater={(workerId) => onOpenTheater(conversationId, workerId)}
        />
    );
}

function ActivityPreview({
    rows,
    mount,
    onOpenWidget,
    onOpenTheater,
}: {
    rows: PenActivityRow[];
    mount: HTMLElement;
    onOpenWidget: (id: string) => Promise<boolean>;
    onOpenTheater: (workerId: string) => void;
}) {
    const [selectedId, setSelectedId] = useState<string>();
    const [expanded, setExpanded] = useState(false);
    const [details, setDetails] = useState(false);
    const [openError, setOpenError] = useState(false);
    const [opening, setOpening] = useState(false);
    const [surface, setSurface] = useState<{ identity: string; snapshot: SubagentSurfaceSnapshot }>();
    const [browser, setBrowser] = useState<{ id: string; image: string }>();
    const dialog = useRef<HTMLDialogElement>(null);
    const thumbnail = useRef<HTMLButtonElement>(null);
    const selected = rows.find(({ id }) => id === selectedId) ?? rows[0];
    const { id, since, sessionId, swarm, status } = selected;
    const identity = JSON.stringify([id, since, sessionId]);
    const snapshot = surface?.identity === identity ? surface.snapshot : undefined;
    const blockId = snapshot?.targetKey ? snapshot.blockId : selected.blockId;
    const running = status === "running" || status === "queued";

    useEffect(
        () =>
            subscribeSubagentSurface({ id, sessionId, swarm, since, live: running }, (snapshot) =>
                setSurface({ identity, snapshot })
            ),
        [id, identity, running, sessionId, since, swarm]
    );

    useEffect(() => {
        if (!blockId || snapshot?.targetKey || selected.imageUrl) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const capture = async () => {
            if (!document.hidden) {
                const result = await captureBrowserTab(blockId).catch(() => undefined);
                if (!disposed && result?.image) setBrowser({ id: blockId, image: result.image });
            }
            if (!disposed && running) timer = setTimeout(capture, 1800);
        };
        void capture();
        return () => {
            disposed = true;
            clearTimeout(timer);
        };
    }, [blockId, running, selected.imageUrl, snapshot?.targetKey]);

    useLayoutEffect(() => {
        if (!expanded) return;
        const element = dialog.current;
        element.showModal();
        return () => element.close();
    }, [expanded]);

    const dismiss = (restoreFocus = true) => {
        setExpanded(false);
        setDetails(false);
        setOpenError(false);
        if (restoreFocus) requestAnimationFrame(() => thumbnail.current?.focus());
    };
    const select = (id: string) => {
        setSelectedId(id);
        setDetails(false);
        setOpenError(false);
    };
    const openWidget = async () => {
        setOpening(true);
        try {
            if (await onOpenWidget(blockId)) dismiss(false);
            else setOpenError(true);
        } catch {
            setOpenError(true);
        } finally {
            setOpening(false);
        }
    };
    const source = snapshot?.captureError
        ? undefined
        : snapshot?.imageUrl ||
          selected.imageUrl ||
          (!snapshot?.targetKey && browser?.id === blockId ? browser?.image : undefined);
    const image = source && /^(data:image\/(png|jpeg|webp);base64,|blob:)/i.test(source) ? source : undefined;
    const caption = selected.detail || selected.goal || (id === "main" ? "Current task" : "Subagent");
    const empty = snapshot?.captureError
        ? "Preview unavailable"
        : running
          ? "Waiting for activity…"
          : "No preview available";
    const media = image ? <img src={image} alt="" /> : <span className="pen-activity-empty">{empty}</span>;
    const workerPicker = rows.length > 1 && (
        <select aria-label="Preview task" value={id} onChange={(event) => select(event.currentTarget.value)}>
            {rows.map((row, index) => (
                <option key={row.id} value={row.id} title={row.goal}>
                    {row.id === "main" ? "Main task" : `Subagent ${index + 1 - Number(rows[0].id === "main")}`}
                </option>
            ))}
        </select>
    );

    return (
        <>
            {createPortal(
                <div className="pen-activity-compact" style={{ visibility: expanded ? "hidden" : undefined }}>
                    <button
                        type="button"
                        className="pen-activity-thumbnail"
                        ref={thumbnail}
                        aria-label={`Expand activity preview: ${caption}`}
                        aria-haspopup="dialog"
                        onClick={(event) => {
                            event.stopPropagation();
                            setExpanded(true);
                        }}
                    >
                        {media}
                        <Maximize2 size={13} aria-hidden="true" />
                    </button>
                    <div className="pen-activity-line">
                        <span
                            className="pen-activity-status"
                            data-running={running}
                            title={status}
                            aria-label={status}
                        />
                        <span className="pen-activity-caption" title={caption}>
                            {caption}
                        </span>
                        {workerPicker}
                    </div>
                </div>,
                mount
            )}
            {expanded &&
                createPortal(
                    <dialog
                        ref={dialog}
                        className="pen-activity-dialog"
                        aria-label="Task activity preview"
                        onCancel={(event) => {
                            event.preventDefault();
                            dismiss();
                        }}
                        onClick={(event) => {
                            if (event.target === event.currentTarget) dismiss();
                        }}
                    >
                        <div className="pen-activity-media">
                            {media}
                            <div className="pen-activity-actions">
                                {blockId && (
                                    <button
                                        type="button"
                                        aria-label="Open widget as tab"
                                        title="Open widget as tab"
                                        disabled={opening}
                                        onClick={() => void openWidget()}
                                    >
                                        <ArrowUpRight size={16} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    aria-label="Close preview"
                                    title="Close preview"
                                    onClick={() => dismiss()}
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>
                        <div className="pen-activity-line">
                            {selected.tool && (
                                <span className="pen-activity-tool" title={selected.tool}>
                                    <Wrench size={12} aria-hidden="true" />
                                    <span>{selected.tool.replaceAll("_", " ")}</span>
                                </span>
                            )}
                            <span className="pen-activity-caption" title={caption}>
                                {caption}
                            </span>
                            {workerPicker}
                            <button
                                type="button"
                                aria-label="Task details"
                                title="Task details"
                                aria-expanded={details}
                                onClick={() => setDetails(!details)}
                            >
                                <Info size={15} />
                            </button>
                        </div>
                        {openError && (
                            <div className="pen-activity-details" role="alert">
                                This widget could not be opened.
                            </div>
                        )}
                        {details && (
                            <div className="pen-activity-details">
                                <p>{selected.goal}</p>
                                {selected.detail && selected.detail !== selected.goal && <p>{selected.detail}</p>}
                                {id !== "main" && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            dismiss(false);
                                            onOpenTheater(id);
                                        }}
                                    >
                                        Open Subagent Theater
                                    </button>
                                )}
                            </div>
                        )}
                    </dialog>,
                    document.body
                )}
        </>
    );
}
