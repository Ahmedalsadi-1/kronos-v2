// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import type { HermesPlugin, PluginContribution } from "@hermes/contrib/plugin";
import { host, PALETTE_AREA, SIDEBAR_NAV_AREA } from "@hermes/plugin-sdk";
import HermesBotMode from "./upstream/hermes-bot-mode.js";

export function openBotsWorkspace() {
    host.revealPane("kronterm-bots:workspace");
}

export const BotsPlugin: HermesPlugin = {
    id: "kronterm-bots",
    name: "Hermes Bot Mode",
    description: "Hermes profile conversations, bot roster, avatars, groups, and routines.",
    register(ctx) {
        HermesBotMode.register({
            ...ctx,
            register(contribution: PluginContribution) {
                if (contribution.area === "panes" && contribution.id === "pane") {
                    return ctx.register({
                        ...contribution,
                        id: "workspace",
                        data: { placement: "left", width: "260px", collapsible: true },
                    });
                }
                return ctx.register(contribution);
            },
        });
        ctx.registerMany([
            {
                id: "navigation",
                area: SIDEBAR_NAV_AREA,
                data: { codicon: "organization", label: "Bot mode", pane: "kronterm-bots:workspace" },
                order: -100,
            },
            {
                id: "companion",
                area: PALETTE_AREA,
                data: {
                    id: "bots.companion",
                    label: "Bots: Toggle desktop companion",
                    keywords: ["bot mode", "hud", "regular mode"],
                    run: () => window.dispatchEvent(new Event("kronterm:toggle-desktop-companion")),
                },
            },
            {
                id: "open",
                area: PALETTE_AREA,
                data: {
                    id: "bots.open",
                    label: "Bots: Open workspace",
                    keywords: ["bot", "agents", "desktop"],
                    run: openBotsWorkspace,
                },
            },
        ]);
    },
};

export default BotsPlugin;
