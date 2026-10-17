import { describe, expect, it } from "vitest";
import { hudTerminalPaneBounds } from "./hud-terminal-splits";

describe("HUD terminal split geometry", () => {
    it("keeps horizontal panes inside the measured native preview on a secondary display", () => {
        const bounds = { x: -1440, y: 60, width: 801, height: 600 };
        const panes = hudTerminalPaneBounds(bounds, { blockIds: ["a", "b"], direction: "horizontal", ratio: 0.5 });
        expect(panes[0].x).toBe(bounds.x);
        expect(panes[1].x).toBe(panes[0].x + panes[0].width + 4);
        expect(panes[1].x + panes[1].width).toBe(bounds.x + bounds.width);
        expect(panes.every((pane) => pane.height === bounds.height)).toBe(true);
    });
    it("bounds the divider ratio and preserves the vertical preview extent", () => {
        const panes = hudTerminalPaneBounds(
            { x: 10, y: 50, width: 800, height: 604 },
            {
                blockIds: ["a", "b"],
                direction: "vertical",
                ratio: 2,
            }
        );
        expect(panes[0].height).toBe(450);
        expect(panes[1]).toEqual({ x: 10, y: 504, width: 800, height: 150 });
    });
});
