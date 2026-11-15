// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PenCanvasSettings, readPenCanvasSettings } from "./pen-canvas-settings";

vi.mock("@hermes/components/ui/button", () => ({
    Button: ({ children, variant: _variant, size: _size, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock("@hermes/components/ui/input", () => ({ Input: (props) => <input {...props} /> }));
vi.mock("@hermes/lib/icons", () => ({ Settings2: () => <span /> }));
vi.mock("./primitives", () => ({
    SettingsContent: ({ children }) => <section>{children}</section>,
    SettingsSection: ({ children, title }) => <section aria-label={title}>{children}</section>,
    ListRow: ({ title, action }) => (
        <div>
            {title}
            {action}
        </div>
    ),
    ToggleRow: ({ label, checked, disabled, onChange }) => (
        <button
            role="switch"
            aria-label={label}
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
        />
    ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const snapshot = (snap = true) => ({
    scope: "desktop-profile",
    fields: [
        { key: "snapToObjects", label: "Snap to objects", group: "Canvas", kind: "boolean" },
        {
            key: "presentationZoom",
            label: "Presentation zoom",
            group: "Playback",
            kind: "enum",
            options: [
                { value: 0, label: "Fit" },
                { value: 1, label: "Actual size" },
            ],
        },
    ],
    values: { snapToObjects: snap, presentationZoom: 0 },
});

it("reads native values and commits changes through the real settings method contract", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const request = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(snapshot(false));
    try {
        await act(async () => root.render(<PenCanvasSettings request={request} />));
        expect(request).toHaveBeenNthCalledWith(1, "get_settings");
        const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
        expect(toggle.getAttribute("aria-checked")).toBe("true");
        await act(async () => toggle.click());
        expect(request).toHaveBeenNthCalledWith(2, "set_settings", { patch: { snapToObjects: false } });
        expect(toggle.getAttribute("aria-checked")).toBe("false");
        request.mockRejectedValueOnce(new Error("Native storage unavailable"));
        await act(async () => toggle.click());
        expect(toggle.getAttribute("aria-checked")).toBe("false");
        expect(host.querySelector('[role="alert"]').textContent).toContain("Native storage unavailable");
        expect(toggle.disabled).toBe(false);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("preserves numeric enum values instead of writing their string labels", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const next = snapshot();
    next.values.presentationZoom = 1;
    const request = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(next);
    try {
        await act(async () => root.render(<PenCanvasSettings request={request} />));
        const select = host.querySelector("select");
        await act(async () => {
            select.value = "1";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(request).toHaveBeenLastCalledWith("set_settings", { patch: { presentationZoom: 1 } });
        expect(select.value).toBe("1");
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

it("rejects unsupported or malformed settings responses", () => {
    expect(() => readPenCanvasSettings({ scope: "account", fields: [], values: {} })).toThrow("invalid settings");
    const invalid = snapshot();
    invalid.values.snapToObjects = "true" as never;
    expect(() => readPenCanvasSettings(invalid)).toThrow("invalid value");
});
