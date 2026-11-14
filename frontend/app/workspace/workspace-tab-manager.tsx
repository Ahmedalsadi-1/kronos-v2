// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { KronOSSignInButton } from "@/app/components/ui/kronos-sign-in-button";
import { atoms, createTab, getApi, setActiveTab } from "@/app/store/global";
import * as WOS from "@/app/store/wos";
import { WidgetPickerPopover } from "@/app/tab/widget-picker-popover";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { cn } from "@/util/util";
import { $workflowSidebarMode } from "@hermes/app/workflows/workflow-context";
import {
    $krontermInspectorCompact,
    $krontermInspectorExpanded,
    $krontermInspectorOpen,
    $krontermInspectorSection,
    $krontermInspectorTarget,
    $krontermInspectorWidth,
    $krontermSidebarTarget,
} from "@hermes/lib/kronterm-sidebar";
import { $sidebarOpen, setSidebarOpen } from "@hermes/store/layout";
import { useStore } from "@nanostores/react";
import { useAtomValue } from "jotai";
import { FolderOpen, List, MessageSquare, PanelLeft, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const ToolButtonClass =
    "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-foreground/5 aria-expanded:bg-accent/15 focus-visible:outline-2";

function WorkspaceTabRow({
    tabId,
    active,
    workspaceId,
    query,
    onError,
}: {
    tabId: string;
    active: boolean;
    workspaceId: string;
    query: string;
    onError: (reason: string) => void;
}) {
    const [tab] = WOS.useWaveObjectValue<Tab>(WOS.makeORef("tab", tabId));
    const name = tab?.name || "Untitled tab";
    if (query && !name.toLowerCase().includes(query.toLowerCase())) return null;
    return (
        <div className={cn("group flex min-w-0 items-center gap-1 rounded-md", active && "bg-accent/15")}>
            <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate px-2 py-2 text-left text-[13px] hover:bg-foreground/5 focus-visible:outline-2"
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveTab(tabId)}
            >
                {name}
            </button>
            <button
                type="button"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-foreground/10 focus-visible:outline-2"
                aria-label={`Close ${name}`}
                onClick={() =>
                    void getApi()
                        .closeTab(workspaceId, tabId, true)
                        .catch((reason) => onError(String(reason)))
                }
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function WorkspaceTabManager({ children }: { children: ReactNode }) {
    const workspace = useAtomValue(atoms.workspace);
    const activeTabId = useAtomValue(atoms.staticTabId);
    const [open, setOpen] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [error, setError] = useState("");
    const toggle = useRef<HTMLButtonElement>(null);
    const addWidget = useRef<HTMLButtonElement>(null);
    const sidebarOpen = useStore($sidebarOpen);
    const inspectorOpen = useStore($krontermInspectorOpen);
    const inspectorSection = useStore($krontermInspectorSection);
    const inspectorCompact = useStore($krontermInspectorCompact);
    const inspectorExpanded = useStore($krontermInspectorExpanded);
    const inspectorWidth = useStore($krontermInspectorWidth);
    const attachSidebar = useCallback((target: HTMLDivElement) => {
        if (!target) return;
        $krontermSidebarTarget.set(target);
        return () => {
            if ($krontermSidebarTarget.get() === target) $krontermSidebarTarget.set(null);
        };
    }, []);
    const attachInspector = useCallback((target: HTMLDivElement) => {
        if (!target) return;
        $krontermInspectorTarget.set(target);
        return () => {
            if ($krontermInspectorTarget.get() === target) $krontermInspectorTarget.set(null);
        };
    }, []);
    const toggleInspector = (section: "files" | "chat") => {
        if (inspectorOpen && inspectorSection === section && !inspectorCompact) {
            $krontermInspectorOpen.set(false);
            return;
        }
        $krontermInspectorCompact.set(false);
        $krontermInspectorSection.set(section);
        $krontermInspectorOpen.set(true);
        if (section === "chat") hermesSurfaceController.requestOpenPanel();
    };
    const panelWidth = inspectorCompact ? 48 : inspectorExpanded ? 760 : (inspectorWidth ?? 344);
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            setOpen(false);
            toggle.current?.focus();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);
    return (
        <div className="flex size-full min-h-0 min-w-0 flex-col text-foreground">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-1.5">
                <KronOSSignInButton />
                <button
                    ref={toggle}
                    type="button"
                    className={ToolButtonClass}
                    aria-label={open ? "Hide workspace tabs" : "Show workspace tabs"}
                    aria-expanded={open}
                    aria-controls="widgets-workspace-tab-manager"
                    onClick={() => {
                        if (!open) setSidebarOpen(false);
                        setOpen(!open);
                    }}
                >
                    <List size={16} />
                </button>
                <button
                    type="button"
                    className={ToolButtonClass}
                    aria-label="Agent sidebar"
                    title="Agent sidebar"
                    aria-controls="kronterm-left-sidebar"
                    aria-expanded={sidebarOpen}
                    onClick={() => {
                        if (!sidebarOpen) {
                            setOpen(false);
                            $workflowSidebarMode.set("sessions");
                        }
                        setSidebarOpen(!sidebarOpen);
                    }}
                >
                    <PanelLeft size={16} />
                </button>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {workspace?.name || "Workspace"}
                </span>
                <button
                    type="button"
                    className={ToolButtonClass}
                    aria-label="Files"
                    title="Files"
                    aria-controls="kronterm-right-inspector"
                    aria-expanded={inspectorOpen && inspectorSection === "files"}
                    onClick={() => toggleInspector("files")}
                >
                    <FolderOpen size={16} />
                </button>
                <button
                    type="button"
                    className={ToolButtonClass}
                    aria-label="KronOS Agent chat"
                    title="KronOS Agent chat"
                    aria-controls="kronterm-right-inspector"
                    aria-expanded={inspectorOpen && inspectorSection === "chat"}
                    onClick={() => toggleInspector("chat")}
                >
                    <MessageSquare size={16} />
                </button>
                <button
                    ref={addWidget}
                    type="button"
                    className={ToolButtonClass}
                    aria-label="Add widget"
                    aria-haspopup="dialog"
                    aria-expanded={pickerOpen}
                    title="Add widget"
                    onClick={() => setPickerOpen(!pickerOpen)}
                >
                    <Plus size={16} aria-hidden="true" />
                </button>
                {pickerOpen && addWidget.current && (
                    <WidgetPickerPopover
                        anchorElement={addWidget.current}
                        open
                        includeMediaWidgets
                        onClose={() => setPickerOpen(false)}
                    />
                )}
            </div>
            <div className="relative isolate flex min-h-0 flex-1">
                {open && (
                    <aside
                        id="widgets-workspace-tab-manager"
                        className="flex w-56 max-w-[75%] shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-panel p-2 max-[680px]:absolute max-[680px]:inset-y-0 max-[680px]:left-0 max-[680px]:z-20"
                        aria-label="Workspace tabs"
                    >
                        <div className="flex items-center justify-between px-1">
                            <strong className="text-[13px]">Tabs</strong>
                            <button
                                type="button"
                                className="flex size-8 cursor-pointer items-center justify-center rounded hover:bg-foreground/5 focus-visible:outline-2"
                                aria-label="Create workspace tab"
                                onClick={createTab}
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        <input
                            aria-label="Find workspace tab"
                            placeholder="Find a tab"
                            className="h-8 min-w-0 rounded-md border border-border bg-background px-2 text-xs"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                        {workspace?.tabids?.map((id) => (
                            <WorkspaceTabRow
                                key={id}
                                tabId={id}
                                active={activeTabId === id}
                                workspaceId={workspace.oid}
                                query={query}
                                onError={setError}
                            />
                        ))}
                        {error && (
                            <p role="alert" className="text-xs">
                                {error}
                            </p>
                        )}
                    </aside>
                )}
                <aside
                    id="kronterm-left-sidebar"
                    aria-label="Agent sidebar"
                    hidden={!sidebarOpen || open}
                    className="w-64 max-w-[28%] shrink-0 border-r border-border bg-panel max-[680px]:absolute max-[680px]:inset-y-0 max-[680px]:left-0 max-[680px]:z-20 max-[680px]:max-w-[80%]"
                >
                    <div ref={attachSidebar} className="h-full min-h-0" />
                </aside>
                <div className="min-h-0 min-w-0 flex-1">{children}</div>
                <aside
                    id="kronterm-right-inspector"
                    aria-label="Files and chat"
                    hidden={!inspectorOpen}
                    style={{ width: panelWidth }}
                    className="max-w-[54%] shrink-0 border-l border-border bg-panel max-[680px]:absolute max-[680px]:inset-y-0 max-[680px]:right-0 max-[680px]:z-20 max-[680px]:max-w-[85%]"
                >
                    <div ref={attachInspector} className="h-full min-h-0" />
                </aside>
            </div>
        </div>
    );
}
