// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ComputerUseControlEvent } from "@/app/components/computer-use-status-card";
import { SystemButton, SystemPopover, SystemSegmentedControl, SystemToggle, useSystemAppearance } from "@/app/components/system-ui";
import {
    attachOSResourceToKronos,
    quickLookOSResource,
    revealOSResource,
    type OSResourceReference,
} from "@/app/store/os-resource-service";
import { OSSystemModel } from "@/app/store/os-system";
import { ContextMenuModel } from "@/app/store/contextmenu";
import type { SystemEvent } from "@/app/store/os-system-types";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { atoms, createBlock, getApi, getSettingsKeyAtom } from "@/store/global";
import { applyCustomAccent } from "@/app/view/kronsettings/kronsettings-theme-presets";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import {
    Bell,
    Bot,
    CalendarClock,
    CheckCheck,
    ChevronRight,
    Clock3,
    ExternalLink,
    Eye,
    FolderOpen,
    FolderSearch2,
    GitBranch,
    History,
    PackageOpen,
    Pin,
    RefreshCw,
    ShieldCheck,
    Trash2,
    X,
} from "@/app/components/system-ui/os-icons";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

type OSSystemCenter = "activity" | "control";
type OSActivityView = "attention" | "timeline" | "artifacts";

const CapabilityLabels: Record<string, string> = {
    "screen-capture": "Screen capture",
    accessibility: "Accessibility control",
    files: "Files and folders",
    terminal: "Terminal execution",
    network: "Network access",
    microphone: "Microphone",
    clipboard: "Clipboard",
};

const EventIcons: Record<SystemEvent["kind"], string> = {
    agent: "fa-sparkles",
    approval: "fa-shield-halved",
    app: "fa-window-maximize",
    notification: "fa-bell",
    update: "fa-arrow-up-from-bracket",
    recovery: "fa-clock-rotate-left",
};

function dispatchActivityAction(action: string, event: SystemEvent, onFocusBlock: (blockId: string) => void) {
    if (action === "os.activity.inspect" && event.blockId) {
        onFocusBlock(event.blockId);
        return;
    }
    const controlAction =
        action === "os.activity.interrupt"
            ? "stop"
            : action === "os.activity.retry"
              ? "retry"
              : action === "os.activity.takeover"
                ? "takeover"
                : undefined;
    if (!controlAction) return;
    window.dispatchEvent(
        new CustomEvent(ComputerUseControlEvent, {
            detail: { action: controlAction, activity: { blockid: event.blockId } },
        })
    );
}

function activityActionLabel(action: string): string {
    if (action === "os.activity.interrupt") return "Interrupt";
    if (action === "os.activity.retry") return "Retry";
    if (action === "os.activity.takeover") return "Take control";
    return "Inspect";
}

function OSActivityViewPicker({ view, onView }: { view: OSActivityView; onView: (view: OSActivityView) => void }) {
    return (
        <SystemSegmentedControl className="os-activity-view-picker" aria-label="Activity Center views">
            <SystemButton
                type="button"
                size="small"
                selected={view === "attention"}
                className={cn(view === "attention" && "is-active")}
                onClick={() => onView("attention")}
            >
                <Bell aria-hidden="true" /> Activity
            </SystemButton>
            <SystemButton
                type="button"
                size="small"
                selected={view === "timeline"}
                className={cn(view === "timeline" && "is-active")}
                onClick={() => onView("timeline")}
            >
                <History aria-hidden="true" /> Timeline
            </SystemButton>
            <SystemButton
                type="button"
                size="small"
                selected={view === "artifacts"}
                className={cn(view === "artifacts" && "is-active")}
                onClick={() => onView("artifacts")}
            >
                <PackageOpen aria-hidden="true" /> Shelf
            </SystemButton>
        </SystemSegmentedControl>
    );
}

function OSArtifactShelf({ onPinResource }: { onPinResource: (resource: OSResourceReference) => void }) {
    const model = OSSystemModel.getInstance();
    const profile = useAtomValue(model.profileAtom);
    const artifacts = profile.artifactShelf;

    return (
        <div className="os-artifact-shelf">
            {artifacts.length === 0 && (
                <div className="os-center-empty">
                    <PackageOpen aria-hidden="true" />
                    <strong>Your handoff shelf is empty</strong>
                    <span>Save files and repositories from Files to reuse them across apps and Kronos.</span>
                </div>
            )}
            {artifacts.map((artifact) => (
                <article key={`${artifact.id}:${artifact.addedAt}`} className="os-artifact-item">
                    <button type="button" className="os-artifact-open" onClick={() => quickLookOSResource(artifact)}>
                        <span className={cn("os-artifact-icon", `is-${artifact.kind}`)}>
                            <PackageOpen aria-hidden="true" />
                        </span>
                        <span>
                            <strong>{artifact.name}</strong>
                            <small>{artifact.detail ?? artifact.resource}</small>
                        </span>
                    </button>
                    <div className="os-artifact-actions" role="group" aria-label={artifact.name}>
                        <button
                            type="button"
                            onClick={() => quickLookOSResource(artifact)}
                            aria-label={`Quick Look ${artifact.name}`}
                        >
                            <Eye aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => revealOSResource(artifact)}
                            aria-label={`Reveal ${artifact.name}`}
                        >
                            <FolderSearch2 aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onPinResource(artifact)}
                            aria-label={`Pin ${artifact.name} to Canvas`}
                        >
                            <Pin aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => attachOSResourceToKronos(artifact)}
                            aria-label={`Attach ${artifact.name} to Kronos`}
                        >
                            <Bot aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => void model.removeArtifact(artifact.id)}
                            aria-label={`Remove ${artifact.name} from shelf`}
                        >
                            <Trash2 aria-hidden="true" />
                        </button>
                    </div>
                </article>
            ))}
        </div>
    );
}

function OSSpaceTimeline({ events }: { events: SystemEvent[] }) {
    const groups = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
        const grouped = new Map<string, SystemEvent[]>();
        for (const event of events) {
            const key = formatter.format(new Date(event.createdAt));
            grouped.set(key, [...(grouped.get(key) ?? []), event]);
        }
        return [...grouped.entries()];
    }, [events]);

    if (events.length === 0) {
        return (
            <div className="os-center-empty">
                <CalendarClock aria-hidden="true" />
                <strong>No timeline events yet</strong>
                <span>Completed jobs, approvals, app transitions, checkpoints, and recoveries will appear here.</span>
            </div>
        );
    }

    return (
        <div className="os-space-timeline">
            {groups.map(([label, groupEvents]) => (
                <section key={label}>
                    <header>{label}</header>
                    {groupEvents.map((event) => (
                        <article key={event.id}>
                            <span className={cn("os-timeline-dot", `is-${event.kind}`)} aria-hidden="true" />
                            <div>
                                <strong>{event.title}</strong>
                                <small>
                                    {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
                                        new Date(event.createdAt)
                                    )}
                                    {event.source ? ` · ${event.source}` : ""}
                                </small>
                            </div>
                        </article>
                    ))}
                </section>
            ))}
        </div>
    );
}

function OSActivityCenter({
    onFocusBlock,
    onPinResource,
}: {
    onFocusBlock: (blockId: string) => void;
    onPinResource: (resource: OSResourceReference) => void;
}) {
    const model = OSSystemModel.getInstance();
    const events = useAtomValue(model.eventsAtom);
    const loadState = useAtomValue(model.loadStateAtom);
    const spaceId = useAtomValue(model.activeSpaceIdAtom);
    const ambientOSEnabled = useAtomValue(getSettingsKeyAtom("feature:ambientos")) ?? false;
    const [view, setView] = useState<OSActivityView>("attention");
    const activeView = ambientOSEnabled ? view : "attention";
    const unreadCount = events.filter((event) => event.readAt == null).length;

    return (
        <>
            {loadState === "degraded" && (
                <div className="os-recovery-banner" role="alert">
                    <div><strong>Space history could not be restored</strong><span>Your open applications are still available. Retry to reconnect activity and permissions.</span></div>
                    <SystemButton type="button" size="small" variant="tinted" onClick={() => void model.loadSpace(spaceId)}>Retry</SystemButton>
                </div>
            )}
            {ambientOSEnabled && <OSActivityViewPicker view={activeView} onView={setView} />}
            {activeView === "artifacts" && <OSArtifactShelf onPinResource={onPinResource} />}
            {activeView === "timeline" && <OSSpaceTimeline events={events} />}
            {activeView === "attention" && (
                <>
                    <div className="os-center-summary">
                        <div>
                            <span>Project-space journal</span>
                            <strong>{unreadCount > 0 ? `${unreadCount} unread` : "Up to date"}</strong>
                        </div>
                        {unreadCount > 0 && (
                            <button type="button" onClick={() => void model.markEventsRead()}>
                                <CheckCheck aria-hidden="true" /> Mark all read
                            </button>
                        )}
                    </div>
                    <div className="os-center-list" role="feed" aria-busy={loadState === "restoring"}>
                        {loadState === "restoring" && (
                            <div className="os-center-empty">
                                <RefreshCw className="is-spinning" aria-hidden="true" /> Restoring activity…
                            </div>
                        )}
                        {loadState === "ready" && events.length === 0 && (
                            <div className="os-center-empty">
                                <Bell aria-hidden="true" />
                                <strong>Nothing needs attention</strong>
                                <span>
                                    Agent jobs, approvals, app failures, updates, and recovery events appear here.
                                </span>
                            </div>
                        )}
                        {events.map((event) => (
                            <article
                                key={event.id}
                                className={cn("os-activity-event", event.readAt == null && "is-unread")}
                                aria-label={event.title}
                            >
                                <span className={cn("os-activity-event-icon", `is-${event.kind}`)}>
                                    <i className={`fa-solid ${EventIcons[event.kind]}`} aria-hidden="true" />
                                </span>
                                <div className="os-activity-event-copy">
                                    <header>
                                        <strong>{event.title}</strong>
                                        <time dateTime={new Date(event.createdAt).toISOString()}>
                                            {new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
                                                -Math.max(0, Math.round((Date.now() - event.createdAt) / 60_000)),
                                                "minute"
                                            )}
                                        </time>
                                    </header>
                                    <span>{event.status.replaceAll("-", " ")}</span>
                                    {event.actions != null && event.actions.length > 0 && (
                                        <footer>
                                            {event.actions.slice(0, 3).map((action) => (
                                                <button
                                                    type="button"
                                                    key={action}
                                                    onClick={() => {
                                                        dispatchActivityAction(action, event, onFocusBlock);
                                                        void model.markEventsRead([event.id]);
                                                    }}
                                                >
                                                    {activityActionLabel(action)}
                                                </button>
                                            ))}
                                        </footer>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            )}
        </>
    );
}

function permissionStatusClass(status: string): string {
    if (status === "granted") return "is-granted";
    if (status === "denied" || status === "restricted") return "is-denied";
    return "is-unknown";
}

function OSWorktreesSection({ root }: { root: string }) {
    const [worktrees, setWorktrees] = useState<OSWorktree[]>([]);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        if (!root) {
            setWorktrees([]);
            return;
        }
        void RpcApi.OSWorktreeListCommand(TabRpcClient, root)
            .then((result) => {
                setWorktrees(result ?? []);
                setError("");
            })
            .catch(() => setError("Could not read worktrees for this root"));
    }, [root]);

    useEffect(refresh, [refresh]);

    const create = useCallback(() => {
        const trimmed = name.trim();
        if (!root || trimmed === "" || busy) return;
        setBusy(true);
        void RpcApi.OSWorktreeCreateCommand(TabRpcClient, { repopath: root, name: trimmed })
            .then(() => {
                setName("");
                setError("");
            })
            .then(refresh)
            .catch((e) => setError(String(e)))
            .finally(() => setBusy(false));
    }, [root, name, busy, refresh]);

    const remove = useCallback(
        (path: string) => {
            if (!root || busy) return;
            setBusy(true);
            void RpcApi.OSWorktreeRemoveCommand(TabRpcClient, { repopath: root, path, force: true })
                .then(refresh)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
        },
        [root, busy, refresh]
    );

    const showWorktreeMenu = useCallback(
        (event: ReactMouseEvent, worktree: OSWorktree) => {
            const menu: ContextMenuItem[] = [
                {
                    label: "Copy path",
                    click: () => {
                        void navigator.clipboard.writeText(worktree.path);
                    },
                },
            ];
            if (!worktree.ismain) {
                menu.push(
                    { type: "separator" },
                    { label: "Remove worktree", enabled: !busy, click: () => remove(worktree.path) }
                );
            }
            ContextMenuModel.getInstance().showContextMenu(menu, event);
        },
        [busy, remove]
    );

    if (!root) return null;

    return (
        <section>
            <header>
                <div>
                    <strong>Worktrees</strong>
                    <span>Parallel agent environments · {root.split("/").pop()}</span>
                </div>
                <SystemButton type="button" size="small" onClick={refresh} aria-label="Refresh worktrees">
                    <RefreshCw aria-hidden="true" />
                </SystemButton>
            </header>
            {error && <p className="os-control-error" role="alert">{error}</p>}
            <div className="os-grant-list">
                {worktrees.map((worktree) => (
                    <div key={worktree.path} onContextMenu={(event) => showWorktreeMenu(event, worktree)}>
                        <GitBranch aria-hidden="true" />
                        <span className={cn("os-permission-dot", worktree.ismain ? "is-granted" : "is-unknown")} />
                        <span>
                            <strong>{worktree.branch || worktree.name}</strong>
                            <small>{worktree.ismain ? "main checkout" : worktree.name}</small>
                        </span>
                        {!worktree.ismain && (
                            <button type="button" onClick={() => remove(worktree.path)} disabled={busy}>
                                Remove
                            </button>
                        )}
                    </div>
                ))}
            </div>
            <div className="os-control-feature">
                <span>
                    <strong>New worktree</strong>
                    <small>Creates a kronterm/&lt;name&gt; branch and checkout</small>
                </span>
                <div className="os-worktree-create">
                    <input
                        type="text"
                        aria-label="Worktree name"
                        placeholder="agent-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") create();
                        }}
                    />
                    <SystemButton type="button" size="small" onClick={create} disabled={busy || name.trim() === ""}>
                        Add
                    </SystemButton>
                </div>
            </div>
        </section>
    );
}

function osChangeAbsolutePath(root: string, path: string): string {
    return root.endsWith("/") ? root + path : root + "/" + path;
}

export function OSWorktreeChangesSection({ root }: { root: string }) {
    const [changes, setChanges] = useState<OSWorktreeChange[]>([]);
    const [openPath, setOpenPath] = useState("");
    const [diff, setDiff] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const [loading, setLoading] = useState(true);
    const changesRequest = useRef(0);
    const diffRequest = useRef(0);

    const refresh = useCallback(() => {
        const request = ++changesRequest.current;
        if (!root) {
            setChanges([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        void RpcApi.OSWorktreeChangesCommand(TabRpcClient, root)
            .then((result) => {
                if (request !== changesRequest.current) return;
                setChanges(result ?? []);
            })
            .catch(() => {
                if (request !== changesRequest.current) return;
                setError("Could not read changes for this root. Retry with Refresh changes.");
            })
            .finally(() => {
                if (request === changesRequest.current) setLoading(false);
            });
    }, [root]);

    useEffect(() => {
        setChanges([]);
        setOpenPath("");
        setDiff("");
        refresh();
        return () => {
            changesRequest.current++;
            diffRequest.current++;
        };
    }, [refresh]);

    const toggleDiff = useCallback(
        (path: string) => {
            const request = ++diffRequest.current;
            if (openPath === path) {
                setOpenPath("");
                setDiff("");
                return;
            }
            setOpenPath(path);
            setDiff("Loading diff…");
            void RpcApi.OSWorktreeFileDiffCommand(TabRpcClient, { repopath: root, path })
                .then((result) => {
                    if (request === diffRequest.current) setDiff(result || "No diff");
                })
                .catch(() => {
                    if (request === diffRequest.current) setDiff("Could not load diff. Close and reopen this file to retry.");
                });
        },
        [root, openPath]
    );

    const act = useCallback(
        (action: "revert" | "stage", path: string) => {
            if (!root || busy) return;
            setBusy(true);
            const selectedDiffRequest = diffRequest.current;
            const call = action === "revert" ? RpcApi.OSWorktreeFileRevertCommand : RpcApi.OSWorktreeFileStageCommand;
            void call(TabRpcClient, { repopath: root, path })
                .then(() => {
                    if (openPath === path && selectedDiffRequest === diffRequest.current) {
                        diffRequest.current++;
                        setOpenPath("");
                        setDiff("");
                    }
                    setError("");
                })
                .then(refresh)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
        },
        [root, busy, openPath, refresh]
    );

    const showChangeMenu = useCallback(
        (event: ReactMouseEvent, change: OSWorktreeChange) => {
            ContextMenuModel.getInstance().showContextMenu(
                [
                    {
                        label: "Copy diff",
                        enabled: !busy,
                        click: () => {
                            void RpcApi.OSWorktreeFileDiffCommand(TabRpcClient, { repopath: root, path: change.path }).then((diff) => {
                                void navigator.clipboard.writeText(diff);
                            });
                        },
                    },
                    { type: "separator" },
                    { label: "Accept (stage)", enabled: !busy, click: () => act("stage", change.path) },
                    { label: "Discard changes", enabled: !busy, click: () => act("revert", change.path) },
                ] satisfies ContextMenuItem[],
                event
            );
        },
        [root, busy, act]
    );

    if (!root) return null;

    return (
        <section>
            <header>
                <div>
                    <strong>Changes</strong>
                    <span>
                        {loading ? "Reading changes" : error ? "Changes unavailable" : `${changes.length} uncommitted`} · {root.split("/").pop()}
                    </span>
                </div>
                <SystemButton type="button" size="small" onClick={refresh} aria-label="Refresh changes">
                    <RefreshCw aria-hidden="true" />
                </SystemButton>
            </header>
            {error && <p className="os-control-error" role="alert">{error}</p>}
            <div className="os-grant-list" aria-busy={loading}>
                {loading && <p role="status">Reading uncommitted changes…</p>}
                {!loading && !error && changes.length === 0 && (
                    <p>No uncommitted changes. Agent edits appear here for review.</p>
                )}
                {changes.map((change) => (
                    <div key={change.path} onContextMenu={(event) => showChangeMenu(event, change)}>
                        <button
                            type="button"
                            className="os-change-row"
                            aria-expanded={openPath === change.path}
                            draggable
                            onDragStart={(event) => {
                                const absolute = osChangeAbsolutePath(root, change.path);
                                event.dataTransfer.setData("application/x-hermes-paths", JSON.stringify([{ path: absolute }]));
                                event.dataTransfer.setData("text/plain", absolute);
                            }}
                            onClick={() => toggleDiff(change.path)}
                        >
                            <span className={cn("os-permission-dot", change.status === "deleted" ? "is-denied" : change.status === "added" ? "is-granted" : "is-unknown")} />
                            <span>
                                <strong>{change.path}</strong>
                                <small>
                                    {change.status}
                                    {change.insertions + change.deletions > 0 ? ` · +${change.insertions} / -${change.deletions}` : ""}
                                </small>
                            </span>
                        </button>
                        {openPath === change.path && (
                            <div className="os-change-actions">
                                <SystemButton type="button" size="small" onClick={() => act("stage", change.path)} disabled={busy}>
                                    Accept
                                </SystemButton>
                                <SystemButton type="button" size="small" onClick={() => act("revert", change.path)} disabled={busy}>
                                    Discard
                                </SystemButton>
                            </div>
                        )}
                        {openPath === change.path && <pre className="os-diff-view">{diff}</pre>}
                    </div>
                ))}
            </div>
        </section>
    );
}

function OSAutomationsSection({ spaceId }: { spaceId: string }) {
    const [automations, setAutomations] = useState<OSAutomation[]>([]);
    const [draft, setDraft] = useState({ name: "", schedule: "@daily", prompt: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        if (!spaceId) {
            setAutomations([]);
            return;
        }
        void RpcApi.OSAutomationListCommand(TabRpcClient, spaceId)
            .then((result) => {
                setAutomations(result ?? []);
                setError("");
            })
            .catch(() => setError("Could not read automations for this space"));
    }, [spaceId]);

    useEffect(refresh, [refresh]);

    const save = useCallback(
        (next: OSAutomation[]) => {
            if (!spaceId || busy) return;
            setBusy(true);
            void RpcApi.OSAutomationSaveCommand(TabRpcClient, { spaceid: spaceId, automations: next })
                .then((result) => {
                    setAutomations(result ?? []);
                    setError("");
                })
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
        },
        [spaceId, busy]
    );

    const runNow = useCallback(
        (id: string) => {
            if (!spaceId || busy) return;
            setBusy(true);
            void RpcApi.OSAutomationRunCommand(TabRpcClient, { spaceid: spaceId, automationid: id })
                .then(refresh)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
        },
        [spaceId, busy, refresh]
    );

    const add = useCallback(() => {
        const name = draft.name.trim();
        if (!spaceId || busy || name === "") return;
        const next = [...automations, { id: "", name, schedule: draft.schedule, prompt: draft.prompt.trim(), enabled: true, lastrunts: 0 }];
        setDraft({ name: "", schedule: draft.schedule, prompt: "" });
        void save(next);
    }, [spaceId, busy, automations, draft, save]);

    const toggle = useCallback(
        (id: string) => {
            void save(automations.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)));
        },
        [automations, save]
    );

    const remove = useCallback(
        (id: string) => {
            void save(automations.filter((item) => item.id !== id));
        },
        [automations, save]
    );

    if (!spaceId) return null;

    return (
        <section>
            <header>
                <div>
                    <strong>Automations</strong>
                    <span>Scheduled agent prompts for this space</span>
                </div>
                <SystemButton type="button" size="small" onClick={refresh} aria-label="Refresh automations">
                    <RefreshCw aria-hidden="true" />
                </SystemButton>
            </header>
            {error && <p className="os-control-error" role="alert">{error}</p>}
            <div className="os-grant-list">
                {automations.length === 0 && <p>No automations. Schedule a recurring agent prompt below.</p>}
                {automations.map((item) => (
                    <div key={item.id}>
                        <CalendarClock aria-hidden="true" />
                        <span>
                            <strong>{item.name}</strong>
                            <small>
                                {item.schedule} · {item.enabled ? "on" : "off"}
                            </small>
                        </span>
                        <div className="os-change-actions">
                            <SystemButton type="button" size="small" onClick={() => runNow(item.id)} disabled={busy}>
                                Run
                            </SystemButton>
                            <SystemButton type="button" size="small" onClick={() => toggle(item.id)} disabled={busy}>
                                {item.enabled ? "Pause" : "Resume"}
                            </SystemButton>
                            <SystemButton type="button" size="small" onClick={() => remove(item.id)} disabled={busy}>
                                Delete
                            </SystemButton>
                        </div>
                    </div>
                ))}
            </div>
            <div className="os-automation-add">
                <input
                    type="text"
                    aria-label="Automation name"
                    placeholder="e.g. Nightly triage"
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") add();
                    }}
                />
                <div className="os-automation-add-row">
                    <select aria-label="Schedule" value={draft.schedule} onChange={(event) => setDraft({ ...draft, schedule: event.target.value })}>
                        <option value="@15m">Every 15 minutes</option>
                        <option value="@hourly">Hourly</option>
                        <option value="@daily">Daily</option>
                        <option value="@weekly">Weekly</option>
                    </select>
                    <input
                        type="text"
                        aria-label="Automation prompt"
                        placeholder="Agent prompt…"
                        value={draft.prompt}
                        onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
                    />
                    <SystemButton type="button" size="small" onClick={add} disabled={busy || draft.name.trim() === ""}>
                        Add
                    </SystemButton>
                </div>
            </div>
        </section>
    );
}

function OSWorkspaceScriptsSection({ spaceId }: { spaceId: string }) {
    const [scripts, setScripts] = useState<OSWorkspaceScript[]>([]);
    const [draft, setDraft] = useState({ stage: "setup", command: "" });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(() => {
        if (!spaceId) {
            setScripts([]);
            return;
        }
        void RpcApi.OSWorkspaceScriptListCommand(TabRpcClient, spaceId)
            .then((result) => {
                setScripts(result ?? []);
                setError("");
            })
            .catch(() => setError("Could not read lifecycle scripts"));
    }, [spaceId]);

    useEffect(refresh, [refresh]);

    const save = useCallback(
        (next: OSWorkspaceScript[]) => {
            if (!spaceId || busy) return;
            setBusy(true);
            void RpcApi.OSWorkspaceScriptSaveCommand(TabRpcClient, { spaceid: spaceId, scripts: next })
                .then((result) => {
                    setScripts(result ?? []);
                    setError("");
                })
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
        },
        [spaceId, busy]
    );

    const runScript = useCallback(
        (id: string) => {
            if (!spaceId || busy) return;
            setBusy(true);
            void RpcApi.OSWorkspaceScriptRunCommand(TabRpcClient, { spaceid: spaceId, scriptid: id })
                .then((result) => {
                    if (!result.ok) throw new Error(`Script exited with code ${result.exitcode}`);
                    setError("");
                })
                .then(refresh)
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
        },
        [spaceId, busy, refresh]
    );

    const add = useCallback(() => {
        const command = draft.command.trim();
        if (!spaceId || busy || command === "") return;
        const next = [...scripts, { id: "", stage: draft.stage, command }];
        setDraft({ stage: draft.stage, command: "" });
        void save(next);
    }, [spaceId, busy, scripts, draft, save]);

    const remove = useCallback(
        (id: string) => {
            void save(scripts.filter((item) => item.id !== id));
        },
        [scripts, save]
    );

    if (!spaceId) return null;

    return (
        <section>
            <header>
                <div>
                    <strong>Lifecycle scripts</strong>
                    <span>Runs with sh in the first workspace root</span>
                </div>
                <SystemButton type="button" size="small" onClick={refresh} aria-label="Refresh lifecycle scripts">
                    <RefreshCw aria-hidden="true" />
                </SystemButton>
            </header>
            {error && <p className="os-control-error" role="alert">{error}</p>}
            <div className="os-grant-list">
                {scripts.length === 0 && <p>No lifecycle scripts. Setup, teardown, and run commands show up here.</p>}
                {scripts.map((item) => (
                    <div key={item.id}>
                        <History aria-hidden="true" />
                        <span>
                            <strong>{item.stage}</strong>
                            <small>{item.command}</small>
                        </span>
                        <div className="os-change-actions">
                            <SystemButton type="button" size="small" onClick={() => runScript(item.id)} disabled={busy}>
                                Run
                            </SystemButton>
                            <SystemButton type="button" size="small" onClick={() => remove(item.id)} disabled={busy}>
                                Delete
                            </SystemButton>
                        </div>
                    </div>
                ))}
            </div>
            <div className="os-automation-add">
                <div className="os-automation-add-row">
                    <select aria-label="Stage" value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>
                        <option value="setup">Setup</option>
                        <option value="teardown">Teardown</option>
                        <option value="run">Run</option>
                    </select>
                    <input
                        type="text"
                        aria-label="Script command"
                        placeholder="npm install"
                        value={draft.command}
                        onChange={(event) => setDraft({ ...draft, command: event.target.value })}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") add();
                        }}
                    />
                    <SystemButton type="button" size="small" onClick={add} disabled={busy || draft.command.trim() === ""}>
                        Add
                    </SystemButton>
                </div>
            </div>
        </section>
    );
}

function OSControlCenter() {
    const model = OSSystemModel.getInstance();
    const profile = useAtomValue(model.profileAtom);
    const spaceId = useAtomValue(model.activeSpaceIdAtom);
    const grants = useAtomValue(model.grantsAtom);
    const nativeSurfaceV2Enabled = useAtomValue(getSettingsKeyAtom("feature:nativesurfacev2")) ?? false;
    const ambientOSEnabled = useAtomValue(getSettingsKeyAtom("feature:ambientos")) ?? false;
    const [hostPermissions, setHostPermissions] = useState<HostPermissionStatus>();
    const [permissionPending, setPermissionPending] = useState("");
    const appearance = useSystemAppearance();
    const connections = useAtomValue(atoms.allConnStatus);
    const reducedMotion = useAtomValue(atoms.prefersReducedMotionAtom);
    const [permissionError, setPermissionError] = useState("");
    const activeGrants = grants.filter((grant) => grant.revokedAt == null && (grant.expiresAt == null || grant.expiresAt > Date.now()));
    const refreshPermissions = useCallback(() => {
        void getApi()
            .getHostPermissionStatus()
            .then(setHostPermissions)
            .catch(() => setHostPermissions(undefined));
    }, []);

    useEffect(refreshPermissions, [refreshPermissions]);

    const requestPermission = useCallback(async (permission: "screen-capture" | "accessibility" | "microphone") => {
        setPermissionPending(permission);
        setPermissionError("");
        try {
            setHostPermissions(await getApi().requestHostPermission(permission));
        } catch {
            setPermissionError("Permission settings could not be opened. Try again or open macOS System Settings.");
        } finally {
            setPermissionPending("");
        }
    }, []);

    const addRoot = useCallback(async () => {
        const root = await getApi().selectDirectory();
        if (!root || profile.roots.includes(root)) return;
        await model.updateProfile({ ...profile, roots: [...profile.roots, root] });
    }, [model, profile]);

    const hostRows = [
        { id: "screen-capture" as const, label: "Screen Recording", status: hostPermissions?.screenCapture },
        { id: "accessibility" as const, label: "Accessibility", status: hostPermissions?.accessibility },
        { id: "microphone" as const, label: "Microphone", status: hostPermissions?.microphone },
    ];

    return (
        <div className="os-control-sections">
            <section>
                <header><div><strong>Appearance</strong><span>{appearance.colorScheme === "dark" ? "Dark" : "Light"} · follows your system</span></div></header>
                <div className="os-control-feature">
                    <span><strong>Accent color</strong><small>Used across KronTerm controls and selections</small></span>
                    <input type="color" aria-label="Accent color" defaultValue="#1677d2" onChange={(event) => {
                        const hex = event.target.value.slice(1);
                        applyCustomAccent(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
                    }} />
                </div>
                <div className="os-control-feature">
                    <span><strong>Reduce motion</strong><small>{appearance.reducedTransparency ? "Reduced transparency is also enabled" : "Limit motion across system surfaces"}</small></span>
                    <SystemToggle aria-label="Reduce motion" checked={reducedMotion} onCheckedChange={(checked) => void RpcApi.SetConfigCommand(TabRpcClient, { "window:reducedmotion": checked })} />
                </div>
            </section>
            <section>
                <header><div><strong>Connections</strong><span>{connections.filter((connection) => connection.status === "connected").length} connected hosts</span></div></header>
                <div className="os-connection-list">
                    {connections.map((connection) => <div key={connection.connection}><span className={cn("os-permission-dot", connection.status === "connected" ? "is-granted" : "is-unknown")} /><strong>{connection.connection || "Local"}</strong><span>{connection.status}</span></div>)}
                    <SystemButton type="button" size="small" onClick={() => void createBlock({ meta: { view: "waveconfig" } })}>Manage connections</SystemButton>
                </div>
            </section>
            <section>
                <header>
                    <div>
                        <strong>Host permissions</strong>
                        <span>macOS controls KronTerm itself</span>
                    </div>
                    <SystemButton
                        type="button"
                        size="small"
                        onClick={refreshPermissions}
                        aria-label="Refresh host permissions"
                    >
                        <RefreshCw aria-hidden="true" />
                    </SystemButton>
                </header>
                {permissionError && <p className="os-control-error" role="alert">{permissionError}</p>}
                <div className="os-permission-list">
                    {hostRows.map((permission) => (
                        <button
                            type="button"
                            key={permission.id}
                            onClick={() => void requestPermission(permission.id)}
                            disabled={permissionPending !== ""}
                        >
                            <span
                                className={cn(
                                    "os-permission-dot",
                                    permissionStatusClass(permission.status ?? "unknown")
                                )}
                            />
                            <span>
                                <strong>{permission.label}</strong>
                                <small>{permission.status?.replaceAll("-", " ") ?? "checking"}</small>
                            </span>
                            <ExternalLink aria-hidden="true" />
                        </button>
                    ))}
                </div>
                <div className="os-control-feature">
                    <span>
                        <strong>Live native capture</strong>
                        <small>Beta · uses smooth window media when Screen Recording is available</small>
                    </span>
                    <SystemToggle
                        checked={nativeSurfaceV2Enabled}
                        onCheckedChange={() =>
                            void RpcApi.SetConfigCommand(TabRpcClient, {
                                "feature:nativesurfacev2": !nativeSurfaceV2Enabled,
                            })
                        }
                        aria-label="Live native capture"
                    />
                </div>
                <div className="os-control-feature">
                    <span>
                        <strong>Ambient OS</strong>
                        <small>Beta · adds the Space Timeline and Artifact Shelf to Activity Center</small>
                    </span>
                    <SystemToggle
                        checked={ambientOSEnabled}
                        onCheckedChange={() =>
                            void RpcApi.SetConfigCommand(TabRpcClient, {
                                "feature:ambientos": !ambientOSEnabled,
                            })
                        }
                        aria-label="Ambient OS"
                    />
                </div>
            </section>

            <section>
                <header>
                    <div>
                        <strong>Agent grants</strong>
                        <span>KronTerm Agent access for this space</span>
                    </div>
                    <span>{activeGrants.length}</span>
                </header>
                <div className="os-grant-list">
                    {activeGrants.length === 0 && <p>No standing agent grants. Access is requested when needed.</p>}
                    {activeGrants.map((grant) => (
                        <div key={grant.id}>
                            <ShieldCheck aria-hidden="true" />
                            <span>
                                <strong>{CapabilityLabels[grant.capability] ?? grant.capability}</strong>
                                <small>
                                    {grant.scope} · {grant.resource || "all resources in scope"}
                                </small>
                            </span>
                            <button type="button" onClick={() => void model.revokeCapability(grant.id)}>
                                Revoke
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <OSWorktreesSection root={profile.roots[0] ?? ""} />

            <OSWorktreeChangesSection root={profile.roots[0] ?? ""} />

            <OSAutomationsSection spaceId={spaceId} />

            <OSWorkspaceScriptsSection spaceId={spaceId} />

            <section>
                <header>
                    <div>
                        <strong>Space restoration</strong>
                        <span>Sessions and native apps after restart</span>
                    </div>
                </header>
                <label className="os-restore-policy">
                    <Clock3 aria-hidden="true" />
                    <span>
                        <strong>Restore policy</strong>
                        <small>Smart reconnects live apps and resumes built-in sessions.</small>
                    </span>
                    <select
                        value={profile.restorePolicy}
                        onChange={(event) =>
                            void model.updateProfile({
                                ...profile,
                                restorePolicy: event.target.value as typeof profile.restorePolicy,
                            })
                        }
                    >
                        <option value="smart">Smart</option>
                        <option value="auto">Always</option>
                        <option value="manual">Manual</option>
                    </select>
                </label>
                <div className="os-space-roots">
                    {profile.roots.map((root) => (
                        <div key={root}>
                            <FolderOpen aria-hidden="true" />
                            <span title={root}>{root}</span>
                            <button
                                type="button"
                                onClick={() =>
                                    void model.updateProfile({
                                        ...profile,
                                        roots: profile.roots.filter((candidate) => candidate !== root),
                                    })
                                }
                                aria-label={`Remove ${root}`}
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                    <button type="button" className="os-add-root" onClick={() => void addRoot()}>
                        Add project root <ChevronRight aria-hidden="true" />
                    </button>
                </div>
            </section>
        </div>
    );
}

export function OSSystemCenterPanel({
    center,
    onClose,
    onFocusBlock,
    onPinResource,
}: {
    center: OSSystemCenter;
    onClose: () => void;
    onFocusBlock: (blockId: string) => void;
    onPinResource: (resource: OSResourceReference) => void;
}) {
    const panelRef = useRef<HTMLElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const launcher = document.activeElement as HTMLElement;
        return () => {
            const active = document.activeElement;
            if (launcher?.isConnected && (active === document.body || panelRef.current?.contains(active))) {
                launcher.focus();
            }
        };
    }, []);

    useEffect(() => {
        closeRef.current?.focus();
    }, [center]);

    return (
        <SystemPopover
            ref={panelRef}
            className={cn("os-system-center", `is-${center}`)}
            role="dialog"
            aria-label={`${center === "activity" ? "Activity" : "Control"} Center`}
            onKeyDown={(event) => {
                if (event.key !== "Escape" || event.defaultPrevented) return;
                event.preventDefault();
                event.stopPropagation();
                onClose();
            }}
        >
            <header className="os-system-center-header">
                <div>
                    {center === "activity" ? <Bell aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                    <span>
                        <strong>{center === "activity" ? "Activity Center" : "Control Center"}</strong>
                        <small>
                            {center === "activity" ? "Jobs, approvals, and recovery" : "Host and agent permissions"}
                        </small>
                    </span>
                </div>
                <SystemButton ref={closeRef} type="button" size="small" onClick={onClose} aria-label={`Close ${center} center`}>
                    <X aria-hidden="true" />
                </SystemButton>
            </header>
            {center === "activity" ? (
                <OSActivityCenter onFocusBlock={onFocusBlock} onPinResource={onPinResource} />
            ) : (
                <OSControlCenter />
            )}
        </SystemPopover>
    );
}

export type { OSSystemCenter };
