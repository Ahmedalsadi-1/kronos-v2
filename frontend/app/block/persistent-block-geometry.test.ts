// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { intersectSurfaceRects, makeSurfaceClipPath } from "./persistent-block-geometry";

const Surface = { x: 100, y: 80, width: 200, height: 100 };

describe("detached live surface clipping", () => {
    it("clips content to its viewport in unscaled local coordinates", () => {
        expect(makeSurfaceClipPath(Surface, { x: 150, y: 80, width: 100, height: 100 }, [], 400, 200)).toBe(
            'path("M100 0H300V200H100Z")'
        );
    });

    it("removes the higher window's entire frame, including its titlebar, without removing uncovered content", () => {
        expect(makeSurfaceClipPath(Surface, Surface, [{ x: 180, y: 60, width: 80, height: 90 }], 200, 100)).toBe(
            'path("M0 70H200V100H0Z M0 0H80V70H0Z M160 0H200V70H160Z")'
        );
    });

    it("handles overlapping occluders without even-odd holes revealing hidden content", () => {
        expect(
            makeSurfaceClipPath(
                Surface,
                Surface,
                [
                    { x: 100, y: 80, width: 100, height: 100 },
                    { x: 150, y: 80, width: 100, height: 100 },
                ],
                200,
                100
            )
        ).toBe('path("M150 0H200V100H150Z")');
    });

    it("clips fully covered or out-of-viewport surfaces and ignores disjoint windows", () => {
        expect(makeSurfaceClipPath(Surface, Surface, [Surface], 200, 100)).toBe("inset(100%)");
        expect(makeSurfaceClipPath(Surface, { x: 0, y: 0, width: 10, height: 10 }, [], 200, 100)).toBe("inset(100%)");
        expect(makeSurfaceClipPath(Surface, Surface, [{ x: 400, y: 80, width: 20, height: 20 }], 200, 100)).toBe(
            'path("M0 0H200V100H0Z")'
        );
        expect(intersectSurfaceRects(Surface, { x: 0, y: 0, width: 10, height: 10 }).width).toBe(0);
    });
});
