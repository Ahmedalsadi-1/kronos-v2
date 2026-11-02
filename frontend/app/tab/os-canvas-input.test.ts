// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { expect, it } from "vitest";
import { osCanvasOwnsDelete, osWidgetOwnsWheel } from "./os-canvas-input";

it("preserves live widget scrolling while canvas pan and zoom remain available over the same widget", () => {
    const content = document.createElement("div");
    content.className = "os-window-content";
    const editor = document.createElement("textarea");
    content.append(editor);
    expect(osWidgetOwnsWheel([editor, content], false, false)).toBe(true);
    expect(osWidgetOwnsWheel([editor, content], true, false)).toBe(false);
    expect(osWidgetOwnsWheel([editor, content], false, true)).toBe(false);
    expect(osWidgetOwnsWheel([document.createElement("div")], false, false)).toBe(false);
});

it("deletes canvas selections only from the canvas, preserving text, node, widget and inspector keyboard ownership", () => {
    const root = document.createElement("div");
    const canvasObject = document.createElement("article");
    expect(osCanvasOwnsDelete([canvasObject, root], root, false)).toBe(true);
    expect(osCanvasOwnsDelete([canvasObject, root], root, true)).toBe(false);
    expect(osCanvasOwnsDelete([canvasObject], root, false)).toBe(false);
    for (const selector of [
        "input",
        "textarea",
        ".os-window-content",
        "[data-workflow-native-host]",
        "[data-workflow-details]",
        ".os-agent-sidebar",
    ]) {
        const target = document.createElement(
            selector.startsWith("input") || selector === "textarea" ? selector : "div"
        );
        if (selector.startsWith(".")) target.className = selector.slice(1);
        if (selector.startsWith("[")) target.setAttribute(selector.slice(1, -1), "");
        expect(osCanvasOwnsDelete([target, root], root, false), selector).toBe(false);
    }
});
