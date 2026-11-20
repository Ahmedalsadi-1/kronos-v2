// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { KronSettingsBrowserSessionsContent } from "./kronsettings-browser-sessions";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/app/store/global", () => ({ getApi: () => ({ browserSessions: request }) }));
vi.mock("@hermes/components/ui/button", () => ({
    Button: ({ variant: _variant, size: _size, children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock("@hermes/app/settings/primitives", () => ({
    SettingsContent: ({ children }) => <div>{children}</div>,
    SettingsSection: ({ title, children }) => <section aria-label={title}>{children}</section>,
    ListRow: ({ title, description, hint, action }) => (
        <div>
            {title}
            {description}
            {hint}
            {action}
        </div>
    ),
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("requires confirmation, supports cancellation, and retains failed clears for retry", async () => {
    const rows = [
        { id: "work", name: "Work", persistent: true, shared: false, openTabs: 2, cookies: 4, cacheBytes: 2048 },
    ];
    request.mockResolvedValueOnce(rows).mockRejectedValueOnce(new Error("Storage is busy")).mockResolvedValueOnce(rows);
    const host = document.createElement("div");
    const root = createRoot(host);
    const button = (label: string) => [...host.querySelectorAll("button")].find((entry) => entry.textContent === label);
    try {
        await act(async () => root.render(<KronSettingsBrowserSessionsContent />));
        await act(async () => button("Clear cookies").click());
        expect(request).toHaveBeenCalledTimes(1);
        await act(async () => button("Cancel").click());
        expect(host.querySelector('[aria-label="Confirm clearing Work"]')).toBeNull();
        await act(async () => button("Clear site data").click());
        expect(host.textContent).toContain("sign you out");
        await act(async () => button("Confirm clear").click());
        expect(host.querySelector('[role="alert"]').textContent).toBe("Storage is busy");
        expect(button("Confirm clear").disabled).toBe(false);
        await act(async () => button("Confirm clear").click());
        expect(request).toHaveBeenLastCalledWith({ action: "clear", id: "work", data: "site-data" });
        expect(host.querySelector('[aria-label="Confirm clearing Work"]')).toBeNull();
        expect(host.querySelector('[role="status"]').textContent).toContain("cleared");
    } finally {
        await act(async () => root.unmount());
    }
});
