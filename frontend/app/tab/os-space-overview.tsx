// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { AppIcon } from "@/app/components/app-icon";
import { ChevronLeft, ChevronRight, LayoutGrid, Plus, Settings2, X } from "@/app/components/system-ui/os-icons";
import { hasViewIcon, viewIconId } from "@/app/components/view-icons";
import { getApi } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { cn } from "@/util/util";
import { useEffect, useRef, useState, type RefObject } from "react";
import { makeInitialOSModeState, type OSModeState } from "./os-workspace-model";

type SpaceApp = { blockId: string; title: string; icon?: string; view?: string };
type SpacePreview = { state: OSModeState; titles: Record<string, string>; apps?: SpaceApp[]; unavailable?: boolean };
const SpaceSnapshots = new Map<string, string>();

// Cache only visited spaces in memory; previews never mount another workspace's live widgets.
export function useOSSpaceSnapshot(workspaceId: string, state: OSModeState, viewport: RefObject<HTMLDivElement>) {
    useEffect(() => {
        if (!workspaceId || state.scene.kind === "overview") return;
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            const rect = viewport.current?.getBoundingClientRect();
            if (!rect || rect.width < 1 || rect.height < 1) return;
            try {
                const blockId =
                    state.scene.kind === "focused"
                        ? state.scene.blockId
                        : state.zOrder.filter((id) => !state.windows[id]?.collapsed).at(-1);
                const blockRoot = blockId
                    ? document.querySelector<HTMLElement>(`div[data-blockid='${CSS.escape(blockId)}']`)
                    : null;
                const guest = blockRoot?.querySelector("webview") as Electron.WebviewTag;
                let data = "";
                if (guest) {
                    try {
                        data = (await getApi().captureBrowserPage({ guestId: guest.getWebContentsId() })).dataUrl;
                    } catch {
                        data = "";
                    }
                }
                if (!data && blockId) {
                    try {
                        data = await getApi().captureNativeHudBlock?.(blockId);
                    } catch {
                        data = "";
                    }
                }
                if (!data) {
                    const appRect = blockRoot?.getBoundingClientRect();
                    const bounds = appRect?.width > 0 && appRect?.height > 0 ? appRect : rect;
                    const shellInset = bounds === rect ? 56 : 0;
                    data = await getApi().captureScreenshot(
                        {
                            x: Math.round(bounds.x),
                            y: Math.round(bounds.y + shellInset),
                            width: Math.round(bounds.width),
                            height: Math.max(1, Math.round(bounds.height - shellInset)),
                        },
                        true
                    );
                }
                if (cancelled || !data) return;
                const image = new Image();
                image.onload = () => {
                    if (cancelled) return;
                    const canvas = document.createElement("canvas");
                    canvas.width = 640;
                    canvas.height = Math.max(1, Math.round((640 * image.height) / image.width));
                    const context = canvas.getContext("2d");
                    if (!context) return;
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    SpaceSnapshots.delete(workspaceId);
                    SpaceSnapshots.set(workspaceId, canvas.toDataURL("image/webp", 0.75));
                    if (SpaceSnapshots.size > 32) SpaceSnapshots.delete(SpaceSnapshots.keys().next().value);
                };
                image.src = data;
            } catch {
                // Metadata remains available when screenshot capture is unsupported.
            }
        }, 800);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [workspaceId, state, viewport]);
}

export function OSSpaceOverview({
    workspaces,
    currentWorkspaceId,
    state,
    blocks,
    onSwitch,
    onCreate,
    onConfigure,
    onDelete,
}: {
    workspaces: Array<{ id: string; name: string; tabId?: string }>;
    currentWorkspaceId: string;
    state: OSModeState;
    blocks: SpaceApp[];
    onSwitch: (id: string) => void;
    onCreate: () => void;
    onConfigure?: () => void;
    onDelete: (id: string) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [scrollState, setScrollState] = useState({ previous: false, next: false });
    const updateScroll = () => {
        const track = trackRef.current;
        if (track)
            setScrollState({
                previous: track.scrollLeft > 1,
                next: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
            });
    };
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const active = track.querySelector<HTMLElement>(".is-active");
        if (active)
            track.scrollLeft = Math.max(
                0,
                active.offsetLeft - track.offsetLeft - (track.clientWidth - active.offsetWidth) / 2
            );
        updateScroll();
        const observer = new ResizeObserver(updateScroll);
        observer.observe(track);
        return () => observer.disconnect();
    }, [workspaces, currentWorkspaceId]);
    const scroll = (direction: number) => {
        const track = trackRef.current;
        if (!track) return;
        track.scrollBy({
            left: direction * Math.max(220, track.clientWidth * 0.8),
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
    };
    const [previews, setPreviews] = useState<Record<string, SpacePreview>>({});
    useEffect(() => {
        let cancelled = false;
        void Promise.all(
            workspaces
                .filter((space) => space.id !== currentWorkspaceId && space.tabId)
                .map(async (space) => {
                    try {
                        const tab = await RpcApi.GetTabCommand(TabRpcClient, space.tabId);
                        const apps = await Promise.all(
                            (tab.blockids ?? []).map(async (id) => {
                                const meta = await RpcApi.GetMetaCommand(TabRpcClient, { oref: `block:${id}` });
                                const view = String(meta?.view || "");
                                return {
                                    blockId: id,
                                    title: String(meta?.["frame:title"] || view || "App"),
                                    view,
                                    icon: hasViewIcon(view) ? viewIconId(view) : undefined,
                                };
                            })
                        );
                        const titles = Object.fromEntries(apps.map((app) => [app.blockId, app.title]));
                        return [
                            space.id,
                            { state: makeInitialOSModeState(tab, tab.blockids ?? []), titles, apps },
                        ] as const;
                    } catch {
                        return [space.id, { state: null, titles: {}, unavailable: true }] as const;
                    }
                })
        ).then((entries) => {
            if (!cancelled) setPreviews(Object.fromEntries(entries));
        });
        return () => {
            cancelled = true;
        };
    }, [workspaces, currentWorkspaceId]);

    return (
        <nav className="os-space-overview" aria-label="Project spaces">
            <div className="os-space-overview-header">
                <div className="os-space-overview-heading">
                    <strong>Workspaces</strong>
                    <span>
                        {workspaces.length} {workspaces.length === 1 ? "space" : "spaces"}
                    </span>
                </div>
                <div className="os-space-overview-actions">
                    {onConfigure && (
                        <button
                            type="button"
                            onClick={onConfigure}
                            aria-label="Configure space bots"
                            title="Bot settings"
                        >
                            <Settings2 size={16} />
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={!scrollState.previous}
                        onClick={() => scroll(-1)}
                        aria-label="Previous workspaces"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        type="button"
                        disabled={!scrollState.next}
                        onClick={() => scroll(1)}
                        aria-label="Next workspaces"
                    >
                        <ChevronRight size={16} />
                    </button>
                    <button
                        type="button"
                        className="os-space-overview-create"
                        onClick={onCreate}
                        aria-label="Create workspace"
                    >
                        <Plus size={16} />
                        <span>New workspace</span>
                    </button>
                </div>
            </div>
            <div className="os-space-overview-track" ref={trackRef} onScroll={updateScroll}>
                {workspaces.map((workspace, index) => {
                    const active = workspace.id === currentWorkspaceId;
                    const preview: SpacePreview = active
                        ? {
                              state,
                              titles: Object.fromEntries(blocks.map((block) => [block.blockId, block.title])),
                              apps: blocks,
                          }
                        : previews[workspace.id];
                    const apps = preview?.apps ?? [];
                    const snapshot = SpaceSnapshots.get(workspace.id);
                    const windows = preview?.state?.zOrder.map((id) => preview.state.windows[id]).filter(Boolean) ?? [];
                    const left = Math.min(0, ...windows.map((window) => window.bounds.x));
                    const top = Math.min(0, ...windows.map((window) => window.bounds.y));
                    const width = Math.max(1, ...windows.map((window) => window.bounds.x + window.bounds.width)) - left;
                    const height =
                        Math.max(1, ...windows.map((window) => window.bounds.y + window.bounds.height)) - top;
                    return (
                        <div key={workspace.id} className={cn("os-space-overview-card", active && "is-active")}>
                            <button
                                type="button"
                                className="os-space-overview-item"
                                aria-current={active ? "page" : undefined}
                                aria-label={`Switch to ${workspace.name}`}
                                onClick={() => onSwitch(workspace.id)}
                            >
                                <span className="os-space-overview-preview" aria-hidden="true">
                                    {snapshot ? (
                                        <img
                                            className="os-space-overview-snapshot"
                                            src={snapshot}
                                            alt=""
                                            draggable={false}
                                        />
                                    ) : windows.length > 0 ? (
                                        windows.map((window) => (
                                            <span
                                                key={window.blockId}
                                                className="os-space-overview-window"
                                                style={{
                                                    left: `${((window.bounds.x - left) / width) * 84 + 4}%`,
                                                    top: `${((window.bounds.y - top) / height) * 78 + 4}%`,
                                                    width: `${Math.min(92, (window.bounds.width / width) * 84)}%`,
                                                    height: `${Math.min(88, (window.bounds.height / height) * 78)}%`,
                                                    zIndex: window.zOrder,
                                                }}
                                            >
                                                <span className="os-space-overview-window-bar">
                                                    <AppIcon
                                                        icon={apps.find((app) => app.blockId === window.blockId)?.icon}
                                                        size={12}
                                                    />
                                                    <span>{preview.titles[window.blockId] || "App"}</span>
                                                </span>
                                                <span className="os-space-overview-window-body">
                                                    <AppIcon
                                                        icon={apps.find((app) => app.blockId === window.blockId)?.icon}
                                                        size={24}
                                                    />
                                                </span>
                                            </span>
                                        ))
                                    ) : (
                                        <LayoutGrid />
                                    )}
                                </span>
                                {active && <span className="os-space-overview-current">Current</span>}
                                <span className="os-space-overview-name">{workspace.name}</span>
                                <span className="os-space-overview-caption">
                                    <span className="os-space-overview-apps" aria-hidden="true">
                                        {apps.slice(0, 3).map((app) => (
                                            <AppIcon key={app.blockId} icon={app.icon} size={20} />
                                        ))}
                                    </span>
                                    <span>
                                        {preview?.unavailable
                                            ? "Preview unavailable"
                                            : preview
                                              ? `${apps.length} ${apps.length === 1 ? "app" : "apps"}`
                                              : `Space ${index + 1}`}
                                    </span>
                                </span>
                            </button>
                            <button
                                type="button"
                                className="os-space-overview-delete"
                                aria-label={`Delete ${workspace.name}`}
                                title={`Delete ${workspace.name}`}
                                onClick={() => onDelete(workspace.id)}
                            >
                                <X size={14} aria-hidden="true" />
                            </button>
                        </div>
                    );
                })}
            </div>
        </nav>
    );
}
