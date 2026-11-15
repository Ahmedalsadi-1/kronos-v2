// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SpatialPoint, SpatialRect, SpatialSize } from "@/app/spatial/spatial-engine";

export type OSResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export type OSAlignmentGuide = {
    axis: "x" | "y";
    at: number;
    from: number;
    to: number;
};

const SnapDistancePx = 6;

export function osMarqueeBounds(start: SpatialPoint, end: SpatialPoint): SpatialRect {
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

export function osMarqueeSelection(marquee: SpatialRect, rects: Record<string, SpatialRect>): string[] {
    const right = marquee.x + marquee.width;
    const bottom = marquee.y + marquee.height;
    return Object.entries(rects)
        .filter(
            ([, rect]) =>
                rect.x < right && rect.y < bottom && rect.x + rect.width > marquee.x && rect.y + rect.height > marquee.y
        )
        .map(([id]) => id);
}

export function translateOSCanvasRects(
    rects: Record<string, SpatialRect>,
    dx: number,
    dy: number
): Record<string, SpatialRect> {
    return Object.fromEntries(
        Object.entries(rects).map(([id, rect]) => [id, { ...rect, x: rect.x + dx, y: rect.y + dy }])
    );
}

export function snapOSCanvasBounds(
    proposed: SpatialRect,
    targets: SpatialRect[],
    zoom: number,
    minimum: SpatialSize,
    edge?: OSResizeEdge
): { bounds: SpatialRect; guides: OSAlignmentGuide[] } {
    const bounds = { ...proposed };
    const guides: OSAlignmentGuide[] = [];
    const threshold = SnapDistancePx / zoom;

    for (const axis of ["x", "y"] as const) {
        const size = axis === "x" ? "width" : "height";
        const near = axis === "x" ? "w" : "n";
        const far = axis === "x" ? "e" : "s";
        const resizingNear = edge?.includes(near);
        const resizingFar = edge?.includes(far);
        if (edge && !resizingNear && !resizingFar) continue;

        const start = bounds[axis];
        const length = bounds[size];
        const anchors = resizingNear
            ? [start]
            : resizingFar
              ? [start + length]
              : [start, start + length / 2, start + length];
        let match: { target: SpatialRect; at: number; delta: number } | undefined;
        for (const target of targets) {
            const targetStart = target[axis];
            const targetLength = target[size];
            for (const at of [targetStart, targetStart + targetLength / 2, targetStart + targetLength]) {
                for (const anchor of anchors) {
                    const delta = at - anchor;
                    if (Math.abs(delta) > threshold || (match && Math.abs(delta) >= Math.abs(match.delta))) continue;
                    const nextLength = length + (resizingNear ? -delta : delta);
                    if (edge && nextLength < minimum[size]) continue;
                    match = { target, at, delta };
                }
            }
        }
        if (!match) continue;

        if (!edge || resizingNear) bounds[axis] += match.delta;
        if (edge) bounds[size] += resizingNear ? -match.delta : match.delta;
        const across = axis === "x" ? "y" : "x";
        const acrossSize = axis === "x" ? "height" : "width";
        guides.push({
            axis,
            at: match.at,
            from: Math.min(proposed[across], match.target[across]),
            to: Math.max(proposed[across] + proposed[acrossSize], match.target[across] + match.target[acrossSize]),
        });
    }
    return { bounds, guides };
}
