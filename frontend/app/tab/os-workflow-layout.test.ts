// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { keepWorkflowNodeVisible } from "./os-workflow-layout";

it("keeps a selected node reachable when a dock reduces the canvas without moving or zooming the node", () => {
    const camera = { x: 80, y: 120, zoom: 0.5 };
    const node = { x: 1200, y: 1000, width: 100, height: 100 };
    const next = keepWorkflowNodeVisible(camera, node, { width: 700, height: 480 });
    expect(next.zoom).toBe(camera.zoom);
    expect(node.x * next.zoom + next.x + node.width * next.zoom).toBe(668);
    expect(node.y * next.zoom + next.y + node.height * next.zoom).toBe(448);
    expect(node.x).toBe(1200);
});

it("preserves an already visible node and ignores unusable viewport measurements", () => {
    const camera = { x: 10, y: 10, zoom: 1 };
    const node = { x: 100, y: 100, width: 100, height: 100 };
    expect(keepWorkflowNodeVisible(camera, node, { width: 700, height: 480 })).toBe(camera);
    expect(keepWorkflowNodeVisible(camera, node, { width: 0, height: 0 })).toBe(camera);
});

it("keeps the workflow canvas freeform after widget selection and workspace restore", async () => {
    const { activateOSWorkflowCanvas } = await import("./os-workflow-layout");
    const { makeInitialOSModeState } = await import("./os-workspace-model");
    const { selectOSSceneEntity } = await import("./os-scene-order");
    const initial = makeInitialOSModeState({ meta: {} } as Tab, ["files"]);
    const activated = activateOSWorkflowCanvas(initial);
    const focusedWidget = selectOSSceneEntity(activated, "files");
    const restored = makeInitialOSModeState({ meta: { "layout:os": focusedWidget } } as unknown as Tab, ["files"]);
    expect(restored.scene).toEqual({ kind: "freeform" });
    expect(restored.desktopLayout).toBe("freeform");
    expect(restored.windows.files.bounds).toEqual(initial.windows.files.bounds);
});

it("keeps selected workflow nodes below the OS toolbar while retaining horizontal and bottom margins", () => {
    const camera = { x: 32, y: 32, zoom: 0.5 };
    const node = { x: 0, y: 0, width: 100, height: 100 };
    const next = keepWorkflowNodeVisible(camera, node, { width: 700, height: 480 });
    expect(next).toEqual({ x: 32, y: 72, zoom: 0.5 });
    expect(node.y * next.zoom + next.y).toBeGreaterThan(16 + 40);
    expect(keepWorkflowNodeVisible(next, node, { width: 700, height: 480 })).toBe(next);
});

it("opens workflows without changing the KronOS v2 presentation or its saved layout", async () => {
    const { activateOSWorkflowCanvas } = await import("./os-workflow-layout");
    const { makeInitialOSModeState } = await import("./os-workspace-model");
    const state = {
        ...makeInitialOSModeState({ meta: {} } as Tab, ["files"]),
        view: "kronos-v2" as const,
    };
    expect(activateOSWorkflowCanvas(state)).toBe(state);
});
