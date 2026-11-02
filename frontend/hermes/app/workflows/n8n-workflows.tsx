// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { Codicon } from "@hermes/components/ui/codicon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@hermes/components/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";
import { N8nSurfaces, type N8nSurface, type N8nWorkspaceState } from "../../../types/n8n-workspace";
import { WorkflowAccount } from "./account";
import { useWorkflowContext } from "./workflow-context";

type WorkspaceState = N8nWorkspaceState & { running?: boolean; accountRequired?: boolean };
type Workflow = NonNullable<N8nWorkspaceState["workflows"]>[number];
const RowClass =
    "flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-xs text-foreground/80 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] aria-pressed:bg-white/10 aria-pressed:text-foreground";
const InputClass =
    "min-w-0 w-full border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-accent";
const SurfaceIcons: Partial<Record<N8nSurface, string>> = {
    credentials: "key",
    "data-tables": "table",
    evaluations: "checklist",
    insights: "graph-line",
    users: "account",
    roles: "shield",
    "api-keys": "key",
};
function command<T>(operation: string, input: Record<string, unknown> = {}) {
    return window.hermesDesktop.api<T>({
        path: "/api/kronterm/n8n/command",
        method: "POST",
        body: { ...input, operation },
        timeoutMs: 100000,
    });
}

export function N8nWorkflows({ active = true }: { active?: boolean } = {}) {
    const context = useWorkflowContext();
    const [state, setState] = useState<WorkspaceState>({ folders: [], workflows: [] });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [statusError, setStatusError] = useState("");
    const displayedError = error || statusError;
    const [creating, setCreating] = useState<"folder" | "workflow">(null);
    const [name, setName] = useState("");
    const pendingRead = useRef<Promise<WorkspaceState>>(null);
    const loadWorkspace = (reconnect = false, includeWorkflows = true) => {
        if (pendingRead.current) return pendingRead.current;
        const pending = (async () => {
            let next = await command<WorkspaceState>("state");
            if (reconnect && !next.running && next.accountRequired === false) {
                await command("open", { surface: "canvas", workflowId: next.selectedWorkflowId });
                next = await command<WorkspaceState>("state");
            }
            if (includeWorkflows && next.running && !next.accountRequired)
                next.workflows = await command<Workflow[]>("workflows");
            return next;
        })();
        pendingRead.current = pending;
        void pending
            .finally(() => {
                if (pendingRead.current === pending) pendingRead.current = null;
            })
            .catch(() => {});
        return pending;
    };
    const refresh = async (includeWorkflows = false) => {
        const next = await loadWorkspace(true, includeWorkflows);
        setState((previous) => ({ ...previous, ...next }));
        setStatusError("");
    };
    useEffect(() => {
        if (!active) return;
        let mounted = true;
        const read = async (reconnect = false) => {
            try {
                const next = await loadWorkspace(reconnect);
                if (mounted) {
                    setState((previous) => ({ ...previous, ...next }));
                    setStatusError("");
                }
            } catch (failure) {
                if (mounted)
                    setStatusError(
                        String(failure)
                            .replace(/^Error:\s*/, "")
                            .replace(/\bn8n\b/gi, "workflow")
                    );
            } finally {
                if (mounted) setLoading(false);
            }
        };
        const accountConnected = () => {
            if (mounted) setState((previous) => ({ ...previous, accountRequired: false }));
            void read(true);
        };
        window.addEventListener("kronterm:account-connected", accountConnected);
        void read(true);
        const timer = setInterval(() => void read(), 5000);
        return () => {
            mounted = false;
            clearInterval(timer);
            window.removeEventListener("kronterm:account-connected", accountConnected);
        };
    }, [active, context.tabId, context.workflowId]);
    const perform = async (action: () => Promise<void>) => {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await action();
        } catch (failure) {
            const message = String(failure).replace(/^Error:\s*/, "");
            setError(
                /405|Method Not Allowed/.test(message)
                    ? "Restart KronTerm to connect the workflow runtime."
                    : message.replace(/\bn8n\b/gi, "workflow")
            );
        } finally {
            setBusy(false);
        }
    };
    const open = (surface: N8nSurface, workflowId = state.selectedWorkflowId) =>
        perform(async () => {
            await command("open", { surface, workflowId });
            window.dispatchEvent(
                new CustomEvent("kronterm:workflow-open", {
                    detail: {
                        tabId: context.tabId,
                        surface,
                        ...(surface === "canvas" ? { focusWorkflow: true, workflowId } : {}),
                    },
                })
            );
            await refresh(true);
        });
    const create = () =>
        perform(async () => {
            if (!name.trim()) return;
            if (creating === "folder") await command("folders", { action: "create-folder", name: name.trim() });
            else {
                const workflow = await command<Workflow>("create-workflow", { name: name.trim() });
                await command("open", { surface: "canvas", workflowId: workflow.id });
                window.dispatchEvent(
                    new CustomEvent("kronterm:workflow-open", {
                        detail: {
                            tabId: context.tabId,
                            surface: "canvas",
                            focusWorkflow: true,
                            workflowId: workflow.id,
                        },
                    })
                );
            }
            setCreating(null);
            setName("");
            await refresh(true);
        });
    const move = (workflowId: string, folderId: string) =>
        perform(async () => {
            await command("folders", { action: "move-workflow", workflowId, folderId });
            await refresh();
        });
    const row = (workflow: Workflow) => (
        <li key={workflow.id} className="group flex min-w-0 items-center">
            <button
                type="button"
                disabled={busy}
                className={`${RowClass} min-w-0 flex-1 pl-6`}
                aria-pressed={state.selectedWorkflowId === workflow.id}
                onClick={() => void open("canvas", workflow.id)}
            >
                <Codicon name="git-merge" className="shrink-0" />
                <span className="truncate">{workflow.name}</span>
            </button>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={`Manage ${workflow.name}`}
                        disabled={busy}
                        className="cursor-pointer px-2 py-1 opacity-60 hover:opacity-100"
                    >
                        <Codicon name="ellipsis" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="hermes-glass-menu">
                    <DropdownMenuLabel>Move to folder</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => void move(workflow.id, "")}>Unfiled</DropdownMenuItem>
                    {state.folders.map((folder) => (
                        <DropdownMenuItem key={folder.id} onSelect={() => void move(workflow.id, folder.id)}>
                            {folder.name}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    );
    if (state.accountRequired)
        return (
            <WorkflowAccount
                onConnected={() => {
                    window.dispatchEvent(new Event("kronterm:account-connected"));
                    void perform(() => refresh(true));
                }}
            />
        );
    const workflows = state.workflows ?? [];
    const unfiled = workflows.filter(
        (workflow) => !state.folders.some((folder) => folder.workflowIds.includes(workflow.id))
    );
    return (
        <section
            aria-label="Workflow navigation"
            aria-busy={busy || loading}
            className="flex h-full min-h-0 flex-col bg-transparent text-foreground"
        >
            <header className="flex shrink-0 items-center justify-between px-3 pb-2 pt-3">
                <h2 className="text-[11px] font-medium uppercase tracking-wide text-foreground/50">Workflows</h2>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            aria-label="Workflow actions"
                            disabled={busy}
                            className="cursor-pointer px-1 text-foreground/60 hover:text-foreground"
                        >
                            <Codicon name="add" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="hermes-glass-menu">
                        <DropdownMenuItem
                            onSelect={() => {
                                setCreating("workflow");
                                setName("");
                            }}
                        >
                            New workflow
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setCreating("folder");
                                setName("");
                            }}
                        >
                            New folder
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void perform(() => refresh(true))}>
                            Refresh workflows
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>
            {creating && (
                <form
                    className="flex flex-col gap-2 px-3 pb-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void create();
                    }}
                >
                    <label className="text-xs">
                        {creating === "folder" ? "Folder name" : "Workflow name"}
                        <input
                            autoFocus
                            required
                            aria-label={creating === "folder" ? "Folder name" : "Workflow name"}
                            className={`${InputClass} mt-1`}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={busy || !name.trim()}
                            className="cursor-pointer border border-white/15 px-2 py-1 text-xs hover:bg-white/10"
                        >
                            Create
                        </button>
                        <button
                            type="button"
                            className="cursor-pointer px-2 py-1 text-xs text-foreground/60"
                            onClick={() => setCreating(null)}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
            {displayedError && (
                <div className="px-3 pb-2">
                    <p role="alert" className="text-xs leading-relaxed text-red-400">
                        {displayedError}
                    </p>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void perform(() => refresh(true))}
                        className="mt-2 cursor-pointer text-xs underline underline-offset-4"
                    >
                        Try again
                    </button>
                </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto pb-3">
                {loading ? (
                    <p role="status" className="px-3 py-2 text-xs text-foreground/50">
                        Loading workflows…
                    </p>
                ) : (
                    <>
                        {state.folders.map((folder) => (
                            <details key={folder.id} open className="px-1">
                                <summary className="cursor-pointer px-2 py-1.5 text-xs text-foreground/80">
                                    <span className="inline-flex items-center gap-2">
                                        <Codicon name="folder" />
                                        {folder.name}
                                    </span>
                                </summary>
                                <ul>
                                    {workflows.filter((workflow) => folder.workflowIds.includes(workflow.id)).map(row)}
                                </ul>
                            </details>
                        ))}
                        <ul className="px-1">{unfiled.map(row)}</ul>
                        {!workflows.length && !displayedError && (
                            <div className="px-3 py-3">
                                <p className="text-xs leading-relaxed text-foreground/60">No workflows yet.</p>
                                <button
                                    type="button"
                                    className="mt-2 cursor-pointer text-xs text-foreground underline underline-offset-4"
                                    onClick={() => {
                                        setCreating("workflow");
                                        setName("");
                                    }}
                                >
                                    Create a workflow
                                </button>
                            </div>
                        )}
                    </>
                )}
                <nav aria-label="Workflow management" className="mx-3 mt-4 border-t border-white/10 pt-3">
                    {N8nSurfaces.filter((surface) => !["canvas", "executions"].includes(surface.id)).map((surface) => (
                        <button
                            key={surface.id}
                            type="button"
                            disabled={busy}
                            className={RowClass}
                            aria-pressed={context.surface === surface.id}
                            onClick={() => void open(surface.id)}
                        >
                            <Codicon name={SurfaceIcons[surface.id] ?? "settings-gear"} />
                            <span>{surface.title}</span>
                        </button>
                    ))}
                </nav>
            </div>
            <footer className="shrink-0 border-t border-white/10 px-3 py-2 text-[10px] text-foreground/40">
                {busy ? "Updating workflow…" : state.running ? "Connected" : "Open a workflow to connect"}
            </footer>
        </section>
    );
}
