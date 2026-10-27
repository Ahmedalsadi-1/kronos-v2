import { expect, it } from "vitest";
import { cursorMotionPoint } from "./computer-cursor-motion";
it("keeps a stationary drag stationary", () => {
    const point = { x: 20, y: 30 };
    expect(cursorMotionPoint(point, point, 0.5)).toEqual(point);
});
it("scales short drag curvature to the movement distance", () => {
    const midpoint = cursorMotionPoint({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.5);
    expect(Math.abs(midpoint.y)).toBeLessThan(0.5);
});
it("keeps motion endpoints exact in negative display coordinates", () => {
    const a = { x: -1440, y: -900 },
        b = { x: -100, y: 200 };
    expect(cursorMotionPoint(a, b, 0)).toEqual(a);
    expect(cursorMotionPoint(a, b, 1)).toEqual(b);
    expect(cursorMotionPoint(a, b, 2)).toEqual(b);
    const midpoint = cursorMotionPoint(a, b, 0.5);
    expect(Number.isFinite(midpoint.x) && Number.isFinite(midpoint.y)).toBe(true);
});
