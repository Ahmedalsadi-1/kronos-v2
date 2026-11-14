import { describe, expect, test } from "vitest";

import { APP_ROUTES } from "@hermes/app/routes";
import { BASE_SETTINGS_VIEWS } from "@hermes/app/settings/views";

import { hudSections } from "./sections";

describe("HUD section catalog", () => {
    test("exposes every built-in page and every Hermes settings view", () => {
        const sections = hudSections();
        const routes = sections.map((section) => section.route);
        for (const page of APP_ROUTES.filter((route) => !["chat", "settings"].includes(route.view))) {
            expect(routes).toContain(page.path);
        }
        for (const view of BASE_SETTINGS_VIEWS) {
            expect(routes).toContain(`/settings?tab=${view}`);
        }
        expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
    });

    test("keeps host settings distinct from agent settings with the same name", () => {
        const sections = hudSections([
            { id: "voice", label: "Voice" },
            { id: "visual", label: "Visual" },
        ]);
        expect(sections.find((section) => section.id === "kronterm:voice")).toMatchObject({
            name: "KronOS Voice",
            route: "/settings?tab=kronterm:voice",
        });
        expect(sections.find((section) => section.id === "setting:config:voice")?.route).toBe(
            "/settings?tab=config:voice"
        );
    });
});
