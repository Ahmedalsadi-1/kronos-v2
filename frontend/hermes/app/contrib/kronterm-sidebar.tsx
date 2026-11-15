import { useStore } from "@nanostores/react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { WorkflowsView } from "@hermes/app/workflows";
import { $workflowSidebarMode, useWorkflowContext } from "@hermes/app/workflows/workflow-context";
import { SidebarProvider } from "@hermes/components/ui/sidebar";
import {
    $comfyLibraryTarget,
    $krontermInspectorTarget,
    $krontermSidebarOwner,
    $krontermSidebarTarget,
    $penDesignTarget,
    $workspaceCanvasPanels,
    KrontermSidebarActivateEvent,
    registerKrontermSidebarOwner,
} from "@hermes/lib/kronterm-sidebar";
import { $sidebarOpen, setSidebarOpen } from "@hermes/store/layout";
import { KrontermInspector } from "./kronterm-inspector";

const NavigationLabels = {
    sessions: "Sessions",
    workflows: "KronFlow",
    comfy: "KronRender",
    design: "Canvas",
};

export function KrontermSidebar({ children, preferred = false }: { children: ReactNode; preferred?: boolean }) {
    const target = useStore($krontermSidebarTarget);
    const inspectorTarget = useStore($krontermInspectorTarget);
    const owner = useStore($krontermSidebarOwner);
    const open = useStore($sidebarOpen);
    const mode = useStore($workflowSidebarMode);
    const canvasPanels = useStore($workspaceCanvasPanels);
    const selected = !canvasPanels && (mode === "comfy" || mode === "design") ? "sessions" : mode;
    const modes = canvasPanels
        ? (["sessions", "workflows", "comfy", "design"] as const)
        : (["sessions", "workflows"] as const);
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
                            const target = event.target as HTMLElement;
                            if (target.closest("#kronterm-navigation-design, #kronterm-navigation-pane-design")) return;
                            if (target.closest("button, a")) {
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
                            <div className="flex h-full min-h-0 w-full flex-col bg-black">
                                <div
                                    role="tablist"
                                    aria-label="Workspace navigation"
                                    className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-white/10 px-2 pt-2"
                                >
                                    {modes.map((value) => (
                                        <button
                                            key={value}
                                            id={`kronterm-navigation-${value}`}
                                            role="tab"
                                            type="button"
                                            aria-selected={selected === value}
                                            aria-controls={`kronterm-navigation-pane-${value}`}
                                            tabIndex={selected === value ? 0 : -1}
                                            onClick={() => $workflowSidebarMode.set(value)}
                                            onKeyDown={(event) => {
                                                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                                                    return;
                                                event.preventDefault();
                                                const next =
                                                    modes[
                                                        event.key === "Home"
                                                            ? 0
                                                            : event.key === "End"
                                                              ? modes.length - 1
                                                              : (modes.findIndex((mode) => mode === selected) +
                                                                    (event.key === "ArrowRight"
                                                                        ? 1
                                                                        : modes.length - 1)) %
                                                                modes.length
                                                    ];
                                                $workflowSidebarMode.set(next);
                                                document.getElementById(`kronterm-navigation-${next}`)?.focus();
                                            }}
                                            className="cursor-pointer border-b-2 border-transparent pb-2 text-[11px] text-foreground/55 aria-selected:border-accent aria-selected:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                                        >
                                            {NavigationLabels[value]}
                                        </button>
                                    ))}
                                </div>
                                <div
                                    id="kronterm-navigation-pane-sessions"
                                    role="tabpanel"
                                    aria-labelledby="kronterm-navigation-sessions"
                                    hidden={selected !== "sessions"}
                                    className="min-h-0 flex-1"
                                >
                                    {children}
                                </div>
                                <div
                                    id="kronterm-navigation-pane-workflows"
                                    role="tabpanel"
                                    aria-labelledby="kronterm-navigation-workflows"
                                    hidden={selected !== "workflows"}
                                    className="min-h-0 flex-1"
                                >
                                    <WorkflowsView active={selected === "workflows" && open} />
                                </div>
                                {canvasPanels && (
                                    <div
                                        ref={setComfyLibraryTarget}
                                        id="kronterm-navigation-pane-comfy"
                                        role="tabpanel"
                                        aria-labelledby="kronterm-navigation-comfy"
                                        hidden={selected !== "comfy"}
                                        className="min-h-0 flex-1"
                                    />
                                )}
                                {canvasPanels && (
                                    <div
                                        ref={setPenDesignTarget}
                                        id="kronterm-navigation-pane-design"
                                        role="tabpanel"
                                        aria-labelledby="kronterm-navigation-design"
                                        hidden={selected !== "design"}
                                        className="min-h-0 flex-1 overflow-auto"
                                    />
                                )}
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

function setComfyLibraryTarget(target: HTMLDivElement) {
    $comfyLibraryTarget.set(target);
}

function setPenDesignTarget(target: HTMLDivElement) {
    $penDesignTarget.set(target);
}
