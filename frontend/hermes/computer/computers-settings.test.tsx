// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ComputersSettings } from "./computers-settings";
vi.mock("@hermes/components/ui/button", () => ({
    Button: ({ children, variant: _variant, size: _size, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock("@hermes/components/ui/input", () => ({ Input: (props) => <input {...props} /> }));
vi.mock("@hermes/app/settings/primitives", () => ({
    SettingsContent: ({ children }) => <div>{children}</div>,
    SettingsSection: ({ children }) => <section>{children}</section>,
    ListRow: ({ action }) => <div>{action}</div>,
    ToggleRow: () => null,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());
it("selects an enabled provider when the default provider is disabled and prevents blank creation", async () => {
    const manager = {
        list: vi.fn().mockResolvedValue({
            plugins: [
                { id: "cua-qemu", name: "VM", enabled: false },
                { id: "openmaus-container", name: "Container", enabled: true },
            ],
            computers: [],
        }),
        desktops: vi.fn().mockResolvedValue([]),
    };
    vi.stubGlobal("hermesDesktop", { krontermSurfaces: { computerManager: manager } });
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
        await act(async () => root.render(<ComputersSettings />));
        expect(host.querySelector<HTMLSelectElement>("select").value).toBe("openmaus-container");
        expect(host.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    } finally {
        await act(async () => root.unmount());
    }
});
it("passes the current control generation with lifecycle actions and renders bridge failures", async () => {
    const manager = {
        list: vi
            .fn()
            .mockResolvedValue({ plugins: [], computers: [{ id: "vm", name: "Test VM", provider: "cua-qemu" }] }),
        desktops: vi
            .fn()
            .mockResolvedValue([{ id: "vm", status: "stopped", imagePrepared: true, controlGeneration: 12 }]),
        action: vi.fn().mockRejectedValue(new Error("Ownership changed")),
    };
    vi.stubGlobal("hermesDesktop", { krontermSurfaces: { computerManager: manager } });
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
        await act(async () => root.render(<ComputersSettings />));
        await act(async () =>
            [...host.querySelectorAll("button")].find((button) => button.textContent === "Start computer").click()
        );
        expect(manager.action).toHaveBeenCalledWith({ desktopId: "vm", action: "start", expectedGeneration: 12 });
        expect(host.querySelector('[role="alert"]').textContent).toContain("Ownership changed");
    } finally {
        await act(async () => root.unmount());
    }
});
