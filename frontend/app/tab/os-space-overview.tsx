// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { cn } from "@/util/util";
import { LayoutGrid, Plus, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { makeInitialOSModeState, type OSModeState } from "./os-workspace-model";

type SpacePreview = { state: OSModeState; titles: Record<string, string>; unavailable?: boolean };

export function OSSpaceOverview({
    workspaces,
    currentWorkspaceId,
    state,
    blocks,
    onSwitch,
    onCreate,
    onConfigure,
}: {
    workspaces: Array<{ id: string; name: string; tabId?: string }>;
    currentWorkspaceId: string;
    state: OSModeState;
    blocks: Array<{ blockId: string; title: string }>;
    onSwitch: (id: string) => void;
    onCreate: () => void;
    onConfigure?: () => void;
}) {
    const [previews, setPreviews] = useState<Record<string, SpacePreview>>({});
    useEffect(() => {
        let cancelled = false;
        void Promise.all(
            workspaces
                .filter((space) => space.id !== currentWorkspaceId && space.tabId)
                .map(async (space) => {
                    try {
                        const tab = await RpcApi.GetTabCommand(TabRpcClient, space.tabId);
                        const titles = Object.fromEntries(
                            await Promise.all(
                                (tab.blockids ?? []).map(async (id) => {
                                    const meta = await RpcApi.GetMetaCommand(TabRpcClient, { oref: `block:${id}` });
                                    return [id, String(meta?.["frame:title"] || meta?.view || "App")];
                                })
                            )
                        );
                        return [space.id, { state: makeInitialOSModeState(tab, tab.blockids ?? []), titles }] as const;
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
            {workspaces.map((workspace, index) => {
                const active = workspace.id === currentWorkspaceId;
                const preview: SpacePreview = active
                    ? { state, titles: Object.fromEntries(blocks.map((block) => [block.blockId, block.title])) }
                    : previews[workspace.id];
                const windows = preview?.state?.zOrder.map((id) => preview.state.windows[id]).filter(Boolean) ?? [];
                const left = Math.min(0, ...windows.map((window) => window.bounds.x));
                const top = Math.min(0, ...windows.map((window) => window.bounds.y));
                const width = Math.max(1, ...windows.map((window) => window.bounds.x + window.bounds.width)) - left;
                const height = Math.max(1, ...windows.map((window) => window.bounds.y + window.bounds.height)) - top;
                return (
                    <button
                        type="button"
                        key={workspace.id}
                        className={cn("os-space-overview-item", active && "is-active")}
                        aria-current={active ? "page" : undefined}
                        aria-label={`Switch to ${workspace.name}`}
                        onClick={() => onSwitch(workspace.id)}
                    >
                        <span className="os-space-overview-preview" aria-hidden="true">
                            {windows.length > 0 ? (
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
                                        {preview.titles[window.blockId] || "App"}
                                    </span>
                                ))
                            ) : (
                                <LayoutGrid />
                            )}
                        </span>
                        <span className="os-space-overview-name">{workspace.name}</span>
                        <span className="os-space-overview-caption">
                            {active
                                ? `${windows.length} apps · Current space`
                                : preview?.unavailable
                                  ? "Preview unavailable"
                                  : preview
                                    ? `${windows.length} apps`
                                    : `Space ${index + 1}`}
                        </span>
                    </button>
                );
            })}
            <button type="button" className="os-space-overview-add" onClick={onCreate} aria-label="Create workspace">
                <Plus aria-hidden="true" />
                <span>New space</span>
            </button>
            {onConfigure && (
                <button
                    type="button"
                    className="os-space-overview-add"
                    onClick={onConfigure}
                    aria-label="Configure space bots"
                >
                    <Settings2 aria-hidden="true" />
                    <span>Bot settings</span>
                </button>
            )}
        </nav>
    );
}
