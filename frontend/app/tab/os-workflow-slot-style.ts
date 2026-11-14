// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export type WorkflowSlotKind = "chrome" | "details" | "inspector" | "world";

export function getWorkflowSlotStyle(kind: WorkflowSlotKind): string {
    const bounds = kind === "chrome" || kind === "details" ? "height:auto;width:auto;" : "";
    const details =
        kind === "details"
            ? "[data-workflow-node-editor]{overflow:auto!important} [data-workflow-node-editor]>div:has(>main){min-width:720px}"
            : "";
    const world =
        kind === "world" ? ".vue-flow__nodes{--canvas-node--border-color:var(--os-canvas-frame-border,#000)}" : "";
    const chrome =
        kind === "chrome"
            ? ".kronterm-workflow-header,.kronterm-workflow-logs{border:var(--os-canvas-frame-width,8px) solid var(--os-canvas-frame-border,#000);border-radius:12px}"
            : "";
    const panelPalette =
        kind === "world"
            ? ""
            : `
        :host([data-theme="dark"]) [data-workflow-slot-root] {
            --color--background: #242528;
            --color--background--light-1: #202124;
            --color--background--light-2: #1d1e20;
            --color--background--light-3: #191a1c;
        }
    `;
    const picker =
        kind === "inspector"
            ? `
        .kronterm-catalog-overflow {
            flex-shrink: 0;
        }
        .kronterm-catalog-row {
            width: calc(100% - 24px);
            margin-inline: 12px;
            min-height: 48px;
            padding: var(--spacing--xs) var(--spacing--2xs);
            display: flex;
            align-items: center;
            gap: var(--spacing--sm);
            text-align: left;
            background: transparent;
            border: 0;
            border-radius: var(--radius--sm);
            color: var(--color--text);
            cursor: pointer;
        }
        .kronterm-catalog-overflow .kronterm-catalog-row {
            content-visibility: auto;
            contain-intrinsic-block-size: auto 48px;
        }
        .kronterm-catalog-row:hover, .kronterm-catalog-row:focus-visible {
            background: var(--color--background--light-1);
        }
        .kronterm-catalog-row:focus-visible { outline: 1px solid currentColor; outline-offset: -2px; }
        .kronterm-catalog-icon {
            flex: 0 0 28px;
            display: grid;
            place-items: center;
        }
        .kronterm-catalog-label {
            display: grid;
            min-width: 0;
            font-size: var(--node-creator--name--font-size, var(--font-size--sm));
            font-weight: var(--node-creator--name--font-weight, var(--font-weight--medium));
            line-height: 1.115rem;
        }
        .kronterm-catalog-label > * { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .kronterm-catalog-label small, .kronterm-catalog-empty {
            color: var(--color--text--tint-1);
            font-size: var(--font-size--2xs);
            font-weight: var(--font-weight--regular);
            line-height: 1rem;
        }
        .kronterm-catalog-empty { margin: 4px 14px 8px; }
        .kronterm-catalog-connect { display: flex; gap: 8px; padding: 8px 14px; }
        .kronterm-catalog-connect input, .kronterm-catalog-connect button {
            border: 1px solid var(--color--foreground);
            background: var(--color--background--light-1);
            color: inherit;
            padding: 5px 8px;
            border-radius: 4px;
        }
        .kronterm-catalog-connect input { min-width: 0; flex: 1; }
        [data-test-id="node-creator"]:has([data-kronterm-picker-result]) [data-test-id="node-creator-no-results"] {
            display: none;
        }
    `
            : "";
    // Full-canvas portal carriers must pass input through; original controls opt in within their own bounds.
    return `:host{display:block;${bounds}font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;pointer-events:none;background:transparent!important} :host([hidden]){display:none!important} [data-workflow-slot-root]{width:100%;height:100%;pointer-events:none;background:transparent!important;${kind === "chrome" ? "container-type:inline-size;" : ""}} ${details} ${world} ${chrome} ${panelPalette} ${picker} ${kind === "inspector" ? '[data-workflow-slot-root]{min-height:0;display:flex;flex-direction:column} [data-workflow-slot-root]>*{pointer-events:auto;width:100%;height:100%;min-height:0} [data-test-id="node-creator"]{--node-creator--width:100%!important;position:relative!important;top:0!important;right:0!important;width:100%!important;height:100%!important;min-height:0}' : ""}`;
}
