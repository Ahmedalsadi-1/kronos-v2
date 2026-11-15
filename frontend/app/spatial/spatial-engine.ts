// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export const SpatialMinZoom = 0.2;
export const SpatialMaxZoom = 2.4;
const SpatialMinFitZoom = 0.04;

export type SpatialPoint = {
    x: number;
    y: number;
};

export type SpatialSize = {
    width: number;
    height: number;
};

export type SpatialRect = SpatialPoint & SpatialSize;

export type SpatialViewport = SpatialPoint & {
    zoom: number;
};

export type SpatialEngineSnapshot = {
    viewport: SpatialViewport;
    rects: Record<string, SpatialRect>;
    zOrder: string[];
};

export type SpatialEngineAdapter = {
    read: () => SpatialEngineSnapshot;
    writeViewport: (viewport: SpatialViewport) => void;
    writeRect: (id: string, rect: SpatialRect) => void;
    writeZOrder: (ids: string[]) => void;
};

export interface SpatialEngine {
    getViewport(): SpatialViewport;
    setViewport(viewport: SpatialViewport): void;
    worldToScreen(point: SpatialPoint): SpatialPoint;
    screenToWorld(point: SpatialPoint): SpatialPoint;
    moveNode(id: string, point: SpatialPoint): void;
    resizeNode(id: string, size: SpatialSize): void;
    focusNode(id: string): void;
    getBounds(id: string): SpatialRect;
    getZOrder(): string[];
}

export function clampSpatialZoom(zoom: number): number {
    return Math.min(SpatialMaxZoom, Math.max(SpatialMinZoom, zoom));
}

export function spatialScreenToWorld(viewport: SpatialViewport, point: SpatialPoint): SpatialPoint {
    return {
        x: (point.x - viewport.x) / viewport.zoom,
        y: (point.y - viewport.y) / viewport.zoom,
    };
}

export function spatialWorldToScreen(viewport: SpatialViewport, point: SpatialPoint): SpatialPoint {
    return {
        x: viewport.x + point.x * viewport.zoom,
        y: viewport.y + point.y * viewport.zoom,
    };
}

export function zoomSpatialViewportAtPoint(
    viewport: SpatialViewport,
    nextZoom: number,
    point: SpatialPoint
): SpatialViewport {
    const zoom = clampSpatialZoom(nextZoom);
    const worldPoint = spatialScreenToWorld(viewport, point);
    return {
        zoom,
        x: point.x - worldPoint.x * zoom,
        y: point.y - worldPoint.y * zoom,
    };
}

export function makeSpatialViewportCenteredRect(
    viewport: SpatialViewport,
    viewportSize: SpatialSize,
    size: SpatialSize,
    offset: SpatialPoint = { x: 0, y: 0 }
): SpatialRect {
    const center = spatialScreenToWorld(viewport, {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2,
    });
    return {
        x: Math.round(center.x - size.width / 2 + offset.x),
        y: Math.round(center.y - size.height / 2 + offset.y),
        width: size.width,
        height: size.height,
    };
}

export function spatialBoundsForRects(rects: SpatialRect[]): SpatialRect | null {
    if (rects.length === 0) {
        return null;
    }
    const minX = Math.min(...rects.map((rect) => rect.x));
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
    const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));
    return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
    };
}

export function fitSpatialViewportToBounds(
    bounds: SpatialRect,
    viewport: SpatialSize & Partial<SpatialPoint>,
    padding = 96,
    maxZoom = 1.15
): SpatialViewport {
    const availableWidth = Math.max(1, viewport.width - padding * 2);
    const availableHeight = Math.max(1, viewport.height - padding * 2);
    const zoom = Math.max(
        SpatialMinFitZoom,
        Math.min(SpatialMaxZoom, maxZoom, availableWidth / bounds.width, availableHeight / bounds.height)
    );
    return {
        zoom,
        x: Math.round((viewport.x ?? 0) + viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom),
        y: Math.round((viewport.y ?? 0) + viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom),
    };
}

export function makeSpatialEngine(adapter: SpatialEngineAdapter): SpatialEngine {
    return {
        getViewport: () => adapter.read().viewport,
        setViewport: (viewport) => adapter.writeViewport({ ...viewport, zoom: clampSpatialZoom(viewport.zoom) }),
        worldToScreen: (point) => spatialWorldToScreen(adapter.read().viewport, point),
        screenToWorld: (point) => spatialScreenToWorld(adapter.read().viewport, point),
        moveNode: (id, point) => {
            const rect = adapter.read().rects[id];
            if (rect) adapter.writeRect(id, { ...rect, ...point });
        },
        resizeNode: (id, size) => {
            const rect = adapter.read().rects[id];
            if (rect) adapter.writeRect(id, { ...rect, ...size });
        },
        focusNode: (id) => {
            const current = adapter.read().zOrder.filter((entry) => entry !== id);
            adapter.writeZOrder([...current, id]);
        },
        getBounds: (id) => adapter.read().rects[id],
        getZOrder: () => adapter.read().zOrder,
    };
}
