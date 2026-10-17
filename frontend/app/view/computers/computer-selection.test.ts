// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { ComputerTarget, ComputerTargetSnapshot } from "@/types/computer-targets";
import { describe, expect, it } from "vitest";
import { capturePixelPoint, captureRegion, captureStillValid, deviceSelectionContext } from "./computer-selection";

const Target = {
    id: "ios:phone",
    name: "Phone",
    runtime: "iOS",
    kind: "ios-simulator",
    status: "booted",
    controlGeneration: 4,
    labs: true,
} as ComputerTarget;
const Snapshot = { target: Target, capturedAt: 123 } as ComputerTargetSnapshot;

describe("mobile pixel selection", () => {
    it("maps letterboxed and zoomed displayed frames into original pixels", () => {
        const bounds = { x: 100, y: 50, width: 400, height: 400 };
        const dimensions = { width: 200, height: 400 };
        expect(capturePixelPoint(bounds, dimensions, { x: 100, y: 200 })).toBeNull();
        expect(capturePixelPoint(bounds, dimensions, { x: 300, y: 250 })).toEqual({ x: 100, y: 200 });
        expect(capturePixelPoint({ x: 0, y: 0, width: 100, height: 200 }, dimensions, { x: 25, y: 50 })).toEqual({
            x: 50,
            y: 100,
        });
        expect(capturePixelPoint(bounds, dimensions, { x: 900, y: -100 }, true)).toEqual({ x: 200, y: 0 });
    });

    it("supports reverse dragging and rejects clicks and canceled gestures", () => {
        expect(captureRegion({ x: 30.2, y: 80 }, { x: 10.1, y: 20 })).toEqual({ x: 10, y: 20, width: 21, height: 60 });
        expect(captureRegion({ x: 10, y: 10 }, { x: 10, y: 10 })).toBeNull();
        expect(captureRegion(null, { x: 20, y: 30 })).toBeNull();
    });

    it("invalidates frozen selection after device switches, ownership changes, or shutdown", () => {
        expect(captureStillValid(Snapshot, Target)).toBe(true);
        expect(captureStillValid(Snapshot, { ...Target, id: "other" })).toBe(false);
        expect(captureStillValid(Snapshot, { ...Target, controlGeneration: 5 })).toBe(false);
        expect(captureStillValid(Snapshot, { ...Target, status: "shutdown" })).toBe(false);
        expect(captureStillValid(Snapshot, null)).toBe(false);
    });

    it("records frame, crop, ownership, orientation, timestamp and explicit pixel-only provenance", () => {
        const context = deviceSelectionContext(
            Snapshot,
            { width: 1200, height: 800 },
            { x: 100, y: 200, width: 20, height: 30 },
            " Inspect button "
        );
        expect(context).toMatchObject({
            deviceId: Target.id,
            runtime: "iOS",
            controlGeneration: 4,
            capturedAt: 123,
            orientation: "landscape",
            semantics: "pixels-only",
            annotation: "Inspect button",
            requiresRevalidation: true,
            labs: true,
        });
        expect(context.frame).toEqual({ width: 1200, height: 800 });
        expect(context.region).toEqual({ x: 100, y: 200, width: 20, height: 30 });
    });
});
