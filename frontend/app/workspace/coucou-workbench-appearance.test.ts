// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { readCoucouWorkbenchAppearance } from "./coucou-workbench-appearance";

afterEach(() => localStorage.clear());

describe("Coucou workbench appearance", () => {
    it("keeps the file workbench on OS appearance when a chat profile has its own mode", () => {
        localStorage.setItem("hermes-desktop-active-profile-v1", "project");
        localStorage.setItem("hermes-desktop-profile-themes-v1", JSON.stringify({ project: "coucou-teal" }));
        localStorage.setItem("hermes-desktop-profile-modes-v1", JSON.stringify({ project: "light" }));
        const appearance = readCoucouWorkbenchAppearance(true);
        expect(appearance["--coucou-accent"]).toBe("var(--kt-focus-ring, #8ab4ff)");
        expect(appearance["--coucou-card"]).toBe("#27272a");
    });
    it("follows the system mode with a validated default palette", () => {
        localStorage.setItem("hermes-desktop-theme-v2", "url(javascript:alert(1))");
        expect(readCoucouWorkbenchAppearance(true)["--coucou-card"]).toBe("#27272a");
        expect(readCoucouWorkbenchAppearance(false)["--coucou-card"]).toBe("#fafafc");
    });
    it("uses full-strength labels and separators with increased contrast", () => {
        const appearance = readCoucouWorkbenchAppearance(false, true);
        expect(appearance["--coucou-secondary"]).toBe(appearance["--coucou-label"]);
        expect(appearance["--coucou-border"]).toBe(appearance["--coucou-label"]);
    });
});
