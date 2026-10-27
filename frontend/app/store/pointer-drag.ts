// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cursorMotionPoint } from "@/util/computer-cursor-motion";

type Point = { x: number; y: number };

export async function sendPointerDrag(
    send: (event: Electron.MouseInputEvent) => unknown,
    start: Point,
    end: Point,
    button: "left" | "middle" | "right" = "left",
    onMove: (point: Point) => void = () => {},
    pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
) {
    let point = { x: Math.round(start.x), y: Math.round(start.y) };
    await send({ type: "mouseMove", ...point });
    onMove(point);
    try {
        await send({ type: "mouseDown", ...point, button, clickCount: 1 });
        // Chromium and drag handlers need time to process the press before movement begins.
        await pause(48);
        const steps = Math.max(12, Math.min(24, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 16)));
        for (let step = 1; step <= steps; step++) {
            const ratio = step / steps;
            const path = cursorMotionPoint(start, end, ratio);
            point = {
                x: Math.round(path.x),
                y: Math.round(path.y),
            };
            await send({ type: "mouseMove", ...point, button, modifiers: [`${button}buttondown`] });
            onMove(point);
            await pause(16);
        }
    } finally {
        await send({ type: "mouseUp", ...point, button, clickCount: 1 });
    }
}
