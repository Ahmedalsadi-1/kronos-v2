// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, SystemPopover } from "@/app/components/system-ui";
import { getApi } from "@/store/global";
import type { NativeTaskGroup, NativeTaskGroupAction } from "@/types/native-task-groups";
import { Layers, X } from "@/app/components/system-ui/os-icons";
import { useEffect, useRef, useState } from "react";

export function OSNativeTaskGroups() {
    const [open, setOpen] = useState(false);
    const [groups, setGroups] = useState<NativeTaskGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [pending, setPending] = useState(false);
    const [preview, setPreview] = useState<{
        key: string;
        label: string;
        loading: boolean;
        imageDataUrl?: string;
        error?: string;
    }>(null);
    const previewRequest = useRef(0);
    const closePanel = () => {
        previewRequest.current++;
        setPreview(null);
        setOpen(false);
    };
    useEffect(
        () => () => {
            previewRequest.current++;
        },
        []
    );
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const refresh = async () => {
        const result = await getApi().manageNativeTaskGroups({ operation: "list" });
        if (result.success === false) throw new Error(result.error.message);
        if (!("workspaces" in result.data)) throw new Error("Invalid task group list.");
        setGroups(result.data.workspaces);
    };
    useEffect(() => {
        if (!open) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const update = async () => {
            try {
                const result = await getApi().manageNativeTaskGroups({ operation: "list" });
                if (disposed) return;
                if (result.success === false) throw new Error(result.error.message);
                if (!("workspaces" in result.data)) throw new Error("Invalid task group list.");
                setGroups(result.data.workspaces);
                setError("");
            } catch (cause) {
                if (!disposed) setError(cause instanceof Error ? cause.message : "Task groups unavailable.");
            } finally {
                if (!disposed) {
                    setLoading(false);
                    timer = setTimeout(update, 3000);
                }
            }
        };
        setLoading(true);
        void update();
        const close = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            closePanel();
            trigger.current?.focus();
        };
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) closePanel();
        };
        document.addEventListener("keydown", close);
        document.addEventListener("pointerdown", outside);
        return () => {
            disposed = true;
            clearTimeout(timer);
            document.removeEventListener("keydown", close);
            document.removeEventListener("pointerdown", outside);
        };
    }, [open]);
    const previewWindows = async (group: NativeTaskGroup, bundleId: string, label: string) => {
        const request = ++previewRequest.current;
        const key = `${group.sessionId}:${bundleId}`;
        setPreview({ key, label, loading: true });
        try {
            const result = await getApi().manageNativeTaskGroups({
                operation: "preview",
                sessionId: group.sessionId,
                bundleId,
            });
            if (request !== previewRequest.current) return;
            if (result.success === false) throw new Error(result.error.message);
            if (!("imageDataUrl" in result.data) || !result.data.imageDataUrl) {
                const reason = "captureUnavailable" in result.data ? result.data.captureUnavailable : null;
                throw new Error(reason || "No window preview is available.");
            }
            if (!result.data.imageDataUrl.startsWith("data:image/png;base64,")) {
                throw new Error("The window preview format is unavailable.");
            }
            setPreview({ key, label, loading: false, imageDataUrl: result.data.imageDataUrl });
        } catch (cause) {
            if (request !== previewRequest.current) return;
            setPreview({
                key,
                label,
                loading: false,
                error: cause instanceof Error ? cause.message : "Window preview unavailable.",
            });
        }
    };
    const perform = async (action: NativeTaskGroupAction) => {
        previewRequest.current++;
        setPreview(null);
        setPending(true);
        setError("");
        try {
            const result = await getApi().manageNativeTaskGroups(action);
            if (result.success === false) throw new Error(result.error.message);
            await refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Task group operation failed.");
        } finally {
            setPending(false);
        }
    };
    return (
        <div ref={root} className="relative">
            <SystemButton
                ref={trigger}
                type="button"
                size="small"
                selected={open}
                aria-label="Native agent task groups"
                aria-expanded={open}
                aria-controls="os-native-task-groups"
                onClick={() => {
                    if (open) closePanel();
                    else setOpen(true);
                }}
            >
                <Layers aria-hidden="true" />
            </SystemButton>
            {open && (
                <SystemPopover
                    id="os-native-task-groups"
                    aria-label="Native agent task groups"
                    className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(650px,75vh)] w-[min(440px,calc(100vw-32px))] flex-col gap-3 overflow-y-auto p-4 text-[13px]"
                >
                    <header className="flex items-center justify-between gap-3">
                        <strong>Agent Spaces</strong>
                        <SystemButton
                            type="button"
                            size="small"
                            aria-label="Close task groups"
                            onClick={() => {
                                closePanel();
                                trigger.current?.focus();
                            }}
                        >
                            <X aria-hidden="true" />
                        </SystemButton>
                    </header>
                    <p className="text-[12px]">
                        Native tasks run on a dedicated background display. Agents control only enrolled windows; apps
                        still share your macOS login.
                    </p>
                    {error && <p role="alert">{error}</p>}
                    {loading && <p role="status">Loading task groups…</p>}
                    {!loading && groups.length === 0 && (
                        <p>
                            No native task groups in this workspace. Groups appear when an agent starts a native
                            background task.
                        </p>
                    )}
                    {groups.map((group) => (
                        <section
                            key={group.sessionId}
                            aria-label={group.taskId}
                            className="flex flex-col gap-2 rounded-lg border border-current/20 p-3"
                        >
                            <div className="flex justify-between gap-2">
                                <strong className="break-all">{group.taskId}</strong>
                                <span>
                                    {group.released
                                        ? "Released"
                                        : group.paused
                                          ? "Paused"
                                          : group.busy
                                            ? "Working"
                                            : "Ready"}
                                </span>
                            </div>
                            <p className="text-[11px]">
                                Assigned Space {group.spaceIds?.join(", ") || "pending"} · Display{" "}
                                {group.displayIds?.join(", ") || "pending"}
                            </p>
                            {!group.apps.length && <p>No apps launched.</p>}
                            {group.apps.map((app) => (
                                <div key={app.bundleId} className="flex flex-col gap-2 border-t border-current/15 pt-2">
                                    <span className="break-all">{app.name || app.bundleId}</span>
                                    <span className="text-[11px]">
                                        {app.enrolledWindowIds?.length ?? 0} enrolled windows
                                    </span>
                                    {app.blockedReason && (
                                        <p role="status" className="text-[12px]">
                                            {app.blockedReason}
                                        </p>
                                    )}
                                    {app.availableWindows?.map((window) => {
                                        const enrolled = app.enrolledWindowIds?.includes(window.windowId);
                                        return (
                                            <div
                                                key={window.windowId}
                                                className="flex items-center justify-between gap-2"
                                            >
                                                <span className="min-w-0 break-words text-[12px]">
                                                    {window.title || `Window ${window.windowId}`} ·{" "}
                                                    {enrolled ? "Enrolled" : "Needs approval"}
                                                    <span className="block text-[11px]">
                                                        Space {window.spaceIds?.join(", ") || "unavailable"} · Display{" "}
                                                        {window.displayIds?.join(", ") || "unavailable"}
                                                    </span>
                                                </span>
                                                {!enrolled && (
                                                    <SystemButton
                                                        type="button"
                                                        disabled={pending || group.busy}
                                                        onClick={() =>
                                                            void perform({
                                                                operation: "approve_window",
                                                                sessionId: group.sessionId,
                                                                bundleId: app.bundleId,
                                                                windowId: window.windowId,
                                                            })
                                                        }
                                                    >
                                                        Allow window
                                                    </SystemButton>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {app.enrolledWindowIds
                                        ?.filter(
                                            (id) =>
                                                app.inventoryVerified !== false &&
                                                !app.availableWindows?.some((window) => window.windowId === id)
                                        )
                                        .map((id) => (
                                            <SystemButton
                                                key={id}
                                                type="button"
                                                disabled={pending || group.busy}
                                                onClick={() =>
                                                    void perform({
                                                        operation: "remove_window",
                                                        sessionId: group.sessionId,
                                                        bundleId: app.bundleId,
                                                        windowId: id,
                                                    })
                                                }
                                            >
                                                Remove closed window {id}
                                            </SystemButton>
                                        ))}
                                    <SystemButton
                                        type="button"
                                        disabled={pending || group.busy || preview?.loading}
                                        onClick={() =>
                                            void previewWindows(group, app.bundleId, app.name || app.bundleId)
                                        }
                                    >
                                        Preview windows
                                    </SystemButton>
                                    {preview?.key === `${group.sessionId}:${app.bundleId}` && (
                                        <div className="flex flex-col gap-2">
                                            {preview.loading && <p role="status">Loading window preview…</p>}
                                            {preview.error && <p role="alert">{preview.error}</p>}
                                            {preview.imageDataUrl && (
                                                <img
                                                    src={preview.imageDataUrl}
                                                    alt={`${preview.label} enrolled windows`}
                                                    className="h-auto w-full rounded-md border border-current/15 object-contain"
                                                />
                                            )}
                                        </div>
                                    )}
                                    <SystemButton
                                        type="button"
                                        disabled={pending || group.busy}
                                        onClick={() =>
                                            void perform({
                                                operation: "reveal",
                                                sessionId: group.sessionId,
                                                bundleId: app.bundleId,
                                            })
                                        }
                                    >
                                        Review app · pause agent
                                    </SystemButton>
                                    {group.paused && group.desktop && !group.released && (
                                        <SystemButton
                                            type="button"
                                            disabled={pending || group.busy}
                                            onClick={() =>
                                                void perform({
                                                    operation: "return_windows",
                                                    sessionId: group.sessionId,
                                                    bundleId: app.bundleId,
                                                })
                                            }
                                        >
                                            Return to agent desktop
                                        </SystemButton>
                                    )}
                                </div>
                            ))}
                            <div className="flex flex-wrap gap-2">
                                {!group.paused && (
                                    <SystemButton
                                        type="button"
                                        disabled={pending || group.busy}
                                        onClick={() => void perform({ operation: "pause", sessionId: group.sessionId })}
                                    >
                                        Pause
                                    </SystemButton>
                                )}
                                {!group.released && (
                                    <SystemButton
                                        type="button"
                                        disabled={pending || group.busy}
                                        onClick={() =>
                                            void perform({ operation: "finish", sessionId: group.sessionId })
                                        }
                                    >
                                        Release group
                                    </SystemButton>
                                )}
                            </div>
                            <p className="text-[11px]">
                                Release ends agent access and leaves apps open. Review pauses automation until the agent
                                explicitly resumes.
                            </p>
                        </section>
                    ))}
                </SystemPopover>
            )}
        </div>
    );
}
