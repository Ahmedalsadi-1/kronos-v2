import { describe, expect, it } from "vitest";
import {
    computeOSWindowLayout,
    getOSCarouselOrder,
    makeInitialOSModeState,
    reconcileOSModeState,
    reduceOSModeState,
} from "./os-workspace-model";

describe("OS tab groups", () => {
    const initial = () => makeInitialOSModeState({ meta: {} } as Tab, ["browser", "terminal", "editor"]);
    it("groups without replacing live window state and switches tabs", () => {
        const state = initial();
        const grouped = reduceOSModeState(state, {
            type: "os.tabs.group",
            blockId: "terminal",
            targetBlockId: "browser",
        });
        expect(grouped.windows).toBe(state.windows);
        expect(getOSCarouselOrder(grouped)).toEqual(["terminal", "editor"]);
        expect(computeOSWindowLayout(grouped, "browser", "web", { width: 1440, height: 900 }).opacity).toBe(0);
        const selected = reduceOSModeState(grouped, { type: "os.window.focus", blockId: "browser" });
        expect(getOSCarouselOrder(selected)).toEqual(["browser", "editor"]);
        expect(selected.tabGroups[0].activeBlockId).toBe("browser");
        expect(computeOSWindowLayout(selected, "browser", "web", { width: 1440, height: 900 }).bounds.y).toBe(108);
    });
    it("reorders, restores minimized tabs, detaches, and removes closed members", () => {
        let state = reduceOSModeState(initial(), {
            type: "os.tabs.group",
            blockId: "terminal",
            targetBlockId: "browser",
        });
        state = reduceOSModeState(state, { type: "os.tabs.reorder", blockId: "terminal", index: 0 });
        expect(state.tabGroups[0].blockIds).toEqual(["terminal", "browser"]);
        state = reduceOSModeState(state, { type: "os.window.minimize", blockId: "terminal" });
        expect(getOSCarouselOrder(state)).toContain("browser");
        state = reduceOSModeState(state, { type: "os.window.focus", blockId: "terminal" });
        expect(getOSCarouselOrder(state)).toContain("terminal");
        expect(reconcileOSModeState(state, ["browser", "editor"]).tabGroups).toEqual([]);
        expect(reduceOSModeState(state, { type: "os.tabs.detach", blockId: "terminal" }).tabGroups).toEqual([]);
    });
});
