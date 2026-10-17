// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    SpatialMaxZoom,
    SpatialMinZoom,
    fitSpatialViewportToBounds,
    makeSpatialViewportCenteredRect,
    spatialBoundsForRects,
    spatialScreenToWorld,
    zoomSpatialViewportAtPoint,
    type SpatialPoint,
    type SpatialRect,
    type SpatialSize,
    type SpatialViewport,
} from "@/app/spatial/spatial-engine";

export const CanvasMinZoom = SpatialMinZoom;
export const CanvasMaxZoom = SpatialMaxZoom;
const CanvasInteractiveTargetSelector = [
    "button",
    "a[href]",
    "input",
    "textarea",
    "select",
    "option",
    "label",
    "summary",
    "[contenteditable]:not([contenteditable='false'])",
    "[role='application']",
    "[role='button']",
    "[role='checkbox']",
    "[role='combobox']",
    "[role='link']",
    "[role='menuitem']",
    "[role='option']",
    "[role='radio']",
    "[role='searchbox']",
    "[role='slider']",
    "[role='spinbutton']",
    "[role='switch']",
    "[role='tab']",
    "[role='textbox']",
    "[role='treeitem']",
    "[data-canvas-shortcuts='ignore']",
].join(",");

export type WorkspaceCanvasPoint = SpatialPoint;
export type WorkspaceCanvasSize = SpatialSize;
export type WorkspaceCanvasRect = SpatialRect;
export type WorkspaceCanvasCamera = SpatialViewport;

export function canvasRectsOverlap(a: WorkspaceCanvasRect, b: WorkspaceCanvasRect, gap = 0): boolean {
    return !(
        a.x + a.width + gap <= b.x ||
        b.x + b.width + gap <= a.x ||
        a.y + a.height + gap <= b.y ||
        b.y + b.height + gap <= a.y
    );
}

export function findNonOverlappingCanvasRect(
    preferred: WorkspaceCanvasRect,
    occupied: WorkspaceCanvasRect[],
    gap = 56
): WorkspaceCanvasRect {
    if (!occupied.some((rect) => canvasRectsOverlap(preferred, rect, gap))) {
        return preferred;
    }
    const columnOffsets = Array.from({ length: 21 }, (_, index) => {
        if (index === 0) {
            return 0;
        }
        const distance = Math.ceil(index / 2);
        return index % 2 === 1 ? distance : -distance;
    });
    for (let row = 0; row < 80; row += 1) {
        for (const column of columnOffsets) {
            const candidate = {
                ...preferred,
                x: preferred.x + column * (preferred.width + gap),
                y: preferred.y + row * (preferred.height + gap),
            };
            if (!occupied.some((rect) => canvasRectsOverlap(candidate, rect, gap))) {
                return candidate;
            }
        }
    }
    return {
        ...preferred,
        y: Math.max(preferred.y, ...occupied.map((rect) => rect.y + rect.height + gap)),
    };
}

export function packCanvasRects(
    entries: Array<[string, WorkspaceCanvasRect]>,
    gap = 56
): Record<string, WorkspaceCanvasRect> {
    const packed: Record<string, WorkspaceCanvasRect> = {};
    const occupied: WorkspaceCanvasRect[] = [];
    for (const [id, rect] of entries) {
        const placement = findNonOverlappingCanvasRect(rect, occupied, gap);
        packed[id] = placement;
        occupied.push(placement);
    }
    return packed;
}

export function isCanvasShortcutInteractiveTarget(target: EventTarget | null): boolean {
    if (!target || typeof (target as Element).closest !== "function") {
        return false;
    }
    const element = target as HTMLElement;
    return element.isContentEditable || element.closest(CanvasInteractiveTargetSelector) != null;
}

export function clampCanvasZoom(zoom: number): number {
    return Math.min(CanvasMaxZoom, Math.max(CanvasMinZoom, zoom));
}

export function screenPointToCanvas(camera: WorkspaceCanvasCamera, point: WorkspaceCanvasPoint): WorkspaceCanvasPoint {
    return spatialScreenToWorld(camera, point);
}

export function zoomCanvasCameraAtPoint(
    camera: WorkspaceCanvasCamera,
    nextZoom: number,
    point: WorkspaceCanvasPoint
): WorkspaceCanvasCamera {
    return zoomSpatialViewportAtPoint(camera, nextZoom, point);
}

export function makeViewportCenteredCanvasRect(
    camera: WorkspaceCanvasCamera,
    viewport: WorkspaceCanvasSize,
    size: WorkspaceCanvasSize,
    offset: WorkspaceCanvasPoint = { x: 0, y: 0 }
): WorkspaceCanvasRect {
    return makeSpatialViewportCenteredRect(camera, viewport, size, offset);
}

export function canvasBoundsForRects(rects: WorkspaceCanvasRect[]): WorkspaceCanvasRect | null {
    return spatialBoundsForRects(rects);
}

export function fitCanvasCameraToBounds(
    bounds: WorkspaceCanvasRect,
    viewport: WorkspaceCanvasSize,
    padding = 96,
    maxZoom = 1.15
): WorkspaceCanvasCamera {
    return fitSpatialViewportToBounds(bounds, viewport, padding, maxZoom);
}
