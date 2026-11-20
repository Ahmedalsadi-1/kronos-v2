import { describe, expect, it } from "vitest";
import { getPenChatNavigationItem, penChatSettingsRoute } from "./pen-chat-navigation-model";

describe("Pen chat navigation targets", () => {
    it("does not interpret unknown values or arbitrary routes as navigation requests", () => {
        for (const id of [null, {}, "__proto__", "/settings?tab=keys", "", "new-session"])
            expect(getPenChatNavigationItem(id)).toBeUndefined();
        expect(getPenChatNavigationItem("scheduled")?.target).toEqual({ kind: "history-tool", tool: "cron" });
    });

    it("keeps native Hermes settings distinct from host-provided sections", () => {
        expect(penChatSettingsRoute({ kind: "hermes-settings", section: "plugins" })).toBe("/settings?tab=plugins");
        expect(penChatSettingsRoute({ kind: "hermes-settings", section: "providers" })).toBe("/settings?tab=providers");
        expect(penChatSettingsRoute({ kind: "workspace-settings", section: "canvas" })).toBe(
            "/settings?tab=kronterm%3Acanvas"
        );
        expect(penChatSettingsRoute({ kind: "hermes-settings" })).toBe("/settings");
    });
});
