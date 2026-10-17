import { describe, expect, it } from "vitest";
import { recoverHudBounds } from "./hud-placement";

const Area = { x: -1440, y: 0, width: 1440, height: 900 };
const Fallback = { x: -1000, y: 100, width: 600, height: 400 };

describe("HUD placement recovery", () => {
    it("recovers a window after its display is disconnected", () => {
        expect(recoverHudBounds({ x: 3000, y: 2000, width: 800, height: 500 }, Fallback, Area)).toEqual({
            x: -800,
            y: 400,
            width: 800,
            height: 500,
        });
    });
    it("rejects malformed geometry and fits oversized windows into a small display", () => {
        expect(recoverHudBounds({ x: null, y: 0, width: 1, height: 1 }, Fallback, Area)).toEqual(Fallback);
        expect(recoverHudBounds({ x: -8000, y: -500, width: 4000, height: 2000 }, Fallback, Area)).toEqual(Area);
    });
});
