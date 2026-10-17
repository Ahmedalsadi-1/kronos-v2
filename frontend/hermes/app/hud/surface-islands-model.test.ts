import type { HermesKronTermSurface } from "@hermes/global";
import { describe, expect, it } from "vitest";
import { hudSurfaceLabel, selectHudSurface } from "./surface-islands-model";

const surfaces: HermesKronTermSurface[] = [
    { id: "browser", title: "Background browser", view: "web", active: false, focused: false },
    { id: "sandbox", title: "Sandbox", view: "sandbox", active: true, focused: false },
    { id: "terminal", title: "Terminal", view: "term", active: false, focused: true },
];

describe("HUD widget island selection", () => {
    it("preserves the user's background browser selection during agent work elsewhere", () => {
        expect(selectHudSurface(surfaces, "browser")).toBe(surfaces[0]);
    });
    it("recovers from a closed selection to current agent work, then focus", () => {
        expect(selectHudSurface(surfaces, "closed").id).toBe("sandbox");
        expect(
            selectHudSurface(
                surfaces.map((surface) => ({ ...surface, active: false })),
                "closed"
            ).id
        ).toBe("terminal");
    });
    it("selects existing widgets when no agent task is running", () => {
        expect(selectHudSurface([surfaces[0]])).toBe(surfaces[0]);
        expect(selectHudSurface([])).toBeUndefined();
    });
    it("labels browser pages without exposing complete block metadata", () => {
        expect(
            hudSurfaceLabel({
                ...surfaces[0],
                browserTabs: [{ id: "page", title: "Current page", url: "https://example.com", active: true }],
            })
        ).toBe("Current page");
    });
});
