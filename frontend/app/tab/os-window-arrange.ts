// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type OSRect = { x: number; y: number; width: number; height: number };
export type OSCamera = { x: number; y: number; zoom: number };

export type OSWindowPlacement = "left" | "right" | "top" | "bottom" | "fill" | "center";
export type OSWindowArrangement = "tile" | "cascade";

export type OSWorkAreaInsets = { top: number; right: number; bottom: number; left: number };

export const OSWindowGap = 12;
const MinWindowWidth = 360;
const MinWindowHeight = 240;
const CascadeStep = 32;

export function isOSWindowPlacement(value: unknown): value is OSWindowPlacement {
    return (
        value === "left" ||
        value === "right" ||
        value === "top" ||
        value === "bottom" ||
        value === "fill" ||
        value === "center"
    );
}

export function isOSWindowArrangement(value: unknown): value is OSWindowArrangement {
    return value === "tile" || value === "cascade";
}

/** Screen-space region windows may occupy: the viewport minus shell and desktop widget columns. */
export function computeOSWorkArea(viewport: { width: number; height: number }, insets: OSWorkAreaInsets): OSRect {
    const x = insets.left + OSWindowGap;
    const y = insets.top + OSWindowGap;
    return {
        x,
        y,
        width: Math.max(MinWindowWidth, viewport.width - x - insets.right - OSWindowGap),
        height: Math.max(MinWindowHeight, viewport.height - y - insets.bottom - OSWindowGap),
    };
}

/** Windows live in world space under the freeform camera; placement is computed on screen. */
export function screenRectToWorld(rect: OSRect, camera: OSCamera): OSRect {
    const zoom = camera.zoom || 1;
    return {
        x: Math.round((rect.x - camera.x) / zoom),
        y: Math.round((rect.y - camera.y) / zoom),
        width: Math.round(rect.width / zoom),
        height: Math.round(rect.height / zoom),
    };
}

export function computeOSPlacementBounds(placement: OSWindowPlacement, area: OSRect, current?: OSRect): OSRect {
    const halfWidth = Math.floor((area.width - OSWindowGap) / 2);
    const halfHeight = Math.floor((area.height - OSWindowGap) / 2);
    switch (placement) {
        case "left":
            return { x: area.x, y: area.y, width: halfWidth, height: area.height };
        case "right":
            return { x: area.x + halfWidth + OSWindowGap, y: area.y, width: halfWidth, height: area.height };
        case "top":
            return { x: area.x, y: area.y, width: area.width, height: halfHeight };
        case "bottom":
            return { x: area.x, y: area.y + halfHeight + OSWindowGap, width: area.width, height: halfHeight };
        case "fill":
            return { ...area };
        case "center": {
            const width = Math.min(
                area.width,
                Math.max(MinWindowWidth, current?.width ?? Math.round(area.width * 0.6))
            );
            const height = Math.min(
                area.height,
                Math.max(MinWindowHeight, current?.height ?? Math.round(area.height * 0.7))
            );
            return {
                x: Math.round(area.x + (area.width - width) / 2),
                y: Math.round(area.y + (area.height - height) / 2),
                width,
                height,
            };
        }
    }
}

/**
 * Near-square grid, filled row by row. The last row stretches so no hole is left,
 * matching how tiling desktops distribute an odd window count.
 */
export function computeOSTileLayout(count: number, area: OSRect): OSRect[] {
    if (count <= 0) return [];
    const columns = Math.ceil(Math.sqrt(count * (area.width / Math.max(1, area.height))));
    const safeColumns = Math.max(1, Math.min(count, columns));
    const rows = Math.ceil(count / safeColumns);
    const cellHeight = Math.floor((area.height - OSWindowGap * (rows - 1)) / rows);
    const rects: OSRect[] = [];
    for (let row = 0; row < rows; row++) {
        const inRow = row === rows - 1 ? count - safeColumns * (rows - 1) : safeColumns;
        const cellWidth = Math.floor((area.width - OSWindowGap * (inRow - 1)) / inRow);
        for (let column = 0; column < inRow; column++) {
            rects.push({
                x: area.x + column * (cellWidth + OSWindowGap),
                y: area.y + row * (cellHeight + OSWindowGap),
                width: cellWidth,
                height: cellHeight,
            });
        }
    }
    return rects;
}

export function computeOSCascadeLayout(count: number, area: OSRect): OSRect[] {
    if (count <= 0) return [];
    const width = Math.max(MinWindowWidth, Math.round(area.width * 0.62));
    const height = Math.max(MinWindowHeight, Math.round(area.height * 0.7));
    const maxSteps = Math.max(1, Math.floor(Math.min(area.width - width, area.height - height) / CascadeStep) + 1);
    return Array.from({ length: count }, (_, index) => {
        const step = index % maxSteps;
        return {
            x: area.x + step * CascadeStep,
            y: area.y + step * CascadeStep,
            width: Math.min(width, area.width),
            height: Math.min(height, area.height),
        };
    });
}

export function computeOSArrangement(arrangement: OSWindowArrangement, count: number, area: OSRect): OSRect[] {
    return arrangement === "tile" ? computeOSTileLayout(count, area) : computeOSCascadeLayout(count, area);
}
