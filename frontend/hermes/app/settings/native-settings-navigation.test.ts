import { describe, expect, it, vi } from "vitest";
import { makeNativeSettingsNavigation } from "./native-settings-navigation";
import { settingsCategory } from "./settings-navigation";

const Sections = [
    { id: "user", label: "User" },
    { id: "browser", label: "Browser" },
    { id: "browser-sessions", label: "Profiles" },
    { id: "browser-setup", label: "Import" },
    { id: "widgets", label: "Widgets" },
    { id: "canvas", label: "Canvas" },
    { id: "theme", label: "Themes" },
];

describe("native settings destinations", () => {
    it("exposes supported desktop sections directly and selects the registered native route", () => {
        const select = vi.fn();
        const entries = makeNativeSettingsNavigation(Sections, "kronterm:canvas", select);
        expect(entries).toHaveLength(Sections.length);
        expect(entries.find((entry) => entry.active)?.label).toBe("KronCanvas");
        entries.find((entry) => entry.id === "kronterm:browser-sessions").onSelect();
        expect(select).toHaveBeenCalledWith("kronterm:browser-sessions");
        expect(entries.every((entry) => !entry.children)).toBe(true);
    });
    it("does not advertise native controls without a host or resurrect retired settings", () => {
        expect(makeNativeSettingsNavigation(undefined, "config:model", vi.fn())).toEqual([]);
        expect(
            makeNativeSettingsNavigation([{ id: "agents", label: "Legacy agents" }], "config:model", vi.fn())
        ).toEqual([]);
    });
    it("groups browser and workspace sections with their related controls", () => {
        expect(settingsCategory("kronterm:browser-setup")).toBe("Browser");
        expect(settingsCategory("kronterm:widgets")).toBe("Workspace");
        expect(settingsCategory("kronterm:canvas")).toBe("Workspace");
        expect(settingsCategory("integrations")).toBe("Integrations");
    });
});
