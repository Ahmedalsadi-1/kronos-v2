// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { Codicon } from "@hermes/components/ui/codicon";
import { useEffect, useRef, useState } from "react";

type WorkspaceWidget = { blockId: string; label: string; view: string };

export function WorkspaceWidgetPicker({
    active,
    tabId,
    workflowId,
    query = "",
    embedded = false,
}: {
    active: boolean;
    tabId?: string;
    workflowId?: string;
    query?: string;
    embedded?: boolean;
}) {
    const [widgets, setWidgets] = useState<WorkspaceWidget[]>([]);
    const [loading, setLoading] = useState(false);
    const [pending, setPending] = useState("");
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const insertion = useRef<{ requestId: string; timer: ReturnType<typeof setTimeout> }>(null);
    useEffect(() => {
        if (!active || !tabId || !window.hermesDesktop?.api) return;
        let mounted = true;
        setLoading(true);
        setWidgets([]);
        setError("");
        void window.hermesDesktop
            .api<WorkspaceWidget[]>({
                path: "/api/kronterm/n8n/command",
                method: "POST",
                body: { operation: "workspace-widgets" },
            })
            .then((entries) => {
                if (mounted) setWidgets(entries);
            })
            .catch((failure) => {
                if (mounted)
                    setError(
                        String(failure)
                            .replace(/^Error:\s*/, "")
                            .replace(/\bn8n\b/gi, "workflow")
                    );
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, [active, tabId, revision]);
    useEffect(() => {
        const complete = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!insertion.current) return;
            if (
                detail?.tabId !== tabId ||
                detail.workflowId !== workflowId ||
                detail.requestId !== insertion.current?.requestId
            )
                return;
            clearTimeout(insertion.current.timer);
            insertion.current = null;
            setPending("");
            setError(detail.error ?? "");
        };
        window.addEventListener("kronterm:workflow-widget-inserted", complete);
        return () => {
            window.removeEventListener("kronterm:workflow-widget-inserted", complete);
            if (insertion.current) clearTimeout(insertion.current.timer);
            insertion.current = null;
            setPending("");
        };
    }, [tabId, workflowId, active]);
    const insert = (widget: WorkspaceWidget) => {
        if (!workflowId || insertion.current) return;
        const requestId = crypto.randomUUID();
        setPending(widget.blockId);
        setError("");
        insertion.current = {
            requestId,
            timer: setTimeout(() => {
                insertion.current = null;
                setPending("");
                setError("The workflow editor did not respond. Open the workflow and try again.");
            }, 30000),
        };
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-insert-widget", {
                detail: { tabId, workflowId, ...widget, requestId },
            })
        );
    };
    const visibleWidgets = widgets.filter((widget) =>
        `${widget.label} ${widget.view} workspace widget`.toLowerCase().includes(query.trim().toLowerCase())
    );
    if (embedded && !loading && !error && !visibleWidgets.length) return null;
    return (
        <section
            aria-label="Workspace widgets as workflow nodes"
            data-workspace-widget-list=""
            style={embedded ? { padding: "12px 16px", fontSize: 12, color: "var(--color--text)" } : undefined}
            className={embedded ? undefined : "shrink-0 border-b border-(--ui-stroke-secondary) px-3 py-2 text-xs"}
        >
            <div
                className="flex items-center justify-between gap-2"
                style={
                    embedded ? { display: "flex", alignItems: "center", justifyContent: "space-between" } : undefined
                }
            >
                <h3 className="font-medium">Workspace widgets</h3>
                <button
                    type="button"
                    aria-label="Refresh workspace widgets"
                    disabled={loading || Boolean(pending)}
                    onClick={() => setRevision((value) => value + 1)}
                    style={
                        embedded
                            ? {
                                  cursor: "pointer",
                                  minWidth: 28,
                                  minHeight: 28,
                                  border: 0,
                                  background: "transparent",
                                  color: "inherit",
                              }
                            : undefined
                    }
                    className="flex min-h-8 min-w-8 cursor-pointer items-center justify-center rounded text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                    {embedded ? "Refresh" : <Codicon name="refresh" />}
                </button>
            </div>
            {!embedded && <p className="mt-1 text-(--ui-text-secondary)">Add a node bound to a live widget.</p>}
            {loading && (
                <p role="status" className="mt-2 text-(--ui-text-secondary)">
                    Loading widgets…
                </p>
            )}
            {!loading && !widgets.length && (
                <p className="mt-2 text-(--ui-text-secondary)">Open a widget in this workspace to add it here.</p>
            )}
            {!workflowId && widgets.length > 0 && (
                <p className="mt-2 text-(--ui-text-secondary)">Open a workflow to connect widgets.</p>
            )}
            <ul
                className={embedded ? undefined : "mt-2 max-h-40 overflow-y-auto"}
                style={embedded ? { listStyle: "none", padding: 0, margin: "4px 0 0" } : undefined}
            >
                {visibleWidgets.map((widget) => (
                    <li key={widget.blockId}>
                        <button
                            type="button"
                            style={
                                embedded
                                    ? {
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 8,
                                          minHeight: 44,
                                          width: "100%",
                                          padding: "8px 4px",
                                          cursor: "pointer",
                                          textAlign: "left",
                                          color: "inherit",
                                          background: "transparent",
                                          border: 0,
                                      }
                                    : undefined
                            }
                            disabled={!workflowId || Boolean(pending)}
                            onClick={() => insert(widget)}
                            data-workspace-widget-entry=""
                            aria-label={`Add ${widget.label} as workflow node`}
                            className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-left hover:bg-(--chrome-action-hover) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:opacity-50"
                        >
                            {!embedded && <Codicon name="layout" className="shrink-0 text-(--ui-text-secondary)" />}
                            <span
                                className="min-w-0 flex-1 truncate"
                                style={
                                    embedded
                                        ? {
                                              flex: 1,
                                              minWidth: 0,
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              whiteSpace: "nowrap",
                                          }
                                        : undefined
                                }
                            >
                                {widget.label}
                            </span>
                            <span className="text-xs text-(--ui-text-secondary)">
                                {pending === widget.blockId ? "Adding…" : widget.view}
                            </span>
                            {!embedded && <Codicon name="add" className="shrink-0" />}
                        </button>
                    </li>
                ))}
            </ul>
            {error && (
                <p role="alert" className="mt-2 text-destructive">
                    {error}
                </p>
            )}
        </section>
    );
}
