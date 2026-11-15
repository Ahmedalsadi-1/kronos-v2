// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PenWidgetGeometry } from "./os-pen-widgets";
import type { OSModeState } from "./os-workspace-model";

export function keepKronOSV2View(current: OSModeState, next: OSModeState, fromViewSelector: boolean): OSModeState {
    if (current.view !== "kronos-v2" || next.view === current.view || fromViewSelector) return next;
    return { ...next, view: current.view };
}

export function getKronOSV2Widget(state: OSModeState, blockId: string): PenWidgetGeometry | undefined {
    const window = state.windows[blockId];
    if (!window) return;
    return state.kronosV2Widgets?.[blockId] ?? { blockId, ...window.bounds, visible: !window.collapsed };
}

export function updateKronOSV2Widgets(
    current: Record<string, PenWidgetGeometry>,
    widgets: PenWidgetGeometry[]
): Record<string, PenWidgetGeometry> {
    let next = current ?? {};
    for (const widget of widgets) {
        const previous = next[widget.blockId];
        if (
            previous?.x === widget.x &&
            previous.y === widget.y &&
            previous.width === widget.width &&
            previous.height === widget.height &&
            previous.visible === widget.visible
        )
            continue;
        if (next === current) next = { ...current };
        next[widget.blockId] = widget;
    }
    return next;
}
