// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type HudTerminalSplit = { blockIds: string[]; direction: "horizontal" | "vertical"; ratio: number };

export function hudTerminalPaneBounds(
    bounds: { x: number; y: number; width: number; height: number },
    split: HudTerminalSplit
): Array<{ x: number; y: number; width: number; height: number }> {
    const horizontal = split.direction === "horizontal";
    const length = horizontal ? bounds.width : bounds.height;
    const gap = 4;
    const available = Math.max(2, length - gap);
    const first = Math.round(available * Math.min(0.75, Math.max(0.25, split.ratio)));
    return [
        { ...bounds, ...(horizontal ? { width: first } : { height: first }) },
        {
            ...bounds,
            ...(horizontal
                ? { x: bounds.x + first + gap, width: available - first }
                : { y: bounds.y + first + gap, height: available - first }),
        },
    ];
}
