// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    computeOSArrangement,
    computeOSPlacementBounds,
    computeOSTileLayout,
    computeOSWorkArea,
    OSWindowGap,
    screenRectToWorld,
} from "./os-window-arrange";

const area = computeOSWorkArea({ width: 1440, height: 900 }, { top: 68, right: 120, bottom: 0, left: 300 });

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe("computeOSWorkArea", () => {
    it("keeps windows clear of the shell and desktop widget columns", () => {
        expect(area).toEqual({ x: 312, y: 80, width: 996, height: 808 });
    });
});

describe("computeOSPlacementBounds", () => {
    it("splits the work area into non-overlapping halves", () => {
        const left = computeOSPlacementBounds("left", area);
        const right = computeOSPlacementBounds("right", area);
        expect(overlaps(left, right)).toBe(false);
        expect(right.x + right.width).toBeLessThanOrEqual(area.x + area.width);
        expect(right.x - (left.x + left.width)).toBe(OSWindowGap);
    });

    it("centers a window at its current size", () => {
        const centered = computeOSPlacementBounds("center", area, { x: 0, y: 0, width: 600, height: 400 });
        expect(centered).toMatchObject({ width: 600, height: 400 });
        expect(centered.x + centered.width / 2).toBeCloseTo(area.x + area.width / 2, 0);
    });

    it("fills the whole work area", () => {
        expect(computeOSPlacementBounds("fill", area)).toEqual(area);
    });
});

describe("computeOSTileLayout", () => {
    it.each([1, 2, 3, 5, 8])("tiles %i windows inside the work area without overlap", (count) => {
        const rects = computeOSTileLayout(count, area);
        expect(rects).toHaveLength(count);
        for (const rect of rects) {
            expect(rect.x).toBeGreaterThanOrEqual(area.x);
            expect(rect.y).toBeGreaterThanOrEqual(area.y);
            expect(rect.x + rect.width).toBeLessThanOrEqual(area.x + area.width);
            expect(rect.y + rect.height).toBeLessThanOrEqual(area.y + area.height);
        }
        for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
                expect(overlaps(rects[i], rects[j])).toBe(false);
            }
        }
    });
});

describe("computeOSArrangement", () => {
    it("cascades windows with visible offsets", () => {
        const [first, second] = computeOSArrangement("cascade", 2, area);
        expect(second.x - first.x).toBeGreaterThan(0);
        expect(second.y - first.y).toBeGreaterThan(0);
    });
});

describe("screenRectToWorld", () => {
    it("inverts the freeform camera", () => {
        expect(screenRectToWorld({ x: 110, y: 60, width: 200, height: 100 }, { x: 10, y: 20, zoom: 2 })).toEqual({
            x: 50,
            y: 20,
            width: 100,
            height: 50,
        });
    });
});
