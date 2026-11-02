// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { WorkflowCamera } from "./os-workflow-host";
import { reduceOSModeState, type OSModeState } from "./os-workspace-model";

type Rect = { x: number; y: number; width: number; height: number };

export function activateOSWorkflowCanvas(state: OSModeState): OSModeState {
    return { ...reduceOSModeState(state, { type: "spatial.freeform" }), view: "canvas" };
}

export function keepWorkflowNodeVisible(
    camera: WorkflowCamera,
    node: Rect,
    viewport: { width: number; height: number }
) {
    const padding = 32;
    const topPadding = 72;
    if (viewport.width <= padding * 2 || viewport.height <= topPadding + padding) return camera;
    const left = node.x * camera.zoom + camera.x;
    const top = node.y * camera.zoom + camera.y;
    const width = node.width * camera.zoom;
    const height = node.height * camera.zoom;
    const shift = (start: number, length: number, available: number, leadingPadding = padding) => {
        if (length > available - leadingPadding - padding) return leadingPadding - start;
        if (start < leadingPadding) return leadingPadding - start;
        if (start + length > available - padding) return available - padding - start - length;
        return 0;
    };
    const x = camera.x + shift(left, width, viewport.width);
    const y = camera.y + shift(top, height, viewport.height, topPadding);
    return x === camera.x && y === camera.y ? camera : { ...camera, x, y };
}
