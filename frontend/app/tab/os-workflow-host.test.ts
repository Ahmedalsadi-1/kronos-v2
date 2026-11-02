// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { expect, it } from "vitest";
import {
    getWorkflowSelectionCommand,
    resolveWorkflowCameraIntent,
    workflowEventMatchesTab,
    workflowOwnsWheel,
} from "./os-workflow-host";

it("fits workflow bounds through the OS camera and rejects malformed viewport commands", () => {
    const current = { x: 10, y: 20, zoom: 1 };
    const viewport = { width: 1200, height: 800 };
    const next = resolveWorkflowCameraIntent(
        { fitBounds: { x: 500, y: 300, width: 400, height: 200 } },
        current,
        viewport
    );
    expect(next.x + 700 * next.zoom).toBeCloseTo(600);
    expect(next.y + 400 * next.zoom).toBeCloseTo(352);
    expect(resolveWorkflowCameraIntent({ camera: { x: 0, y: NaN, zoom: 2 } }, current, viewport)).toBe(current);
    expect(resolveWorkflowCameraIntent({ camera: { x: 0, y: 0, zoom: 500 } }, current, viewport).zoom).toBe(2.4);
});

it("keeps panels scrolling independently while workflow graph gestures reach the OS", () => {
    const panel = document.createElement("div");
    panel.dataset.workflowDetails = "";
    const graph = document.createElement("div");
    graph.dataset.workflowNativeHost = "";
    expect(workflowOwnsWheel([panel])).toBe(true);
    expect(workflowOwnsWheel([graph])).toBe(false);
    expect(workflowEventMatchesTab({ tabId: "other" }, "current")).toBe(false);
    expect(workflowEventMatchesTab({ tabId: "current" }, "current")).toBe(true);
});

it("preserves native multi-selection while switching focus between OS and workflow objects", () => {
    expect(getWorkflowSelectionCommand("workflow:flow:a", "flow", ["a", "b"])).toBeUndefined();
    expect(getWorkflowSelectionCommand("workflow:flow:b", "flow", ["a", "b"])).toBeUndefined();
    expect(getWorkflowSelectionCommand("workflow:flow:c", "flow", ["a", "b"])).toEqual(["c"]);
    expect(getWorkflowSelectionCommand("note", "flow", ["a", "b"])).toEqual([]);
    expect(getWorkflowSelectionCommand(undefined, "flow", [])).toBeUndefined();
});
