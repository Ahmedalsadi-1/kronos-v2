// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export function osWidgetOwnsWheel(path: EventTarget[], zoomGesture: boolean, handTool: boolean): boolean {
    if (zoomGesture || handTool) return false;
    return path.some(
        (target) =>
            target instanceof HTMLElement &&
            target.matches(".os-window-content, [data-live-blockid], .os-canvas-note-editor")
    );
}

export function osCanvasOwnsDelete(path: EventTarget[], root: HTMLElement, defaultPrevented: boolean): boolean {
    if (defaultPrevented || !path.includes(root)) return false;
    return !path.some(
        (target) =>
            target instanceof HTMLElement &&
            target.matches(
                "input, textarea, select, [contenteditable='true'], [role='application'], .os-window-content, [data-workflow-native-host], [data-workflow-chrome], [data-workflow-details], [data-workflow-inspector], .os-agent-sidebar, .os-files-inspector"
            )
    );
}
