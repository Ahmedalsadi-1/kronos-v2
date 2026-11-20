// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from "vitest";
import { makePenSurfaceOccluders, penSurfaceCornerRadius } from "./os-pen-surface-occlusion";

test("leaves browser pixels visible outside a rounded floating composer", () => {
    const bounds = { x: 100, y: 200, width: 480, height: 80 };
    const strips = makePenSurfaceOccluders(bounds, 999);
    const covers = (x: number, y: number) =>
        strips.some((rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height);
    expect(covers(100, 200)).toBe(false);
    expect(covers(579, 279)).toBe(false);
    for (let y = 200; y < 280; y++) expect(covers(340, y)).toBe(true);
    expect(covers(101, 240)).toBe(true);
    expect(strips.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);
});

test("keeps rectangular popup bounds intact", () => {
    const bounds = { x: 10, y: 20, width: 200, height: 300 };
    expect(makePenSurfaceOccluders(bounds)).toEqual([bounds]);
});

test("uses circular voice bounds for a percentage radius in canvas mode", () => {
    const radius = penSurfaceCornerRadius("50%", 112, 112);
    expect(radius).toBe(56);
    const strips = makePenSurfaceOccluders({ x: 0, y: 0, width: 112, height: 112 }, radius);
    expect(strips.some((rect) => rect.x <= 2 && rect.y <= 2)).toBe(false);
    expect(penSurfaceCornerRadius("20px", 112, 112)).toBe(20);
});
