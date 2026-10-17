// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    fitSpatialViewportToBounds,
    makeSpatialEngine,
    spatialScreenToWorld,
    spatialWorldToScreen,
    zoomSpatialViewportAtPoint,
    type SpatialEngineSnapshot,
} from "./spatial-engine";

describe("shared spatial engine", () => {
    it("round-trips world and screen points", () => {
        const viewport = { x: 80, y: -20, zoom: 1.5 };
        const point = { x: 240, y: 160 };
        expect(spatialScreenToWorld(viewport, spatialWorldToScreen(viewport, point))).toEqual(point);
    });

    it("keeps the pointer-anchored world point stable while zooming", () => {
        const viewport = { x: 10, y: 30, zoom: 0.8 };
        const pointer = { x: 420, y: 280 };
        const before = spatialScreenToWorld(viewport, pointer);
        const next = zoomSpatialViewportAtPoint(viewport, 1.4, pointer);
        expect(spatialScreenToWorld(next, pointer)).toEqual(before);
    });

    it("focuses without changing node geometry", () => {
        let snapshot: SpatialEngineSnapshot = {
            viewport: { x: 0, y: 0, zoom: 1 },
            rects: {
                first: { x: 0, y: 0, width: 100, height: 100 },
                second: { x: 120, y: 0, width: 100, height: 100 },
            },
            zOrder: ["first", "second"],
        };
        const engine = makeSpatialEngine({
            read: () => snapshot,
            writeViewport: (viewport) => {
                snapshot = { ...snapshot, viewport };
            },
            writeRect: (id, rect) => {
                snapshot = { ...snapshot, rects: { ...snapshot.rects, [id]: rect } };
            },
            writeZOrder: (zOrder) => {
                snapshot = { ...snapshot, zOrder };
            },
        });
        engine.focusNode("first");
        expect(engine.getZOrder()).toEqual(["second", "first"]);
        expect(engine.getBounds("first")).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    });

    it("fits large content without exceeding the requested zoom", () => {
        expect(
            fitSpatialViewportToBounds({ x: 0, y: 0, width: 2000, height: 1000 }, { width: 1000, height: 700 }, 100, 1)
                .zoom
        ).toBeLessThanOrEqual(0.5);
    });
});
