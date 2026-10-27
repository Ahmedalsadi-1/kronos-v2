// @vitest-environment jsdom
import { host } from "@hermes/plugin-sdk";
import { expect, it, vi } from "vitest";
import { BotsPlugin, openBotsWorkspace } from "./plugin";

vi.mock("@hermes/plugin-sdk", () => ({
    PALETTE_AREA: "palette",
    SIDEBAR_NAV_AREA: "sidebar.nav",
    host: { revealPane: vi.fn() },
}));
vi.mock("./upstream/hermes-bot-mode.js", () => ({
    default: {
        register(ctx) {
            ctx.register({ id: "pane", area: "panes", render: () => "roster" });
            ctx.register({ id: "routines", area: "panes", render: () => "routines" });
            ctx.register({ id: "mention-middleware", area: "composer.middleware", data: { handler: "upstream" } });
        },
    },
}));

it("uses the upstream roster and preserves routines and composer integration", () => {
    const contributions: any[] = [];
    BotsPlugin.register({
        register: (item) => contributions.push(item),
        registerMany: (items) => contributions.push(...items),
    } as any);
    const pane = contributions.find((item) => item.id === "workspace");
    expect(pane.render()).toBe("roster");
    expect(contributions.find((item) => item.id === "navigation").data).toMatchObject({
        label: "Bot mode",
        pane: "kronterm-bots:workspace",
    });
    expect(contributions.find((item) => item.id === "routines").render()).toBe("routines");
    expect(contributions.find((item) => item.id === "mention-middleware").data.handler).toBe("upstream");
    const toggle = vi.fn();
    window.addEventListener("kronterm:toggle-desktop-companion", toggle);
    try {
        contributions.find((item) => item.id === "companion").data.run();
        expect(toggle).toHaveBeenCalledTimes(1);
    } finally {
        window.removeEventListener("kronterm:toggle-desktop-companion", toggle);
    }
});

it("keeps the existing pane ID for workspace shortcuts", () => {
    openBotsWorkspace();
    expect(host.revealPane).toHaveBeenCalledWith("kronterm-bots:workspace");
});
