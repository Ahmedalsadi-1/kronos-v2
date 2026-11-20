// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { expect, it, vi } from "vitest";
import { DesktopSettingsSection, DesktopSettingsSections } from "./desktop-settings-sections";

vi.mock("@/app/components/ui/kronos-account-settings", () => ({ KronOSAccountSettings: () => null }));
vi.mock("@/app/view/kronsettings/kronsettings-browser", () => ({
    KronSettingsBrowserContent: ({ onOpenSessions }: any) => <button onClick={onOpenSessions}>Manage profiles</button>,
}));
vi.mock("@/app/view/kronsettings/kronsettings-browser-sessions", () => ({
    KronSettingsBrowserSessionsContent: () => null,
}));
vi.mock("@/app/view/kronsettings/kronsettings-browser-setup", () => ({ KronSettingsBrowserSetup: () => null }));
vi.mock("@/app/view/kronsettings/kronsettings-theme", () => ({ KronSettingsThemeContent: () => null }));
vi.mock("@/app/view/kronsettings/kronsettings-workspace", () => ({ KronSettingsWorkspaceContent: () => null }));
vi.mock("@hermes/app/settings/pen-canvas-settings", () => ({ PenCanvasSettings: () => null }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function Location() {
    return <output>{useLocation().search}</output>;
}

it("registers browser, widget, canvas, and theme sections for both native hosts", () => {
    expect(DesktopSettingsSections.map((section) => section.id)).toEqual(
        expect.arrayContaining(["user", "browser", "browser-sessions", "browser-setup", "widgets", "canvas", "theme"])
    );
});

it("opens browser profiles within the current settings router without dropping other parameters", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () =>
            root.render(
                <MemoryRouter initialEntries={["/settings?tab=kronterm:browser&scope=work"]}>
                    <DesktopSettingsSection sectionId="browser" canvasRequest={vi.fn()} />
                    <Location />
                </MemoryRouter>
            )
        );
        await act(async () => host.querySelector<HTMLButtonElement>("button").click());
        const params = new URLSearchParams(host.querySelector("output").textContent);
        expect(params.get("tab")).toBe("kronterm:browser-sessions");
        expect(params.get("scope")).toBe("work");
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
