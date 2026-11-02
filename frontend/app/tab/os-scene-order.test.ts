// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import {
    applyOSWorkflowSelection,
    getOSCanvasEntityBounds,
    getOSSceneZIndices,
    getPersistedOSSceneOrder,
    reconcileOSSceneOrder,
    selectOSSceneEntity,
} from "./os-scene-order";
import {
    makeInitialOSModeState,
    reconcileOSModeState,
    reduceOSModeState,
    type OSModeState,
    type OSSpatialAction,
} from "./os-workspace-model";

const NodeId = "workflow:flow:node";
function fixture(): OSModeState {
    return {
        ...makeInitialOSModeState({ oid: "tab", blockids: ["terminal"], meta: {} } as Tab, ["terminal"]),
        scene: { kind: "freeform" },
        camera: { x: 25, y: 40, zoom: 0.5 },
        objects: [
            { id: "note", kind: "note", x: 100, y: 100, width: 200, height: 100 },
            { id: NodeId, kind: "workflow-node", x: 120, y: 120, width: 100, height: 100 },
            {
                id: "link",
                kind: "connector",
                fromObjectId: "note",
                toObjectId: NodeId,
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
        ],
        sceneOrder: ["terminal", "note", NodeId],
    };
}

it("resolves annotation endpoints against live windows, notes and original workflow nodes", () => {
    const state = fixture();
    expect(getOSCanvasEntityBounds(state, "terminal")).toEqual(state.windows.terminal.bounds);
    expect(getOSCanvasEntityBounds(state, "note")).toEqual(state.objects[0]);
    expect(getOSCanvasEntityBounds(state, NodeId)).toEqual(state.objects[1]);
    expect(getOSCanvasEntityBounds(state, "link")).toBeUndefined();
    expect(getOSCanvasEntityBounds(state, "missing")).toBeUndefined();
    state.windows.terminal.collapsed = true;
    expect(getOSCanvasEntityBounds(state, "terminal")).toBeUndefined();
});

it("interleaves a workflow node, note, and application window in one per-entity stack", () => {
    let state = fixture();
    let ranks = getOSSceneZIndices(state);
    expect(ranks[NodeId]).toBeGreaterThan(ranks.note);
    expect(ranks.note).toBeGreaterThan(ranks.terminal);
    state = selectOSSceneEntity(state, "terminal");
    ranks = getOSSceneZIndices(state);
    expect(ranks.terminal).toBeGreaterThan(ranks[NodeId]);
    state = selectOSSceneEntity(state, "note");
    ranks = getOSSceneZIndices(state);
    expect(ranks.note).toBeGreaterThan(ranks.terminal);
    state = applyOSWorkflowSelection(state, NodeId);
    expect(getOSSceneZIndices(state)[NodeId]).toBeGreaterThan(getOSSceneZIndices(state).note);
    expect(Object.keys(ranks)).not.toContain("link");
});

it("selects and raises objects without changing camera, scene, or the legacy window order", () => {
    for (const scene of [{ kind: "freeform" }, { kind: "focused", blockId: "terminal" }] as const) {
        const state = { ...fixture(), scene };
        const next = selectOSSceneEntity(state, "note");
        expect(next.scene).toBe(state.scene);
        expect(next.camera).toBe(state.camera);
        expect(next.zOrder).toBe(state.zOrder);
        expect(next.selectedEntityId).toBe("note");
        expect(next.sceneOrder.at(-1)).toBe("note");
    }
    expect(reduceOSModeState(fixture(), { type: "spatial.focus", blockId: "terminal" }).scene).toEqual({
        kind: "focused",
        blockId: "terminal",
    });
});

it("keeps live workflow ordering during block reconciliation and removes stale identities", () => {
    const state = fixture();
    state.sceneOrder = [NodeId, "removed-window", "note", "terminal", NodeId, "link"];
    const reconciled = reconcileOSModeState(state, ["terminal", "browser"]);
    expect(reconciled.sceneOrder).toEqual([NodeId, "note", "terminal", "browser"]);
    expect(reconciled.zOrder).toEqual(["terminal", "browser"]);
    expect(reconcileOSSceneOrder(reconciled.sceneOrder, ["browser"], [{ ...state.objects[0] }])).toEqual([
        "note",
        "browser",
    ]);
});

it("excludes ephemeral workflow objects from persisted ordering while retaining durable object order", () => {
    const state = selectOSSceneEntity(fixture(), "note");
    const persistedOrder = getPersistedOSSceneOrder(state);
    expect(persistedOrder).toEqual(["terminal", "note"]);
    expect(state.sceneOrder).toContain(NodeId);
    const restored = makeInitialOSModeState(
        {
            oid: "tab",
            blockids: ["terminal"],
            meta: {
                "layout:os": {
                    ...state,
                    sceneOrder: persistedOrder,
                    objects: state.objects.filter((object) => object.kind !== "workflow-node"),
                },
            },
        } as unknown as Tab,
        ["terminal"]
    );
    expect(restored.sceneOrder).toEqual(persistedOrder);
    expect(restored.zOrder).toEqual(["terminal"]);
});

it("does not let a workflow deselection erase a selected OS note or window", () => {
    const note = selectOSSceneEntity(fixture(), "note");
    expect(applyOSWorkflowSelection(note)).toBe(note);
    const window = selectOSSceneEntity(fixture(), "terminal");
    expect(applyOSWorkflowSelection(window)).toBe(window);
    const node = applyOSWorkflowSelection(fixture(), NodeId);
    expect(applyOSWorkflowSelection(node).selectedEntityId).toBeUndefined();
    expect(applyOSWorkflowSelection(note, "unknown-node")).toBe(note);
    expect(selectOSSceneEntity(note, "link")).toBe(note);
});

it("retains the relative order of other objects when a node is brought to front", () => {
    const objects = Array.from({ length: 20 }, (_, index) => ({
        id: `workflow:flow:node-${index}`,
        kind: "workflow-node" as const,
    }));
    const order = reconcileOSSceneOrder(undefined, ["terminal"], objects);
    const state = {
        ...fixture(),
        objects: objects.map((object) => ({ ...object, x: 0, y: 0, width: 100, height: 100 })),
        sceneOrder: order,
    };
    const next = selectOSSceneEntity(state, objects[3].id);
    expect(next.sceneOrder.slice(0, -1)).toEqual(order.filter((id) => id !== objects[3].id));
    expect(Object.values(getOSSceneZIndices(next)).every(Number.isFinite)).toBe(true);
    expect(new Set(Object.values(getOSSceneZIndices(next))).size).toBe(next.sceneOrder.length);
});

it("raises explicit window commands in the shared order without dropping notes or workflow nodes", () => {
    const commands: OSSpatialAction[] = [
        { type: "spatial.focus", blockId: "terminal" },
        { type: "os.window.focus", blockId: "terminal" },
        { type: "os.window.setBounds", blockId: "terminal", bounds: { x: 100, y: 100, width: 600, height: 400 } },
        { type: "os.window.maximize", blockId: "terminal" },
    ];
    for (const action of commands) {
        const original = fixture();
        const next = reduceOSModeState(original, action);
        expect(next.sceneOrder).toEqual(["note", NodeId, "terminal"]);
        expect(next.zOrder).toEqual(["terminal"]);
        expect(next.objects).toBe(original.objects);
        expect(next.camera).toBe(original.camera);
        expect(next.scene).toEqual(
            action.type === "os.window.setBounds" ? { kind: "freeform" } : { kind: "focused", blockId: "terminal" }
        );
        const ranks = getOSSceneZIndices(next);
        expect(ranks.terminal).toBeGreaterThan(ranks[NodeId]);
    }
});

it("raises arranged windows together and preserves the order of non-window scene objects", () => {
    const state = fixture();
    state.windows.browser = { ...state.windows.terminal, blockId: "browser" };
    state.zOrder = ["terminal", "browser"];
    state.sceneOrder = ["terminal", "note", NodeId, "browser"];
    const next = reduceOSModeState(state, {
        type: "os.window.arrangeBounds",
        bounds: {
            terminal: { x: 0, y: 0, width: 500, height: 400 },
            browser: { x: 500, y: 0, width: 500, height: 400 },
        },
    });
    expect(next.sceneOrder).toEqual(["note", NodeId, "terminal", "browser"]);
    expect(next.zOrder).toEqual(["terminal", "browser"]);
    expect(next.scene).toEqual({ kind: "freeform" });
});
