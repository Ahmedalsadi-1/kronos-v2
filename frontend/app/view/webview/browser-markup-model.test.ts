// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { drawBrowserMarkup, markupPointInImage } from "./browser-markup-model";

describe("browser screenshot markup", () => {
    it("converts displayed coordinates to screenshot pixels at a different DPR", () => {
        expect(
            markupPointInImage(
                { x: 260, y: 170 },
                { left: 10, top: 20, width: 500, height: 300 },
                { width: 1000, height: 600 }
            )
        ).toEqual({ x: 500, y: 300 });
    });
    it("clamps coordinates when the pointer leaves the image while captured", () => {
        expect(
            markupPointInImage(
                { x: -50, y: 500 },
                { left: 10, top: 20, width: 500, height: 300 },
                { width: 1000, height: 600 }
            )
        ).toEqual({ x: 0, y: 600 });
    });
    it("draws shapes in image coordinates without altering the next shape's style", () => {
        const context = {
            save: vi.fn(),
            restore: vi.fn(),
            beginPath: vi.fn(),
            strokeRect: vi.fn(),
            ellipse: vi.fn(),
            stroke: vi.fn(),
            fillText: vi.fn(),
            moveTo: vi.fn(),
            lineTo: vi.fn(),
        };
        drawBrowserMarkup(context as unknown as CanvasRenderingContext2D, {
            tool: "rect",
            points: [
                { x: 30, y: 40 },
                { x: 10, y: 15 },
            ],
            color: "red",
            width: 3,
        });
        expect(context.strokeRect).toHaveBeenCalledWith(30, 40, -20, -25);
        expect(context.restore).toHaveBeenCalledOnce();
    });
    it("renders placed text", () => {
        const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), fillText: vi.fn(), globalAlpha: 0 };
        drawBrowserMarkup(context as unknown as CanvasRenderingContext2D, {
            tool: "text",
            points: [{ x: 30, y: 40 }],
            color: "red",
            width: 3,
            text: "Fix this",
        });
        expect(context.fillText).toHaveBeenCalledWith("Fix this", 30, 40);
        expect(context.globalAlpha).toBe(1);
    });
});
