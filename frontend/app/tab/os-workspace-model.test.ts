// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { getKronOSV2Widget, keepKronOSV2View, updateKronOSV2Widgets } from "./os-kronos-v2-widgets";
import {
    arrangeOSLaunchedWindows,
    computeOSWindowLayout,
    findOSDockHitTarget,
    fitOSWindowToContentAspect,
    getOSAdjacentPanes,
    getOSCarouselNeighbor,
    getOSCarouselOrder,
    getOSPaneTakeover,
    makeInitialOSModeState,
    migrateOSModeState,
    OSPaneGap,
    reconcileOSModeState,
    recoverOSWindowBounds,
    reduceOSModeState,
    resolveOSControlAction,
    type OSModeState,
} from "./os-workspace-model";

function tab(meta: Record<string, unknown> = {}): Tab {
    return { oid: "tab-1", blockids: ["browser", "hermes", "term"], meta } as Tab;
}

it("persists KronOS v2 frame edits independently of the original widget layout", () => {
    const initial = makeInitialOSModeState(tab(), ["browser", "term"]);
    const widget = { blockId: "browser", ...initial.windows.browser.bounds, y: -300, visible: false };
    const kronosV2Widgets = updateKronOSV2Widgets(initial.kronosV2Widgets, [widget]);
    const reopened = makeInitialOSModeState(tab({ "layout:os": { ...initial, kronosV2Widgets } }), ["browser", "term"]);
    expect(reopened.kronosV2Widgets.browser).toEqual(widget);
    expect(reopened.windows.browser).toEqual(initial.windows.browser);
    expect(updateKronOSV2Widgets(kronosV2Widgets, [{ ...widget }])).toBe(kronosV2Widgets);
});

it("keeps widget and workflow updates in KronOS v2 when a legacy update tries to change view", () => {
    const v2 = makeInitialOSModeState(tab(), ["browser", "term"]);
    const canvas = { ...v2, view: "canvas" as const };
    const browser = getKronOSV2Widget(v2, "browser");
    const moved = { ...browser, x: browser.x + 200 };
    const updated = { ...canvas, kronosV2Widgets: updateKronOSV2Widgets(v2.kronosV2Widgets, [moved]) };
    const protectedView = keepKronOSV2View(v2, updated, false);
    expect(protectedView.view).toBe("kronos-v2");
    expect(getKronOSV2Widget(protectedView, "browser")).toEqual(moved);
    expect(protectedView.windows.browser).toBe(canvas.windows.browser);
    expect(keepKronOSV2View(v2, canvas, true)).toBe(canvas);
    expect(keepKronOSV2View(canvas, v2, false)).toBe(v2);
});

it.each(["canvas", "design", "file", "kronos-v2"] as const)("migrates saved %s layouts to KronOS v2", (view) => {
    const initial = makeInitialOSModeState(tab(), ["browser", "term"]);
    const canvas = reduceOSModeState(initial, { type: "spatial.freeform" });
    const editor = { ...canvas, view };
    const reopened = makeInitialOSModeState(tab({ "layout:os": editor }), ["browser", "term"]);
    expect(reopened.view).toBe("kronos-v2");
    expect(reopened.camera).toEqual(canvas.camera);
    expect(reopened.windows.browser.bounds).toEqual(canvas.windows.browser.bounds);

    const liveCanvas = reduceOSModeState(reopened, { type: "os.view.set", view: "canvas" });
    const expanded = reduceOSModeState(liveCanvas, { type: "os.window.maximize", blockId: "browser" });
    expect(expanded.scene).toEqual({ kind: "focused", blockId: "browser" });
    const restored = reduceOSModeState(expanded, { type: "os.window.restore", blockId: "browser" });
    expect(restored.scene).toEqual({ kind: "freeform" });
    expect(restored.windows.browser.bounds).toEqual(canvas.windows.browser.bounds);
    expect(restored.camera).toEqual(canvas.camera);
});

it("fits Single mode to the Devices frame and keeps the full height for its toolbar", () => {
    const state = makeInitialOSModeState(tab(), ["browser"]);
    const compact = new Set(["browser"]);
    for (const scene of [
        { kind: "freeform" },
        { kind: "focused", blockId: "browser" },
        { kind: "overview" },
    ] as const) {
        for (const maximized of [false, true]) {
            const current = {
                ...state,
                scene,
                windows: { ...state.windows, browser: { ...state.windows.browser, maximized } },
            };
            const viewport = { width: 1440, height: 900 };
            const farm = computeOSWindowLayout(current, "browser", "linux-vms", viewport);
            const phone = computeOSWindowLayout(current, "browser", "linux-vms", viewport, compact);
            expect(phone.bounds.width).toBeLessThan(farm.bounds.width);
            expect(phone.bounds.width).toBeLessThanOrEqual(340);
            expect(phone.bounds.height).toBe(farm.bounds.height);
            expect(phone.bounds.x).toBeCloseTo(
                scene.kind === "freeform" ? farm.bounds.x : farm.bounds.x + (farm.bounds.width - phone.bounds.width) / 2
            );
            expect(phone.presentation).toBe(farm.presentation);
        }
    }
});

it("places Carousel neighbors beside the actual width of a Single device window", () => {
    const initial = makeInitialOSModeState(tab(), ["browser", "hermes", "term"]);
    const [left, center, right] = getOSCarouselOrder(initial);
    const state = { ...initial, scene: { kind: "focused", blockId: center } as const };
    const viewport = { width: 1440, height: 900 };
    const layout = (id: string, compact?: ReadonlySet<string>) =>
        computeOSWindowLayout(state, id, "web", viewport, compact).bounds;
    const compact = new Set([center]);
    const phone = layout(center, compact);
    const previous = layout(left, compact);
    const next = layout(right, compact);
    expect(previous.x + previous.width + OSPaneGap).toBeCloseTo(phone.x);
    expect(next.x).toBeCloseTo(phone.x + phone.width + OSPaneGap);
    expect(next.x).toBeLessThan(layout(right).x);
});

it("gives a dragged Carousel pane more width than its neighbor without moving the third pane", () => {
    const ids = ["browser", "hermes", "term"];
    const state = reduceOSModeState(makeInitialOSModeState(tab(), ids), {
        type: "os.window.focus",
        blockId: "browser",
    });
    const viewport = { width: 1440, height: 900 };
    const layouts = (current: OSModeState) =>
        Object.fromEntries(ids.map((id) => [id, computeOSWindowLayout(current, id, "web", viewport)]));
    const before = layouts(state);
    const source = before.hermes.bounds;
    const adjacent = getOSAdjacentPanes(before, new Set());
    expect(getOSPaneTakeover(state, "hermes", source, adjacent)).toBeUndefined();
    const takeover = getOSPaneTakeover(state, "hermes", { ...source, x: source.x - 120 }, adjacent);
    expect(takeover).toMatchObject({ left: "browser", right: "hermes" });
    const next = reduceOSModeState(state, takeover);
    const after = layouts(next);
    expect(next.scene).toEqual(state.scene);
    expect(after.hermes.bounds.width).toBeGreaterThan(after.browser.bounds.width);
    expect(after.term.bounds.x).toBeCloseTo(before.term.bounds.x);
    expect(after.term.bounds.width).toBeCloseTo(before.term.bounds.width);
});

describe("OS workspace state", () => {
    it("seeds geometry and canvas notes without mutating Canvas state", () => {
        const canvas = {
            camera: { x: 12, y: 16, zoom: 0.75 },
            rects: { browser: { x: 40, y: 80, width: 900, height: 600 } },
            objects: [{ id: "note-1", kind: "note", x: 4, y: 8, width: 240, height: 176, text: "Keep me" }],
        };
        const tabData = tab({ "layout:canvas": canvas });
        const state = makeInitialOSModeState(tabData, tabData.blockids);
        expect(state.windows.browser.bounds).toEqual(canvas.rects.browser);
        expect(state.objects[0]).toMatchObject({ id: "note-1", text: "Keep me" });
        expect((tabData.meta as any)["layout:os"]).toBeUndefined();
    });

    it("re-places windows seeded before their block view resolved, but never user-placed ones", () => {
        const initial = makeInitialOSModeState(tab(), ["browser", "term"], {});
        expect(initial.windows.browser.provisional).toBe(true);
        const termBounds = initial.windows.term.bounds;

        const resolved = reconcileOSModeState(initial, ["browser", "term"], { browser: "web" });
        expect(resolved.windows.browser.provisional).toBeUndefined();
        expect(resolved.windows.browser.bounds.width).toBeGreaterThan(900);
        expect(resolved.windows.term.provisional).toBe(true);
        expect(resolved.windows.term.bounds).toEqual(termBounds);

        const moved = reduceOSModeState(resolved, { type: "spatial.move", blockId: "term", x: 500, y: 400 });
        const settled = reconcileOSModeState(moved, ["browser", "term"], { browser: "web", term: "term" });
        expect(settled.windows.term.bounds).toMatchObject({ x: 500, y: 400 });
        expect(settled.windows.term.provisional).toBeUndefined();

        const seededTab = tab({ "layout:canvas": { rects: { browser: { x: 1, y: 2, width: 300, height: 200 } } } });
        const seeded = makeInitialOSModeState(seededTab, ["browser"], {});
        expect(seeded.windows.browser.provisional).toBeUndefined();
    });

    it("keeps KronOS v2 active even after legacy view actions", () => {
        const state = makeInitialOSModeState(tab({ "layout:os": { widgetPresentation: "file" } }), ["browser"]);
        expect(state.view).toBe("kronos-v2");
        expect(reduceOSModeState(state, { type: "os.view.set", view: "canvas" })).toBe(state);
    });

    it("migrates older OS layouts without resetting bounds, scene, or typed canvas objects", () => {
        const state = makeInitialOSModeState(
            tab({
                "layout:os": {
                    version: 1,
                    camera: { x: 900, y: 900, zoom: 0.25 },
                    windows: {
                        browser: {
                            blockId: "browser",
                            bounds: { x: 900, y: 900, width: 300, height: 200 },
                            zOrder: 0,
                        },
                    },
                    objects: [
                        {
                            id: "repo-1",
                            kind: "repository",
                            x: 4,
                            y: 8,
                            width: 240,
                            height: 176,
                            resource: "/work/repo",
                        },
                    ],
                    scene: { kind: "focused", blockId: "browser" },
                },
            }),
            ["browser"],
            { browser: "web" }
        );

        expect(state.version).toBe(4);
        expect(state.camera).toEqual({ x: 900, y: 900, zoom: 0.25 });
        expect(state.windows.browser.bounds).toEqual({ x: 900, y: 900, width: 320, height: 220 });
        expect(state.scene).toEqual({ kind: "focused", blockId: "browser" });
        expect(state.objects[0]).toMatchObject({ kind: "repository", resource: "/work/repo" });
        expect(migrateOSModeState({ version: 99 })).toBeUndefined();
    });

    it("preserves block identity through focus, docking, overview, and detach", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "hermes", "term"]);
        state = reduceOSModeState(state, { type: "spatial.focus", blockId: "browser" });
        state = reduceOSModeState(state, {
            type: "spatial.dock",
            blockId: "hermes",
            targetBlockId: "browser",
            side: "left",
        });
        expect(state.scene.kind).toBe("grouped");
        expect(Object.values(state.groups)[0]).toMatchObject({
            primaryBlockId: "browser",
            blockIds: ["hermes", "browser"],
        });
        state = reduceOSModeState(state, { type: "spatial.showOverview" });
        expect(state.scene.kind).toBe("overview");
        state = reduceOSModeState(state, { type: "spatial.restoreScene" });
        expect(state.scene.kind).toBe("grouped");
        state = reduceOSModeState(state, { type: "spatial.detach", blockId: "hermes" });
        expect(state.scene).toEqual({ kind: "focused", blockId: "browser" });
        expect(Object.keys(state.windows)).toEqual(["browser", "hermes", "term"]);
    });

    it("adds a third pane beside the drop target and preserves the remaining split after close", () => {
        const ids = ["browser", "phone", "term"];
        const initial = makeInitialOSModeState(tab(), ids);
        const pair = reduceOSModeState(initial, {
            type: "spatial.dock",
            blockId: "phone",
            targetBlockId: "browser",
            side: "right",
        });
        const three = reduceOSModeState(pair, {
            type: "spatial.dock",
            blockId: "term",
            targetBlockId: "phone",
            side: "left",
        });
        expect(three.scene).toEqual(pair.scene);
        expect(Object.values(three.groups).map((group) => group.blockIds)).toEqual([["browser", "term", "phone"]]);
        const wide = { width: 1920, height: 1080 };
        const compact = new Set(["phone"]);
        const panes = ["browser", "term", "phone"].map(
            (id) => computeOSWindowLayout(three, id, "web", wide, compact).bounds
        );
        expect(panes.map((pane) => pane.y)).toEqual([76, 76, 76]);
        expect(panes[1].x).toBeCloseTo(panes[0].x + panes[0].width + OSPaneGap);
        expect(panes[2].x + panes[2].width).toBeCloseTo(wide.width - 20);
        expect(panes[2].width).toBeLessThanOrEqual(340);
        const narrow = { width: 850, height: 800 };
        expect(computeOSWindowLayout(three, "phone", "web", narrow, compact).bounds.y).toBeGreaterThan(76);
        const closed = reconcileOSModeState(three, ["term", "phone"]);
        expect(closed.scene).toEqual(three.scene);
        expect(Object.values(closed.groups)[0]).toMatchObject({ primaryBlockId: "term", blockIds: ["term", "phone"] });
    });

    it("restores a saved two-widget split in its original order", () => {
        const data = tab({
            "layout:os": {
                version: 4,
                scene: { kind: "grouped", groupId: "legacy" },
                groups: {
                    legacy: {
                        id: "legacy",
                        primaryBlockId: "browser",
                        sideBlockId: "term",
                        side: "left",
                        dividerRatio: 0.3,
                    },
                },
            },
        });
        const state = makeInitialOSModeState(data, ["browser", "term"]);
        expect(state.scene).toEqual({ kind: "grouped", groupId: "legacy" });
        expect(state.groups.legacy.blockIds).toEqual(["term", "browser"]);
        expect(state.groups.legacy.weights).toEqual({ term: 0.6, browser: 1.4 });
    });

    it("supports canonical maximize, minimize, and restore without remounting window identity", () => {
        let state = makeInitialOSModeState(tab(), ["browser"], { browser: "web" });
        const originalBounds = state.windows.browser.bounds;
        state = reduceOSModeState(state, { type: "os.window.maximize", blockId: "browser" });
        expect(state.scene).toEqual({ kind: "focused", blockId: "browser" });
        expect(state.windows.browser).toMatchObject({ maximized: true, restoreBounds: originalBounds });

        state = reduceOSModeState(state, { type: "os.window.minimize", blockId: "browser" });
        expect(state.windows.browser.collapsed).toBe(true);
        state = reduceOSModeState(state, { type: "os.window.restore", blockId: "browser" });
        expect(state.windows.browser.maximized).toBe(true);
        expect(state.scene).toEqual({ kind: "focused", blockId: "browser" });

        state = reduceOSModeState(state, { type: "os.window.restore", blockId: "browser" });
        expect(state.windows.browser.maximized).toBe(false);
        expect(state.windows.browser.bounds).toEqual(originalBounds);
        expect(state.scene).toEqual({ kind: "focused", blockId: "browser" });
    });

    it("recovers off-screen window chrome without changing its size", () => {
        expect(
            recoverOSWindowBounds({ x: 2000, y: -300, width: 800, height: 600 }, { width: 1280, height: 800 })
        ).toEqual({
            x: 1208,
            y: 72,
            width: 800,
            height: 600,
        });
    });

    it("removes stale group references when a live block closes", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "hermes", "term"]);
        state = reduceOSModeState(state, {
            type: "spatial.dock",
            blockId: "hermes",
            targetBlockId: "browser",
            side: "right",
        });
        state = reconcileOSModeState(state, ["browser", "term"]);
        expect(state.groups).toEqual({});
        expect(state.scene).toEqual({ kind: "freeform" });
    });

    it("keeps a live group member focused when either docked window collapses", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "hermes", "term"]);
        state = reduceOSModeState(state, {
            type: "spatial.dock",
            blockId: "hermes",
            targetBlockId: "browser",
            side: "left",
        });
        state = reduceOSModeState(state, { type: "spatial.collapse", blockId: "browser" });

        expect(state.groups).toEqual({});
        expect(state.scene).toEqual({ kind: "focused", blockId: "hermes" });

        state = reduceOSModeState(state, { type: "spatial.restore", blockId: "browser" });
        state = reduceOSModeState(state, {
            type: "spatial.dock",
            blockId: "hermes",
            targetBlockId: "browser",
            side: "right",
        });
        state = reduceOSModeState(state, { type: "spatial.collapse", blockId: "hermes" });

        expect(state.groups).toEqual({});
        expect(state.scene).toEqual({ kind: "focused", blockId: "browser" });
    });

    it("places newly opened windows away from an occupied default slot", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "hermes", "term"]);
        state = {
            ...state,
            windows: {
                ...state.windows,
                term: { ...state.windows.term, bounds: { x: 980, y: 720, width: 760, height: 470 } },
            },
        };

        state = reconcileOSModeState(state, ["browser", "hermes", "term", "files"]);

        expect(state.windows.files.bounds).not.toEqual(state.windows.term.bounds);
    });

    it("lays out a calm focused desktop and flat overview grid from scene state", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "hermes", "term"]);
        state = reduceOSModeState(state, { type: "spatial.focus", blockId: "browser" });
        const peripheral = computeOSWindowLayout(state, "term", "term", { width: 1440, height: 900 });
        expect(peripheral.presentation).toBe("carousel");
        expect(peripheral.opacity).toBe(1);
        const focused = computeOSWindowLayout(state, "browser", "web", { width: 1440, height: 900 });
        expect(focused.presentation).toBe("focused");
        expect(focused.rotateY).toBe(0);
        state = reduceOSModeState(state, { type: "spatial.showOverview", selectedBlockId: "hermes" });
        const selected = computeOSWindowLayout(state, "hermes", "hermes", { width: 1440, height: 900 });
        const neighbor = computeOSWindowLayout(state, "browser", "web", { width: 1440, height: 900 });
        expect(selected.presentation).toBe("overview");
        expect(selected.rotateY).toBe(0);
        expect(neighbor.rotateY).toBe(0);
        expect(neighbor.opacity).toBe(1);
        expect(selected.bounds).not.toEqual(neighbor.bounds);
    });

    it("keeps minimized live windows visible beneath the project-space overview strip", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "term"]);
        state = reduceOSModeState(state, { type: "spatial.collapse", blockId: "term" });
        state = reduceOSModeState(state, { type: "os.window.overview" });
        const layout = computeOSWindowLayout(state, "term", "term", { width: 1280, height: 800 });
        expect(layout.presentation).toBe("overview");
        expect(layout.opacity).toBe(1);
        expect(layout.bounds.y).toBeGreaterThanOrEqual(328);
        expect(layout.bounds.y + layout.bounds.height).toBeLessThanOrEqual(740);
        expect(state.windows.term.collapsed).toBe(true);
        state = reduceOSModeState(state, { type: "spatial.restoreScene" });
        expect(computeOSWindowLayout(state, "term", "term", { width: 1280, height: 800 }).opacity).toBe(0);
    });

    it("finds the topmost live window beneath a dragged floating window", () => {
        const hit = findOSDockHitTarget(
            "hermes",
            { x: 740, y: 320 },
            {
                browser: {
                    bounds: { x: 300, y: 120, width: 900, height: 620 },
                    opacity: 1,
                    presentation: "freeform",
                    zIndex: 4,
                },
                sheets: {
                    bounds: { x: 520, y: 160, width: 780, height: 580 },
                    opacity: 1,
                    presentation: "freeform",
                    zIndex: 8,
                },
                hermes: {
                    bounds: { x: 610, y: 220, width: 360, height: 480 },
                    opacity: 1,
                    presentation: "freeform",
                    zIndex: 12,
                },
            }
        );
        expect(hit).toMatchObject({ targetBlockId: "sheets", side: "left" });
    });

    it("lays out a block that has not been reconciled into a window yet", () => {
        const state = reduceOSModeState(makeInitialOSModeState(tab(), ["browser"], { browser: "web" }), {
            type: "spatial.freeform",
        });
        const layout = computeOSWindowLayout(state, "late-block", "term", { width: 1440, height: 900 });
        expect(layout.presentation).toBe("freeform");
        expect(layout.bounds.width).toBeGreaterThan(0);
        expect(computeOSWindowLayout(state, "browser", "web", { width: 1440, height: 900 }).bounds).toEqual(
            state.windows.browser.bounds
        );
    });

    it("fits a window to a stream aspect by width, falling back to height when it would overflow", () => {
        const world = { width: 1600, height: 1000 };
        const wide = fitOSWindowToContentAspect({ x: 10, y: 20, width: 810, height: 600 }, 16 / 9, world);
        expect(wide).toMatchObject({ x: 10, y: 20, width: 810 });
        expect((wide!.height - 43) / 800).toBeCloseTo(9 / 16, 2);

        const tall = fitOSWindowToContentAspect({ x: 0, y: 0, width: 1010, height: 500 }, 908 / 1280, world);
        expect(tall!.height).toBeLessThanOrEqual(world.height * 0.86 + 1);
        expect((tall!.width - 10) / (tall!.height - 43)).toBeCloseTo(908 / 1280, 2);

        expect(fitOSWindowToContentAspect({ x: 0, y: 0, width: 810, height: 493 }, 16 / 9, world)).toBeUndefined();
    });
});

describe("focused desktop geometry", () => {
    it("keeps live windows side by side in a stable carousel order while focus changes", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "hermes", "term"]);
        state = reduceOSModeState(state, { type: "os.window.focus", blockId: "hermes" });
        const viewport = { width: 1440, height: 900 };
        const layouts = ["browser", "hermes", "term"].map((id) => computeOSWindowLayout(state, id, "web", viewport));
        expect(layouts.map((layout) => layout.presentation)).toEqual(["carousel", "focused", "carousel"]);
        expect(layouts.every((layout) => layout.opacity === 1 && layout.scale === 1 && layout.rotateY === 0)).toBe(
            true
        );
        expect(layouts[0].bounds.x + layouts[0].bounds.width).toBeLessThan(layouts[1].bounds.x);
        expect(layouts[2].bounds.x).toBeGreaterThan(layouts[1].bounds.x + layouts[1].bounds.width);
        expect(layouts.every(({ bounds }) => bounds.x >= 0 && bounds.x + bounds.width <= viewport.width)).toBe(true);
        expect(getOSCarouselNeighbor(state, -1)).toBe("browser");
        expect(getOSCarouselNeighbor(state, 1)).toBe("term");
        state = reduceOSModeState(state, { type: "os.window.focus", blockId: "browser" });
        expect(getOSCarouselOrder(state)).toEqual(["browser", "hermes", "term"]);
        expect(getOSCarouselNeighbor(state, -1)).toBeUndefined();
        expect(getOSCarouselNeighbor(state, 1)).toBe("hermes");
    });

    it("maximizes independently and restores the carousel without losing its canvas bounds", () => {
        let state = makeInitialOSModeState(tab(), ["browser", "term"]);
        const original = state.windows.browser.bounds;
        state = reduceOSModeState(state, { type: "os.window.maximize", blockId: "browser" });
        expect(computeOSWindowLayout(state, "term", "term", { width: 1440, height: 900 }).opacity).toBe(0);
        state = reduceOSModeState(state, { type: "os.window.restore", blockId: "browser" });
        expect(computeOSWindowLayout(state, "term", "term", { width: 1440, height: 900 }).presentation).toBe(
            "carousel"
        );
        expect(state.windows.browser.bounds).toEqual(original);
    });
    it("converts an older freeform desktop to focus without losing canvas geometry", () => {
        const bounds = { x: 450, y: 120, width: 800, height: 600 };
        const state = makeInitialOSModeState(
            tab({
                "layout:os": {
                    version: 4,
                    scene: { kind: "freeform" },
                    camera: { x: 12, y: 18, zoom: 0.75 },
                    windows: { browser: { blockId: "browser", bounds, zOrder: 0 } },
                },
            }),
            ["browser"]
        );
        expect(state.scene).toEqual({ kind: "focused", blockId: "browser" });
        expect(state.windows.browser.bounds).toEqual(bounds);
        expect(state.camera).toEqual({ x: 12, y: 18, zoom: 0.75 });
        const canvas = reduceOSModeState(state, { type: "spatial.freeform" });
        expect(makeInitialOSModeState(tab({ "layout:os": canvas }), ["browser"]).scene).toEqual({ kind: "freeform" });
    });

    it("focuses the next live app after minimizing the active one", () => {
        const state = makeInitialOSModeState(tab(), ["browser", "term"]);
        expect(reduceOSModeState(state, { type: "os.window.minimize", blockId: "term" }).scene).toEqual({
            kind: "focused",
            blockId: "browser",
        });
    });

    it("starts focused while preserving an explicitly saved freeform layout", () => {
        expect(makeInitialOSModeState(tab(), ["browser"]).scene).toEqual({ kind: "focused", blockId: "browser" });
        expect(
            makeInitialOSModeState(tab({ "layout:os": { scene: { kind: "freeform" }, desktopLayout: "freeform" } }), [
                "browser",
            ]).scene
        ).toEqual({ kind: "freeform" });
    });

    it.each([
        [1920, 1080],
        [1440, 900],
        [1280, 800],
        [720, 600],
    ])("fills usable space at %ix%i without covering shell or rail", (width, height) => {
        const state = makeInitialOSModeState(tab(), ["browser"]);
        for (const view of ["web", "term", "appstream", "hermes"]) {
            const layout = computeOSWindowLayout(state, "browser", view, { width, height });
            expect(layout.presentation).toBe("focused");
            expect(layout.scale).toBe(1);
            expect(layout.bounds.y).toBeGreaterThanOrEqual(72);
            expect(layout.bounds.y + layout.bounds.height).toBeLessThanOrEqual(height - 12);
            expect(layout.bounds.x + layout.bounds.width).toBeLessThanOrEqual(width - (width > 900 ? 96 : 0));
            if (view !== "hermes") expect(layout.bounds.width).toBeGreaterThan(width * 0.87);
        }
        const media = computeOSWindowLayout(state, "browser", "web", { width, height, rightInset: 264 });
        expect(media.bounds.x + media.bounds.width).toBeLessThanOrEqual(width - (width > 900 ? 264 : 0));
    });
});

describe("resolveOSControlAction", () => {
    it("rewrites canonical os.* names to the compatibility branches", () => {
        expect(resolveOSControlAction({ action: "os.window.minimize", blockid: "b" }).action).toBe("spatial.collapse");
        expect(resolveOSControlAction({ action: "os.window.snap" }).action).toBe("spatial.dock");
        expect(resolveOSControlAction({ action: "os.space.switch" }).action).toBe("spatial.switchWorkspace");
        expect(resolveOSControlAction({ action: "os.resource.open" }).action).toBe("spatial.openFile");
    });

    it("launches native apps or KronOS views from os.app.launch", () => {
        expect(resolveOSControlAction({ action: "os.app.launch", appid: "com.x" }).action).toBe("spatial.openApp");
        expect(resolveOSControlAction({ action: "os.app.launch", view: "term" }).action).toBe("spatial.open");
    });

    it("leaves directly handled actions alone", () => {
        expect(resolveOSControlAction({ action: "os.window.maximize" }).action).toBe("os.window.maximize");
        expect(resolveOSControlAction({ action: "fit" }).action).toBe("fit");
    });
});

describe("os.window.setBounds / os.window.arrangeBounds", () => {
    function stateWith(ids: string[]) {
        let state = makeInitialOSModeState(tab(), ids, Object.fromEntries(ids.map((id) => [id, "term"])));
        state = reduceOSModeState(state, { type: "spatial.collapse", blockId: ids[0] });
        return state;
    }

    it("places one window, restores it, and raises it", () => {
        const state = reduceOSModeState(stateWith(["a", "b"]), {
            type: "os.window.setBounds",
            blockId: "a",
            bounds: { x: 10, y: 20, width: 100, height: 100 },
        });
        expect(state.windows.a).toMatchObject({ collapsed: false, bounds: { x: 10, y: 20, width: 320, height: 220 } });
        expect(state.zOrder[state.zOrder.length - 1]).toBe("a");
        expect(state.scene).toEqual({ kind: "freeform" });
    });

    it("arranges many windows in one update and ignores unknown ids", () => {
        const state = reduceOSModeState(stateWith(["a", "b"]), {
            type: "os.window.arrangeBounds",
            bounds: {
                a: { x: 0, y: 0, width: 400, height: 300 },
                b: { x: 410, y: 0, width: 400, height: 300 },
                ghost: { x: 0, y: 0, width: 400, height: 300 },
            },
        });
        expect(state.windows.b.bounds.x).toBe(410);
        expect(state.windows.ghost).toBeUndefined();
    });
});

describe("OS launch choreography", () => {
    it("centers the first app and moves it left when a second app arrives", () => {
        const empty = { ...makeInitialOSModeState(tab(), []), view: "canvas" as const };
        const first = arrangeOSLaunchedWindows(empty, reconcileOSModeState(empty, ["browser"]), {
            width: 1440,
            height: 900,
        });
        expect(first.windows.browser.bounds).toEqual({ x: 240, y: 80, width: 960, height: 720 });
        const second = arrangeOSLaunchedWindows(first, reconcileOSModeState(first, ["browser", "term"]), {
            width: 1440,
            height: 900,
        });
        expect(second.windows.browser.bounds).toEqual({ x: 28, y: 80, width: 684, height: 720 });
        expect(second.windows.term.bounds).toEqual({ x: 728, y: 80, width: 684, height: 720 });
        expect(first.windows.browser.bounds.x).toBe(240);
        expect(second.scene.kind).toBe("freeform");
        const resolved = reconcileOSModeState(second, ["browser", "term"], { browser: "web", term: "term" });
        expect(resolved.windows.term.bounds).toEqual(second.windows.term.bounds);
    });

    it("preserves restored layouts, overview, zoomed canvases, and narrow desktops", () => {
        const first = makeInitialOSModeState(tab(), ["browser"]);
        const next = reconcileOSModeState(first, ["browser", "term"]);
        expect(arrangeOSLaunchedWindows(first, next, { width: 600, height: 800 })).toBe(next);
        expect(arrangeOSLaunchedWindows(first, first, { width: 1440, height: 900 })).toBe(first);
        expect(
            arrangeOSLaunchedWindows({ ...first, scene: { kind: "overview" } }, next, { width: 1440, height: 900 })
        ).toBe(next);
        expect(
            arrangeOSLaunchedWindows(
                { ...first, scene: { kind: "freeform" }, camera: { x: 20, y: 0, zoom: 1 } },
                next,
                { width: 1440, height: 900 }
            )
        ).toBe(next);
    });
});

it("keeps freeform workflow objects and camera visible when an OS tool focuses a widget", () => {
    const state = makeInitialOSModeState(
        tab({ "layout:os": { scene: { kind: "freeform" }, desktopLayout: "freeform" } }),
        ["browser", "term"]
    );
    state.camera = { x: 185, y: -75, zoom: 0.65 };
    state.objects = [{ id: "workflow:flow:node", kind: "workflow-node", x: 300, y: 240, width: 100, height: 100 }];
    state.sceneOrder = ["browser", "workflow:flow:node", "term"];
    state.windows.browser.collapsed = true;
    const next = reduceOSModeState(state, { type: "os.window.focus", blockId: "browser" });
    expect(next.scene).toBe(state.scene);
    expect(next.desktopLayout).toBe("freeform");
    expect(next.camera).toBe(state.camera);
    expect(next.objects).toBe(state.objects);
    expect(next.windows.browser.bounds).toBe(state.windows.browser.bounds);
    expect(next.windows.term).toBe(state.windows.term);
    expect(next.windows.browser.collapsed).toBe(false);
    expect(next.selectedEntityId).toBe("browser");
    expect(next.zOrder.at(-1)).toBe("browser");
    expect(next.sceneOrder).toEqual(["workflow:flow:node", "term", "browser"]);
    expect(computeOSWindowLayout(next, "browser", "web", { width: 1440, height: 900 }).presentation).toBe("freeform");
    expect(reduceOSModeState(state, { type: "spatial.focus", blockId: "browser" }).scene).toEqual({
        kind: "focused",
        blockId: "browser",
    });
});

it("retains carousel focus when freeform was not the chosen desktop layout", () => {
    const state = {
        ...makeInitialOSModeState(tab(), ["browser", "term"]),
        scene: { kind: "freeform" } as const,
        desktopLayout: "focused" as const,
    };
    const next = reduceOSModeState(state, { type: "os.window.focus", blockId: "browser" });
    expect(next.scene).toEqual({ kind: "focused", blockId: "browser" });
    expect(next.desktopLayout).toBe("focused");
});
