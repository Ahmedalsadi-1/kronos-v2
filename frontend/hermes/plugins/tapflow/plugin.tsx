// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { host, PALETTE_AREA, PANES_AREA, type HermesPlugin, type PaletteContribution } from "@hermes/plugin-sdk";

const View = "plugin:kronterm.tapflow/devices";
function openWidget() {
    window.dispatchEvent(new CustomEvent("kronterm:open-plugin-widget", { detail: { view: View } }));
}
function TapflowPane() {
    return (
        <section className="grid gap-3 p-4 text-[13px]" aria-label="Tapflow plugin">
            <h2 className="font-medium">Tapflow · Mobile Labs</h2>
            <p>iPhone and Android session widgets, relay settings, App Center, and bot farm task preparation.</p>
            <button
                className="cursor-pointer rounded border border-(--ui-border) px-3 py-2 hover:bg-(--chrome-action-hover)"
                onClick={openWidget}
            >
                Open Tapflow workspace widget
            </button>
            <button
                className="cursor-pointer rounded border border-(--ui-border) px-3 py-2"
                onClick={() => host.navigate("/skills?tab=mcp")}
            >
                Configure Tapflow MCP
            </button>
            <p className="text-xs text-(--ui-text-tertiary)">
                Configure the relay in the widget. Connect Tapflow MCP in Hermes before running device tasks.
            </p>
        </section>
    );
}
export const TapflowPlugin: HermesPlugin = {
    id: "tapflow",
    name: "Tapflow Mobile Labs",
    description: "iPhone and Android widgets, device settings, and shared bot farm tasks.",
    defaultEnabled: true,
    register(ctx) {
        ctx.registerMany([
            {
                id: "devices",
                area: PANES_AREA,
                title: "Tapflow",
                data: { placement: "right", collapsible: true, width: "20rem" },
                render: () => <TapflowPane />,
            },
            {
                id: "open",
                area: PALETTE_AREA,
                data: {
                    id: "tapflow.open",
                    label: "Tapflow: Open mobile workspace",
                    keywords: ["iphone", "ios", "android", "devices", "farm"],
                    run: openWidget,
                } satisfies PaletteContribution,
            },
            {
                id: "settings",
                area: PALETTE_AREA,
                data: {
                    id: "tapflow.settings",
                    label: "Tapflow: Settings and connection",
                    keywords: ["relay", "mobile", "tokens"],
                    run: () => host.revealPane("tapflow:devices"),
                } satisfies PaletteContribution,
            },
        ]);
    },
};
export default TapflowPlugin;
