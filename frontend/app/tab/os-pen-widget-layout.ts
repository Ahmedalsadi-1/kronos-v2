// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PenWidgetSnapshot } from "./os-pen-widgets";
import type { OSModeState } from "./os-workspace-model";

export function applyPenWidgetLayout(state: OSModeState, snapshot: PenWidgetSnapshot): OSModeState {
    let windows = state.windows;
    for (const widget of snapshot.widgets) {
        const current = windows[widget.blockId];
        if (!current) continue;
        const { x, y, width, height } = widget;
        if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) continue;
        const bounds = { x, y, width, height };
        if (
            current.bounds.x === x &&
            current.bounds.y === y &&
            current.bounds.width === width &&
            current.bounds.height === height &&
            !!current.collapsed === !widget.visible
        )
            continue;
        if (windows === state.windows) windows = { ...windows };
        windows[widget.blockId] = { ...current, bounds, collapsed: !widget.visible };
    }
    const selectedWidget = snapshot.selectedBlockIds.find((id) => windows[id] && !windows[id].collapsed);
    const selectedEntityId = selectedWidget ?? (windows[state.selectedEntityId] ? undefined : state.selectedEntityId);
    if (windows === state.windows && selectedEntityId === state.selectedEntityId) return state;
    return { ...state, windows, selectedEntityId };
}
