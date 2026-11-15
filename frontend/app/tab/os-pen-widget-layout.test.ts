import { expect, it } from "vitest";
import { applyPenWidgetLayout } from "./os-pen-widget-layout";
import { makeInitialOSModeState } from "./os-workspace-model";

const initial = () =>
    makeInitialOSModeState({ oid: "space", blockids: ["browser", "term"], meta: {} } as Tab, ["browser", "term"]);

it("mirrors native drag and resize without replacing a live block or moving the camera", () => {
    const state = initial();
    const widget = { blockId: "browser", x: -40.5, y: 80, width: 600, height: 420, visible: true };
    const next = applyPenWidgetLayout(state, { widgets: [widget], selectedBlockIds: ["browser"] });
    expect(next.windows.browser.bounds).toEqual({ x: -40.5, y: 80, width: 600, height: 420 });
    expect(next.windows.browser.blockId).toBe("browser");
    expect(next.windows.term).toBe(state.windows.term);
    expect(next.camera).toBe(state.camera);
    expect(next.scene).toBe(state.scene);
    expect(next.selectedEntityId).toBe("browser");
    expect(applyPenWidgetLayout(next, { widgets: [widget], selectedBlockIds: ["browser"] })).toBe(next);
});

it("maps native delete and undo to minimize and restore, retaining the live session", () => {
    const state = initial();
    const widget = { blockId: "browser", ...state.windows.browser.bounds, visible: false };
    const hidden = applyPenWidgetLayout(state, { widgets: [widget], selectedBlockIds: [] });
    expect(hidden.windows.browser.collapsed).toBe(true);
    expect(Object.keys(hidden.windows)).toEqual(Object.keys(state.windows));
    const restored = applyPenWidgetLayout(hidden, {
        widgets: [{ ...widget, visible: true }],
        selectedBlockIds: ["browser"],
    });
    expect(restored.windows.browser.collapsed).toBe(false);
    expect(restored.windows.browser.bounds).toEqual(state.windows.browser.bounds);
});

it("ignores unknown block identities and invalid native geometry", () => {
    const state = initial();
    const next = applyPenWidgetLayout(state, {
        widgets: [
            { blockId: "foreign", x: 1, y: 2, width: 3, height: 4, visible: true },
            { blockId: "browser", x: NaN, y: 2, width: 3, height: 4, visible: true },
        ],
        selectedBlockIds: ["foreign"],
    });
    expect(next.windows).toBe(state.windows);
    expect(next.selectedEntityId).toBeUndefined();
});

it("preserves workflow selection when Pen reports only widget geometry", () => {
    const state = { ...initial(), selectedEntityId: "workflow:test:node" };
    const widget = { blockId: "browser", ...state.windows.browser.bounds, visible: true };
    const next = applyPenWidgetLayout(state, {
        widgets: [{ ...widget, x: widget.x + 45 }],
        selectedBlockIds: [],
    });
    expect(next.windows.browser.bounds.x).toBe(widget.x + 45);
    expect(next.selectedEntityId).toBe(state.selectedEntityId);
});
