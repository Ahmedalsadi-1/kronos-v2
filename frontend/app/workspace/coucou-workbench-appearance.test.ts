// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readCoucouWorkbenchAppearance } from "./coucou-workbench-appearance";

afterEach(() => localStorage.clear());

describe("Coucou workbench appearance", () => {
    it("uses the active chat profile palette and mode", () => {
        localStorage.setItem("hermes-desktop-active-profile-v1", "project");
        localStorage.setItem("hermes-desktop-profile-themes-v1", JSON.stringify({ project: "coucou-teal" }));
        localStorage.setItem("hermes-desktop-profile-modes-v1", JSON.stringify({ project: "light" }));
        const appearance = readCoucouWorkbenchAppearance(true);
        expect(appearance["--coucou-accent"]).toBe("#2DD4BF");
        expect(appearance["--coucou-card"]).toBe("#ffffff");
    });
    it("follows the system mode with a validated default palette", () => {
        localStorage.setItem("hermes-desktop-theme-v2", "url(javascript:alert(1))");
        expect(readCoucouWorkbenchAppearance(true)["--coucou-card"]).toBe("#141416");
        expect(readCoucouWorkbenchAppearance(false)["--coucou-card"]).toBe("#ffffff");
    });
});
