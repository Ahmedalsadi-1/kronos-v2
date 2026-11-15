// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { osMarqueeBounds, osMarqueeSelection, snapOSCanvasBounds, translateOSCanvasRects } from "./os-canvas-gestures";

const Minimum = { width: 320, height: 220 };

describe("KronOS canvas alignment", () => {
    it("snaps a moving widget's edge and center independently and reports their guide positions", () => {
        const moving = { x: 204, y: 103, width: 360, height: 240 };
        const targets = [
            { x: 560, y: 435, width: 400, height: 300 },
            { x: 1100, y: 80, width: 340, height: 280 },
        ];
        const { bounds, guides } = snapOSCanvasBounds(moving, targets, 1, Minimum);
        expect(bounds).toEqual({ ...moving, x: 200, y: 100 });
        expect(guides).toEqual([
            { axis: "x", at: 560, from: 103, to: 735 },
            { axis: "y", at: 220, from: 204, to: 1440 },
        ]);
    });

    it("uses a screen-pixel threshold at different canvas zoom levels", () => {
        const moving = { x: 0, y: 103, width: 350, height: 250 };
        const target = { x: 359, y: 800, width: 400, height: 310 };
        expect(snapOSCanvasBounds(moving, [target], 1, Minimum).bounds.x).toBe(0);
        expect(snapOSCanvasBounds(moving, [target], 0.5, Minimum).bounds.x).toBe(9);
    });

    it("snaps only the moving resize edge, preserving the opposite edge and minimum size", () => {
        const leftResize = { x: 100, y: 100, width: 324, height: 230 };
        const target = { x: 96, y: 205, width: 310, height: 220 };
        expect(snapOSCanvasBounds(leftResize, [target], 1, Minimum, "w").bounds).toEqual({
            x: 96,
            y: 100,
            width: 328,
            height: 230,
        });
        const tooSmall = { ...target, x: 105 };
        expect(snapOSCanvasBounds(leftResize, [tooSmall], 1, Minimum, "w")).toEqual({
            bounds: leftResize,
            guides: [],
        });
    });
});

describe("KronOS canvas selection", () => {
    it("selects intersecting items when dragging in reverse and excludes items outside the box", () => {
        const marquee = osMarqueeBounds({ x: 480, y: 630 }, { x: 95, y: 80 });
        const rects = {
            widget: { x: 110, y: 100, width: 350, height: 230 },
            note: { x: 110, y: 350, width: 260, height: 280 },
            partial: { x: 250, y: 450, width: 300, height: 150 },
            outside: { x: 490, y: 450, width: 300, height: 150 },
        };
        expect(osMarqueeSelection(marquee, rects)).toEqual(["widget", "note", "partial"]);
        expect(translateOSCanvasRects({ widget: rects.widget, note: rects.note }, 16, -5)).toEqual({
            widget: { x: 126, y: 95, width: 350, height: 230 },
            note: { x: 126, y: 345, width: 260, height: 280 },
        });
    });
});
