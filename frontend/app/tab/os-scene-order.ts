// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { OSCanvasObject, OSModeState } from "./os-workspace-model";

type SceneObject = Pick<OSCanvasObject, "id" | "kind">;

export function getOSCanvasEntityBounds(state: OSModeState, id?: string) {
    const window = state.windows[id];
    if (window) return window.collapsed ? undefined : window.bounds;
    const object = state.objects.find((object) => object.id === id && object.kind !== "connector");
    return object;
}

export function reconcileOSSceneOrder(
    order: readonly string[] | undefined,
    windowIds: readonly string[],
    objects: readonly SceneObject[]
): string[] {
    const liveIds = [
        ...windowIds,
        ...objects.filter((object) => object.kind !== "connector").map((object) => object.id),
    ];
    const live = new Set(liveIds);
    const result: string[] = [];
    const included = new Set<string>();
    for (const id of [...(order ?? []), ...liveIds]) {
        if (!id || !live.has(id) || included.has(id)) continue;
        included.add(id);
        result.push(id);
    }
    return result;
}

function liveWindowOrder(state: OSModeState): string[] {
    const known = state.zOrder.filter((id) => state.windows[id]);
    return [...new Set([...known, ...Object.keys(state.windows)])];
}

export function getOSSceneZIndices(state: OSModeState): Record<string, number> {
    return Object.fromEntries(
        reconcileOSSceneOrder(state.sceneOrder, liveWindowOrder(state), state.objects).map((id, index) => [
            id,
            index + 1,
        ])
    );
}

export function raiseOSSceneOrder(state: OSModeState, ids: readonly string[]): string[] {
    const order = reconcileOSSceneOrder(state.sceneOrder, liveWindowOrder(state), state.objects);
    const live = new Set(order);
    const raised = [...new Set(ids)].filter((id) => live.has(id));
    const raisedSet = new Set(raised);
    return [...order.filter((id) => !raisedSet.has(id)), ...raised];
}

export function selectOSSceneEntity(state: OSModeState, id?: string): OSModeState {
    if (id == null) return state.selectedEntityId == null ? state : { ...state, selectedEntityId: undefined };
    const sceneOrder = reconcileOSSceneOrder(state.sceneOrder, liveWindowOrder(state), state.objects);
    if (!sceneOrder.includes(id)) return state;
    if (state.objects.some((object) => object.id === id && object.kind === "pen-layer")) {
        return { ...state, selectedEntityId: id };
    }
    const sameOrder =
        state.sceneOrder?.length === sceneOrder.length &&
        sceneOrder.every((entry, index) => entry === state.sceneOrder[index]);
    if (state.selectedEntityId === id && sceneOrder.at(-1) === id && sameOrder) return state;
    return {
        ...state,
        sceneOrder: [...sceneOrder.filter((entry) => entry !== id), id],
        selectedEntityId: id,
    };
}

export function applyOSWorkflowSelection(state: OSModeState, id?: string): OSModeState {
    if (id != null) {
        if (!state.objects.some((object) => object.id === id && object.kind === "workflow-node")) return state;
        return selectOSSceneEntity(state, id);
    }
    if (!state.objects.some((object) => object.id === state.selectedEntityId && object.kind === "workflow-node"))
        return state;
    return selectOSSceneEntity(state);
}

export function getPersistedOSSceneOrder(state: OSModeState): string[] {
    const durableObjects = state.objects.filter((object) => object.kind !== "workflow-node");
    return reconcileOSSceneOrder(state.sceneOrder, liveWindowOrder(state), durableObjects);
}
