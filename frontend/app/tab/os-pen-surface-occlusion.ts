// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type Rect = { x: number; y: number; width: number; height: number };

export function penSurfaceCornerRadius(value: string, width: number, height: number): number {
    const radius = parseFloat(value) || 0;
    return value?.trim().endsWith("%") ? (Math.min(width, height) * radius) / 100 : radius;
}

export function makePenSurfaceOccluders(rect: Rect, radius = 0): Rect[] {
    const corner = Math.min(Math.max(0, radius), rect.width / 2, rect.height / 2);
    if (!corner) return [rect];
    const strips: Rect[] = [];
    const step = Math.max(1, corner / 16);
    for (let edge = 0; edge < corner; edge += step) {
        const height = Math.min(step, corner - edge);
        const inset = corner - Math.sqrt(Math.max(0, corner ** 2 - (corner - edge - height / 2) ** 2));
        const band = { x: rect.x + inset, width: rect.width - inset * 2, height };
        strips.push({ ...band, y: rect.y + edge }, { ...band, y: rect.y + rect.height - edge - height });
    }
    if (rect.height > corner * 2)
        strips.push({ x: rect.x, y: rect.y + corner, width: rect.width, height: rect.height - corner * 2 });
    return strips;
}
