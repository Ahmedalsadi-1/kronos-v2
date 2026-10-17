// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { resolveOSControlAction, type OSCanvasObject, type OSModeState } from "./os-workspace-model";
import { findNonOverlappingCanvasRect } from "./workspace-canvas-utils";
import type { WorkspaceSurfaceControlInput } from "./workspace-surface-runtime";

const WindowActions = new Set([
    "os.tabs.group",
    "os.tabs.detach",
    "os.tabs.reorder",
    "focus",
    "move",
    "resize",
    "spatial.focus",
    "spatial.move",
    "spatial.resize",
    "spatial.dock",
    "spatial.detach",
    "spatial.collapse",
    "spatial.restore",
    "os.window.maximize",
    "os.window.close",
    "os.window.place",
]);

export function validateOSSurfaceControl(
    state: OSModeState,
    rawInput: WorkspaceSurfaceControlInput
): string | undefined {
    const input = resolveOSControlAction(rawInput);
    if (
        input.action === "os.tabs.group" &&
        (!state.windows[input.targetblockid] || input.targetblockid === input.blockid)
    )
        return "A different live tab target is required.";
    if (input.action === "os.tabs.reorder" && (!Number.isInteger(input.index) || input.index < 0))
        return "A nonnegative tab index is required.";
    if (WindowActions.has(input.action) && (!input.blockid || !state.windows[input.blockid])) {
        return "OS window not found.";
    }
    if (input.action === "spatial.dock") {
        if (!input.targetblockid || !state.windows[input.targetblockid] || input.targetblockid === input.blockid) {
            return "A different live target OS window is required.";
        }
        if (input.side !== "left" && input.side !== "right") return "Dock side must be left or right.";
    }
    if (input.action === "move" || input.action === "spatial.move") {
        if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) return "Finite window coordinates are required.";
    }
    if (input.action === "resize" || input.action === "spatial.resize") {
        if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0) {
            return "Positive finite window dimensions are required.";
        }
    }
    if (input.action === "update_object" || input.action === "delete_object") {
        if (!input.objectid || !state.objects.some((object) => object.id === input.objectid)) {
            return "OS canvas object not found.";
        }
    }
    if (input.action === "add_note" || input.action === "update_object") {
        for (const key of ["x", "y", "width", "height"] as const) {
            if (
                input[key] != null &&
                (!Number.isFinite(input[key]) || ((key === "width" || key === "height") && input[key] <= 0))
            ) {
                return "Object geometry must be finite with positive dimensions.";
            }
        }
        if (input.color != null && !["amber", "blue", "green", "rose", "slate"].includes(input.color))
            return "Unsupported object color.";
    }
    if (input.action === "connect_objects") {
        const from = state.objects.find((object) => object.id === input.fromobjectid && object.kind !== "connector");
        const to = state.objects.find((object) => object.id === input.toobjectid && object.kind !== "connector");
        if (!from || !to || from.id === to.id) return "Two different live objects are required.";
    }
    if (input.action === "navigate" && !["up", "right", "down", "left"].includes(input.direction))
        return "A valid direction is required.";
    return undefined;
}

export function placeOSCanvasObject(
    state: OSModeState,
    object: OSCanvasObject,
    input: Partial<WorkspaceSurfaceControlInput> = {}
): OSCanvasObject {
    const preferred = {
        ...object,
        ...Object.fromEntries(
            Object.entries(input).filter(
                ([key, value]) => ["x", "y", "width", "height", "text", "color"].includes(key) && value != null
            )
        ),
    } as OSCanvasObject;
    return {
        ...preferred,
        ...findNonOverlappingCanvasRect(preferred, [
            ...Object.values(state.windows)
                .filter((window) => !window.collapsed)
                .map((window) => window.bounds),
            ...state.objects.filter((item) => item.kind !== "connector"),
        ]),
    };
}

export function getOSNavigationTarget(
    state: OSModeState,
    direction: WorkspaceSurfaceControlInput["direction"]
): string | undefined {
    const entries = Object.values(state.windows).filter((window) => !window.collapsed);
    const current = entries.find((window) => window.blockId === state.selectedEntityId);
    if (!current) return entries[0]?.blockId;
    const horizontal = direction === "left" || direction === "right";
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    return entries
        .filter((window) => window !== current)
        .map((window) => {
            const dx = window.bounds.x + window.bounds.width / 2 - current.bounds.x - current.bounds.width / 2;
            const dy = window.bounds.y + window.bounds.height / 2 - current.bounds.y - current.bounds.height / 2;
            return {
                id: window.blockId,
                forward: (horizontal ? dx : dy) * sign,
                score: Math.hypot(dx, dy) + Math.abs(horizontal ? dy : dx),
            };
        })
        .filter((candidate) => candidate.forward > 0)
        .sort((a, b) => a.score - b.score)[0]?.id;
}
