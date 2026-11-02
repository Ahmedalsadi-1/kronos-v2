import { $krontermInspectorOpen, $krontermInspectorSection } from "@hermes/lib/kronterm-sidebar";
import { useStore } from "@nanostores/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWorkflowContext } from "./workflow-context";
import { WorkspaceWidgetPicker } from "./workspace-widget-picker";

export function OriginalNodePicker({ active = true }: { active?: boolean }) {
    const target = useRef<HTMLDivElement>(null);
    const { tabId, workflowId } = useWorkflowContext();
    const [widgetSlot, setWidgetSlot] = useState<{ target: HTMLElement; query: string }>(null);
    useEffect(() => {
        const receive = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!active || !tabId || detail?.tabId !== tabId) return;
            if (!detail.target && detail.previousTarget) {
                setWidgetSlot((current) => (current?.target === detail.previousTarget ? null : current));
                return;
            }
            setWidgetSlot(
                detail.target instanceof HTMLElement
                    ? { target: detail.target, query: typeof detail.query === "string" ? detail.query : "" }
                    : null
            );
        };
        window.addEventListener("kronterm:workflow-widget-picker-target", receive);
        return () => {
            window.removeEventListener("kronterm:workflow-widget-picker-target", receive);
            setWidgetSlot(null);
        };
    }, [active, tabId]);
    useEffect(() => {
        if (!active) return;
        window.dispatchEvent(
            new CustomEvent("kronterm:original-node-picker", { detail: { target: target.current, tabId } })
        );
        return () => {
            window.dispatchEvent(new CustomEvent("kronterm:original-node-picker", { detail: { target: null, tabId } }));
        };
    }, [active, tabId]);
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div ref={target} aria-label="Workflow nodes" className="relative h-full min-h-0 w-full flex-1" />
            {active &&
                widgetSlot &&
                createPortal(
                    <WorkspaceWidgetPicker
                        active
                        tabId={tabId}
                        workflowId={workflowId}
                        query={widgetSlot.query}
                        embedded
                    />,
                    widgetSlot.target
                )}
        </div>
    );
}

export function OriginalExecutionsPanel({ active, dockOnly = false }: { active: boolean; dockOnly?: boolean }) {
    const target = useRef<HTMLDivElement>(null);
    const { tabId, workflowId, hasExecutions } = useWorkflowContext();
    const [dock, setDock] = useState<HTMLElement>(null);
    const inspectorOpen = useStore($krontermInspectorOpen);
    useEffect(() => {
        const receive = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!tabId || detail?.tabId !== tabId) return;
            setDock(detail.target instanceof HTMLElement ? detail.target : null);
        };
        window.addEventListener("kronterm:workflow-executions-dock-target", receive);
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-executions-dock-target-request", { detail: { tabId } })
        );
        return () => {
            window.removeEventListener("kronterm:workflow-executions-dock-target", receive);
            setDock(null);
        };
    }, [tabId]);
    const docked = Boolean(dock && active && hasExecutions && (dockOnly || inspectorOpen));
    useEffect(() => {
        if (!tabId) return;
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-executions-dock-visibility", { detail: { tabId, open: docked } })
        );
        return () => {
            if (docked)
                window.dispatchEvent(
                    new CustomEvent("kronterm:workflow-executions-dock-visibility", { detail: { tabId, open: false } })
                );
        };
    }, [tabId, docked]);
    useEffect(() => {
        if (!active || !hasExecutions || (dockOnly && !docked)) return;
        window.dispatchEvent(
            new CustomEvent("kronterm:workflow-surface", {
                detail: { surface: "executions", target: target.current, tabId, workflowId },
            })
        );
        return () => {
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-surface", {
                    detail: { surface: "executions", target: null, tabId, workflowId },
                })
            );
        };
    }, [active, tabId, workflowId, hasExecutions, docked, dock, dockOnly]);
    const history = <div ref={target} aria-label="Workflow execution history" className="h-full min-h-0 flex-1" />;
    if (!docked) return dockOnly ? null : history;
    return (
        <>
            {!dockOnly && (
                <p className="p-4 text-sm text-(--ui-text-secondary)">Execution history is open below the canvas.</p>
            )}
            {createPortal(
                <section aria-label="Workflow execution dock" className="flex h-full min-h-0 flex-col">
                    <header className="flex shrink-0 items-center justify-between border-b border-(--ui-stroke-secondary) px-3 py-2 text-sm">
                        <span>Execution history</span>
                        <button
                            type="button"
                            className="cursor-pointer rounded px-2 py-1 hover:bg-(--chrome-action-hover)"
                            onClick={() => {
                                if (dockOnly) {
                                    window.dispatchEvent(
                                        new CustomEvent("kronterm:workflow-executions-dock-close", {
                                            detail: { tabId },
                                        })
                                    );
                                } else if ($krontermInspectorSection.get() === "workflow-executions") {
                                    $krontermInspectorOpen.set(false);
                                }
                            }}
                        >
                            Close history
                        </button>
                    </header>
                    {history}
                </section>,
                dock
            )}
        </>
    );
}
