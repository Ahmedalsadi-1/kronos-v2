import { expect, it } from "vitest";
import { cursorMotionPoint } from "./computer-cursor-motion";
it("keeps motion endpoints exact in negative display coordinates", () => {
    const a = { x: -1440, y: -900 }, b = { x: -100, y: 200 };
    expect(cursorMotionPoint(a, b, 0)).toEqual(a);
    expect(cursorMotionPoint(a, b, 1)).toEqual(b);
    expect(cursorMotionPoint(a, b, 2)).toEqual(b);
    const midpoint = cursorMotionPoint(a, b, .5);
    expect(Number.isFinite(midpoint.x) && Number.isFinite(midpoint.y)).toBe(true);
});
