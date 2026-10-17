// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DesktopGrabControl } from "./kronterm-hud-controls";

const api = vi.hoisted(() => ({
    desktopGrab: vi.fn(),
    cancelDesktopGrab: vi.fn(async () => {}),
    sendHermesSelection: vi.fn(async (_payload: unknown) => {}),
}));
vi.mock("@/store/global", () => ({ getApi: () => api }));
vi.mock("./kronterm-hud-islands", () => ({ launchKronTermHudIsland: vi.fn() }));
it("desktop picker sends pixels only when opted in and respects context depth and destination", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    api.desktopGrab.mockResolvedValue({
        status: "selected",
        payload: {
            application: "Finder",
            bundleId: "com.apple.finder",
            name: "Open",
            window: "Downloads",
            value: "control value",
            bounds: { x: 1, y: 2, width: 30, height: 20 },
            screenshot: "data:image/png;base64,Y2FwdHVyZQ==",
        },
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
        await act(async () => root.render(<DesktopGrabControl />));
        await act(async () =>
            container.querySelector<HTMLButtonElement>('[aria-label="Select desktop element"]').click()
        );
        const textarea = container.querySelector("textarea");
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(textarea, "Inspect it");
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]').click());
        const selects = container.querySelectorAll("select");
        await act(async () => {
            selects[1].value = "new";
            selects[1].dispatchEvent(new Event("change", { bubbles: true }));
        });
        await act(async () =>
            [...container.querySelectorAll("button")].find((button) => button.textContent === "Send to Hermes").click()
        );
        expect(api.sendHermesSelection).toHaveBeenCalledTimes(1);
        const payload = api.sendHermesSelection.mock.calls[0][0] as any;
        expect(payload.target).toBe("new");
        expect(payload.images).toEqual([
            { filename: "desktop-selection.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" },
        ]);
        expect(payload.text).not.toContain("base64");
        expect(payload.text).not.toContain("control value");
    } finally {
        await act(async () => root.unmount());
    }
});
