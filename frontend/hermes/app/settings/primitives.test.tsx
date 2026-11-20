// @vitest-environment jsdom
import { Settings } from "lucide-react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SettingsContent, SettingsSection, ToggleRow } from "./primitives";

vi.mock("@hermes/lib/haptics", () => ({ triggerHaptic: vi.fn() }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("keeps grouped settings switches labelled and connected to their existing change handler", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const change = vi.fn();
    try {
        await act(async () =>
            root.render(
                <SettingsContent>
                    <SettingsSection icon={Settings} title="Browsing">
                        <ToggleRow label="Restore tabs" checked={false} onChange={change} />
                    </SettingsSection>
                </SettingsContent>
            )
        );
        const control = host.querySelector<HTMLButtonElement>('[role="switch"]');
        expect(control.getAttribute("aria-label")).toBe("Restore tabs");
        expect(control.closest("[data-settings-group]")).not.toBeNull();
        await act(async () => control.click());
        expect(change).toHaveBeenCalledExactlyOnceWith(true);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("moves focus to an outlined section and removes stale section links", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const scroll = vi.fn();
    const previousScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    const render = (extra: boolean) => (
        <SettingsContent>
            <SettingsSection icon={Settings} title="Browsing">
                Browser preferences
            </SettingsSection>
            {extra && (
                <SettingsSection icon={Settings} title="Privacy">
                    Permission preferences
                </SettingsSection>
            )}
        </SettingsContent>
    );
    try {
        await act(async () => root.render(render(true)));
        const buttons = host.querySelectorAll<HTMLButtonElement>('nav[aria-label="On this page"] button');
        expect(buttons).toHaveLength(2);
        await act(async () => buttons[1].click());
        expect(scroll).toHaveBeenCalledWith({ block: "start" });
        expect(document.activeElement?.getAttribute("aria-label")).toBe("Privacy");
        await act(async () => root.render(render(false)));
        expect(host.querySelector('nav[aria-label="On this page"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        HTMLElement.prototype.scrollIntoView = previousScroll;
        host.remove();
    }
});
