// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import type { HermesPlugin, PluginContribution } from "@hermes/contrib/plugin";
import { host, PALETTE_AREA, SIDEBAR_NAV_AREA } from "@hermes/plugin-sdk";
import { ProjectRoomsPane } from "./project-rooms";
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
                        render: () => (
                            <>
                                <button
                                    className="m-2 cursor-pointer rounded border border-(--ui-stroke-secondary) px-3 py-2 text-left text-sm"
                                    onClick={() => host.revealPane("kronterm-bots:project-rooms")}
                                >
                                    Project rooms
                                </button>
                                {contribution.render?.()}
                            </>
                        ),
                        data: { placement: "left", width: "260px", collapsible: true },
                    });
                }
                return ctx.register(contribution);
            },
        });
        ctx.registerMany([
            {
                id: "project-rooms",
                area: "panes",
                title: "Project rooms",
                data: { placement: "right", width: "760px", minWidth: "360px", collapsible: true },
                render: () => <ProjectRoomsPane storage={ctx.storage} />,
            },
            {
                id: "project-rooms-navigation",
                area: SIDEBAR_NAV_AREA,
                data: { codicon: "comment-discussion", label: "Project rooms", pane: "kronterm-bots:project-rooms" },
                order: -99,
            },
            {
                id: "project-rooms-open",
                area: PALETTE_AREA,
                data: {
                    id: "bots.project-rooms",
                    label: "Bots: Open project rooms",
                    keywords: ["team", "handoff", "researcher", "reviewer"],
                    run: () => host.revealPane("kronterm-bots:project-rooms"),
                },
            },
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
