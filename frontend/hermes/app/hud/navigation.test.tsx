// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { HudNavigation } from "./navigation";

vi.mock("@hermes/store/session", () => ({ $selectedStoredSessionId: { get: () => "session-1" } }));
vi.mock("@hermes/components/chat-layout-button", () => ({ ChatLayoutButton: () => null }));
let root: ReturnType<typeof createRoot>;
afterEach(() => {
    if (root) act(() => root.unmount());
    document.body.innerHTML = "";
});

it("does not put a redundant floating Chat button above the active HUD chat", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
        root.render(
            <MemoryRouter initialEntries={["/session-1"]}>
                <HudNavigation />
            </MemoryRouter>
        )
    );
    expect(host.querySelector('[aria-label="HUD sections"]')).toBeNull();
});

it("retains the way back to chat when a HUD settings page is open", () => {
    const host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
        root.render(
            <MemoryRouter initialEntries={["/settings"]}>
                <HudNavigation />
            </MemoryRouter>
        )
    );
    expect(host.querySelector('[aria-label="Return to HUD chat"]')).not.toBeNull();
});
