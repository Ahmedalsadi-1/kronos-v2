// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import { LayoutGrid, Plus } from "lucide-react";
import type { OSModeState } from "./os-workspace-model";

export function OSSpaceOverview({
    workspaces,
    currentWorkspaceId,
    state,
    onSwitch,
    onCreate,
}: {
    workspaces: Array<{ id: string; name: string }>;
    currentWorkspaceId: string;
    state: OSModeState;
    onSwitch: (id: string) => void;
    onCreate: () => void;
}) {
    const windows = state.zOrder.map((id) => state.windows[id]).filter(Boolean);
    const width = Math.max(1, ...windows.map((window) => window.bounds.x + window.bounds.width));
    const height = Math.max(1, ...windows.map((window) => window.bounds.y + window.bounds.height));

    return (
        <nav className="os-space-overview" aria-label="Project spaces">
            {workspaces.map((workspace, index) => {
                const active = workspace.id === currentWorkspaceId;
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
                            {active && windows.length > 0 ? (
                                windows.map((window) => (
                                    <span
                                        key={window.blockId}
                                        className="os-space-overview-window"
                                        style={{
                                            left: `${Math.max(0, window.bounds.x / width) * 84 + 4}%`,
                                            top: `${Math.max(0, window.bounds.y / height) * 78 + 4}%`,
                                            width: `${Math.min(92, (window.bounds.width / width) * 84)}%`,
                                            height: `${Math.min(88, (window.bounds.height / height) * 78)}%`,
                                            zIndex: window.zOrder,
                                        }}
                                    />
                                ))
                            ) : (
                                <LayoutGrid />
                            )}
                        </span>
                        <span className="os-space-overview-name">{workspace.name}</span>
                        <span className="os-space-overview-caption">
                            {active ? "Current space" : `Space ${index + 1}`}
                        </span>
                    </button>
                );
            })}
            <button type="button" className="os-space-overview-add" onClick={onCreate} aria-label="Create workspace">
                <Plus aria-hidden="true" />
                <span>New space</span>
            </button>
        </nav>
    );
}
