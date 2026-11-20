import { expect, it, vi } from "vitest";
import { filterSettingsNavigation, settingsCategory } from "./settings-navigation";
const groups = [
    { id: "computers", label: "Virtual machines", active: false, icon: () => null, onSelect: vi.fn() },
    {
        id: "providers",
        label: "Providers",
        active: false,
        icon: () => null,
        onSelect: vi.fn(),
        children: [{ id: "pview:keys", label: "API keys", active: false, icon: () => null, onSelect: vi.fn() }],
    },
];
it("places KronOS user settings in Account", () => {
    expect(settingsCategory("kronterm:user")).toBe("Account");
});
it("finds virtual machines using familiar provider and VM terms", () => {
    expect(filterSettingsNavigation(groups, "vm").map((group) => group.id)).toEqual(["computers"]);
    expect(filterSettingsNavigation(groups, "docker").map((group) => group.id)).toEqual(["computers"]);
});
it("keeps matching nested destinations discoverable", () => {
    expect(filterSettingsNavigation(groups, "API")[0].children[0].id).toBe("pview:keys");
    expect(filterSettingsNavigation(groups, "nonsense")).toEqual([]);
});
