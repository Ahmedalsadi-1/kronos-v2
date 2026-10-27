// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { OverlayView } from "./overlay-view";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mode = vi.hoisted(() => ({ hudMode: false, embedded: false, widget: true }));
vi.mock("@hermes/lib/kronterm-host", () => ({
    isKronTermWidgetHost: () => mode.widget,
    useHermesShellMode: () => mode,
}));
vi.mock("@hermes/app/shell/titlebar", () => ({ TITLEBAR_HEIGHT: 32 }));
vi.mock("@hermes/app/shell/titlebar-icon", () => ({ TitlebarIcon: () => <span /> }));
vi.mock("@hermes/components/ui/button", () => ({
    Button: ({ children, size: _size, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock("@hermes/i18n", () => ({ translateNow: () => "Close" }));
vi.mock("@hermes/lib/haptics", () => ({ triggerHaptic: vi.fn() }));

let cleanup: () => void;
afterEach(() => cleanup?.());

it.each([
    ["widget", false, false],
    ["HUD", true, true],
    ["panel", false, true],
])("renders %s sections outside the chat container and closes with Escape", async (_name, hudMode, embedded) => {
    Object.assign(mode, { hudMode, embedded });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const close = vi.fn();
    cleanup = () => {
        act(() => root.unmount());
        host.remove();
    };
    await act(async () =>
        root.render(
            <OverlayView onClose={close}>
                <p>Settings content</p>
            </OverlayView>
        )
    );
    const overlay = document.querySelector("[data-overlay-surface]");
    expect(overlay?.parentElement).toBe(document.body);
    expect(host.querySelector("[data-overlay-surface]")).toBeNull();
    expect(overlay?.textContent).toContain("Settings content");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(close).toHaveBeenCalledOnce();
});
