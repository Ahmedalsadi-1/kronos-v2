// Motion path adapted from iFurySt/open-codex-computer-use CursorMotionModel.swift.
// Copyright (c) 2026 Leo. MIT license: THIRD_PARTY_NOTICES/computer-cursor-motion.txt.
export type CursorPoint = { x: number; y: number };
export function cursorMotionPoint(start: CursorPoint, end: CursorPoint, progress: number): CursorPoint {
    const dx = end.x - start.x,
        dy = end.y - start.y;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const direction = dx >= 0 ? 1 : -1;
    const bend = Math.min(distance * 0.22, 110) * direction;
    const offset = { x: (-dy / distance) * bend, y: (dx / distance) * bend };
    const c1 = { x: start.x + dx * 0.18 + offset.x, y: start.y + dy * 0.1 + offset.y };
    const c2 = { x: start.x + dx * 0.8 + offset.x * 0.48, y: start.y + dy * 0.96 + offset.y * 0.48 };
    const t = Math.max(0, Math.min(1, progress)),
        u = 1 - t;
    return {
        x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
        y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
    };
}
