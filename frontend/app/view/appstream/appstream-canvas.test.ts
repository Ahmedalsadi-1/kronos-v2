// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { drawAppStreamFrame } from "./appstream-canvas";

function makeFrame(width: number, height: number) {
    return { naturalWidth: width, naturalHeight: height } as HTMLImageElement;
}

function makeContext() {
    const canvas = document.createElement("canvas");
    const context = { canvas, clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    const widthSetter = vi.spyOn(canvas, "width", "set");
    const heightSetter = vi.spyOn(canvas, "height", "set");
    return { canvas, context, widthSetter, heightSetter };
}

describe("app stream canvas backing buffer", () => {
    it("draws 360 frames using only the initial dimension assignments", () => {
        const { context, widthSetter, heightSetter } = makeContext();
        const image = makeFrame(1920, 1080);
        for (let frame = 0; frame < 360; frame++) drawAppStreamFrame(context, image);
        expect(context.drawImage).toHaveBeenCalledTimes(360);
        expect(widthSetter).toHaveBeenCalledTimes(1);
        expect(heightSetter).toHaveBeenCalledTimes(1);
        expect(context.clearRect).toHaveBeenCalledTimes(359);
    });

    it("resizes only changed dimensions when a captured app changes size", () => {
        const { canvas, context, widthSetter, heightSetter } = makeContext();
        drawAppStreamFrame(context, makeFrame(1920, 1080));
        drawAppStreamFrame(context, makeFrame(1920, 1200));
        drawAppStreamFrame(context, makeFrame(1600, 1200));
        expect(widthSetter).toHaveBeenCalledTimes(2);
        expect(heightSetter).toHaveBeenCalledTimes(2);
        expect(canvas.width).toBe(1600);
        expect(canvas.height).toBe(1200);
        expect(context.drawImage).toHaveBeenCalledTimes(3);
    });

    it("clears the previous frame before drawing so transparent pixels and cursor trails do not persist", () => {
        const { context } = makeContext();
        drawAppStreamFrame(context, makeFrame(1920, 1080));
        const image = makeFrame(1920, 1080);
        drawAppStreamFrame(context, image);
        expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
        expect(context.drawImage).toHaveBeenLastCalledWith(image, 0, 0);
        expect(vi.mocked(context.clearRect).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(context.drawImage).mock.invocationCallOrder[1]
        );
    });
});
