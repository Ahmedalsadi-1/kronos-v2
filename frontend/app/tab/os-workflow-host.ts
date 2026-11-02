// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { clampSpatialZoom, fitSpatialViewportToBounds, type SpatialRect } from "@/app/spatial/spatial-engine";

export type WorkflowCamera = { x: number; y: number; zoom: number };
export type WorkflowCameraIntent = { camera?: WorkflowCamera; fitBounds?: SpatialRect; scope?: string };

export function resolveWorkflowCameraIntent(
    intent: WorkflowCameraIntent,
    current: WorkflowCamera,
    viewport: { width: number; height: number }
): WorkflowCamera {
    if (intent.fitBounds) {
        const bounds = intent.fitBounds;
        if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return current;
        if (bounds.width < 0 || bounds.height < 0) return current;
        return fitSpatialViewportToBounds(bounds, { ...viewport, height: Math.max(1, viewport.height - 96) }, 80, 1);
    }
    const camera = intent.camera;
    if (!camera || ![camera.x, camera.y, camera.zoom].every(Number.isFinite)) return current;
    return { x: camera.x, y: camera.y, zoom: clampSpatialZoom(camera.zoom) };
}

export function workflowEventMatchesTab(detail: { tabId?: string }, tabId: string): boolean {
    return !detail?.tabId || detail.tabId === tabId;
}

export function getWorkflowSelectionCommand(
    objectId: string | undefined,
    workflowId: string,
    nativeSelection: string[]
): string[] | undefined {
    const prefix = `workflow:${workflowId}:`;
    if (!objectId?.startsWith(prefix)) return nativeSelection.length ? [] : undefined;
    const nodeId = objectId.slice(prefix.length);
    return nativeSelection.includes(nodeId) ? undefined : [nodeId];
}

export function workflowOwnsWheel(path: EventTarget[]): boolean {
    return path.some(
        (target) =>
            target instanceof HTMLElement &&
            (target.hasAttribute("data-workflow-chrome") ||
                target.hasAttribute("data-workflow-details") ||
                target.hasAttribute("data-workflow-inspector") ||
                target.hasAttribute("data-workflow-panel") ||
                target.hasAttribute("data-workflow-controls") ||
                target.matches(".os-agent-sidebar, .os-files-inspector"))
    );
}
