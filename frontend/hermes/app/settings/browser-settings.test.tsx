// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BrowserSettings } from "./browser-settings";
vi.mock("@hermes/components/ui/button", () => ({
    Button: ({ children, variant: _variant, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock("@hermes/components/ui/input", () => ({ Input: (props) => <input {...props} /> }));
vi.mock("./primitives", () => ({
    SettingsContent: ({ children }) => <div>{children}</div>,
    SettingsSection: ({ children }) => <section>{children}</section>,
    ListRow: ({ action }) => <div>{action}</div>,
    ToggleRow: ({ label, checked, onChange }) => <button aria-label={label} onClick={() => onChange(!checked)} />,
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
it("saves through the host and keeps a failed edit available to retry", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce(undefined);
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
        await act(async () =>
            root.render(
                <BrowserSettings
                    initial={{
                        "web:defaulturl": "about:blank",
                        "web:defaultsearch": "https://example.com/?q={query}",
                        "web:openlinksinternally": true,
                    }}
                    save={save}
                />
            )
        );
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Open links inside KronOS"]').click());
        const button = () =>
            [...host.querySelectorAll("button")].find((button) => button.textContent === "Save changes");
        await act(async () => button().click());
        expect(host.querySelector('[role="alert"]').textContent).toBe("Connection lost");
        expect(button().disabled).toBe(false);
        await act(async () => button().click());
        expect(save).toHaveBeenLastCalledWith({
            "web:defaulturl": "about:blank",
            "web:defaultsearch": "https://example.com/?q={query}",
            "web:openlinksinternally": false,
        });
        expect(host.querySelector('[role="status"]').textContent).toContain("saved");
        expect(button().disabled).toBe(true);
    } finally {
        await act(async () => root.unmount());
    }
});
