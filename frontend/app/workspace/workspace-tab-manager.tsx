// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { atoms, createTab, getApi, setActiveTab } from "@/app/store/global";
import * as WOS from "@/app/store/wos";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { PanelLeft, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
    const [query, setQuery] = useState("");
    const [error, setError] = useState("");
    const toggle = useRef<HTMLButtonElement>(null);
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
                <button
                    ref={toggle}
                    type="button"
                    className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-foreground/5 focus-visible:outline-2"
                    aria-label={open ? "Hide workspace tabs" : "Show workspace tabs"}
                    aria-expanded={open}
                    aria-controls="widgets-workspace-tab-manager"
                    onClick={() => setOpen(!open)}
                >
                    <PanelLeft size={16} />
                </button>
                <span className="text-xs text-muted-foreground">{workspace?.name || "Workspace"}</span>
            </div>
            <div className="flex min-h-0 flex-1">
                {open && (
                    <aside
                        id="widgets-workspace-tab-manager"
                        className="flex w-56 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-panel p-2"
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
                <div className="min-h-0 min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );
}
