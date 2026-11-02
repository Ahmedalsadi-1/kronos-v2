// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export type WorkflowSlotKind = "chrome" | "details" | "inspector" | "world";

export function getWorkflowSlotStyle(kind: WorkflowSlotKind): string {
    const bounds = kind === "chrome" || kind === "details" ? "height:auto;width:auto;" : "";
    const details =
        kind === "details"
            ? "[data-workflow-node-editor]{overflow:auto!important} [data-workflow-node-editor]>div:has(>main){min-width:720px}"
            : "";
    // Full-canvas portal carriers must pass input through; original controls opt in within their own bounds.
    return `:host{display:block;${bounds}font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;pointer-events:none;background:transparent!important} :host([hidden]){display:none!important} [data-workflow-slot-root]{width:100%;height:100%;pointer-events:none;background:transparent!important;${kind === "chrome" ? "container-type:inline-size;" : ""}} ${details} ${kind === "inspector" ? '[data-workflow-slot-root]{min-height:0;display:flex;flex-direction:column} [data-workflow-slot-root]>*{pointer-events:auto;width:100%;height:100%;min-height:0} [data-test-id="node-creator"]{--node-creator--width:100%!important;position:relative!important;top:0!important;right:0!important;width:100%!important;height:100%!important;min-height:0}' : ""}`;
}
