import { useStore } from "@nanostores/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { WorkflowsView } from "@hermes/app/workflows";
import { $workflowSidebarMode, useWorkflowContext } from "@hermes/app/workflows/workflow-context";
import { SidebarProvider } from "@hermes/components/ui/sidebar";
import {
    $krontermInspectorTarget,
    $krontermSidebarOwner,
    $krontermSidebarTarget,
    KrontermSidebarActivateEvent,
    registerKrontermSidebarOwner,
} from "@hermes/lib/kronterm-sidebar";
import { $sidebarOpen, setSidebarOpen } from "@hermes/store/layout";
import { KrontermInspector } from "./kronterm-inspector";

export function KrontermSidebar({ children, preferred = false }: { children: ReactNode; preferred?: boolean }) {
    const target = useStore($krontermSidebarTarget);
    const inspectorTarget = useStore($krontermInspectorTarget);
    const owner = useStore($krontermSidebarOwner);
    const open = useStore($sidebarOpen);
    const mode = useStore($workflowSidebarMode);
    useWorkflowContext();
    const [identity] = useState(() => Symbol("kronterm-sidebar"));

    useEffect(() => registerKrontermSidebarOwner(identity, preferred), [identity, preferred]);

    if (owner !== identity) return null;

    return (
        <>
            {target &&
                createPortal(
                    <div
                        data-hermes-app=""
                        onClick={(event) => {
                            if ((event.target as HTMLElement).closest("button, a")) {
                                window.dispatchEvent(new Event(KrontermSidebarActivateEvent));
                            }
                        }}
                        className="h-full min-h-0 w-full"
                        style={{ "--titlebar-height": "0px" } as CSSProperties}
                    >
                        <SidebarProvider
                            open={open}
                            onOpenChange={setSidebarOpen}
                            className="h-full min-h-0"
                            style={{ "--sidebar-width": "100%" } as CSSProperties}
                        >
                            <div className="flex h-full min-h-0 w-full flex-col">
                                <div
                                    role="tablist"
                                    aria-label="Workspace navigation"
                                    className="flex shrink-0 items-center gap-4 border-b border-white/10 px-3 pt-2"
                                >
                                    {(["sessions", "workflows"] as const).map((value) => (
                                        <button
                                            key={value}
                                            id={`kronterm-navigation-${value}`}
                                            role="tab"
                                            type="button"
                                            aria-selected={mode === value}
                                            aria-controls={`kronterm-navigation-pane-${value}`}
                                            tabIndex={mode === value ? 0 : -1}
                                            onClick={() => $workflowSidebarMode.set(value)}
                                            onKeyDown={(event) => {
                                                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                                                    return;
                                                event.preventDefault();
                                                const next =
                                                    event.key === "Home"
                                                        ? "sessions"
                                                        : event.key === "End"
                                                          ? "workflows"
                                                          : mode === "sessions"
                                                            ? "workflows"
                                                            : "sessions";
                                                $workflowSidebarMode.set(next);
                                                document.getElementById(`kronterm-navigation-${next}`)?.focus();
                                            }}
                                            className="cursor-pointer border-b-2 border-transparent pb-2 text-xs text-foreground/55 aria-selected:border-accent aria-selected:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                                        >
                                            {value === "sessions" ? "Sessions" : "Workflows"}
                                        </button>
                                    ))}
                                </div>
                                <div
                                    id="kronterm-navigation-pane-sessions"
                                    role="tabpanel"
                                    aria-labelledby="kronterm-navigation-sessions"
                                    hidden={mode !== "sessions"}
                                    className="min-h-0 flex-1"
                                >
                                    {children}
                                </div>
                                <div
                                    id="kronterm-navigation-pane-workflows"
                                    role="tabpanel"
                                    aria-labelledby="kronterm-navigation-workflows"
                                    hidden={mode !== "workflows"}
                                    className="min-h-0 flex-1"
                                >
                                    <WorkflowsView active={mode === "workflows" && open} />
                                </div>
                            </div>
                        </SidebarProvider>
                    </div>,
                    target
                )}
            {inspectorTarget &&
                createPortal(
                    <div
                        data-hermes-app=""
                        className="h-full min-h-0 w-full"
                        style={{ "--titlebar-height": "0px" } as CSSProperties}
                    >
                        <KrontermInspector />
                    </div>,
                    inspectorTarget
                )}
        </>
    );
}
