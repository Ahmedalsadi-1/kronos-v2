import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { LinuxDesktop } from "./linux-desktop";

const guest = vi.hoisted(() => ({
    bus: { send: vi.fn() },
    keyboard_send_text: vi.fn(),
    keyboard_send_scancodes: vi.fn(),
    run: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
}));
vi.mock("v86", () => ({
    V86: class {
        constructor(options: { screen: { container: HTMLElement } }) {
            const canvas = options.screen.container.querySelector("canvas")!;
            canvas.style.display = "block";
            canvas.width = 640;
            Object.defineProperty(canvas, "getBoundingClientRect", {
                value: () => ({ left: 0, top: 0, width: 640, height: 480 }),
            });
        }
        bus = guest.bus;
        keyboard_send_text = guest.keyboard_send_text;
        keyboard_send_scancodes = guest.keyboard_send_scancodes;
        run = guest.run;
        stop = guest.stop;
        destroy = guest.destroy;
        add_listener(_name: string, callback: () => void) {
            callback();
        }
    },
}));
vi.mock("../lib/phone-widget-surfaces", () => ({
    phoneWidgetSurfaces: { publish: vi.fn(), markUsed: vi.fn(), remove: vi.fn() },
}));
it("routes direct keyboard input to the guest and makes double tap a right click", async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }))
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AA");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(async () => root.render(<LinuxDesktop active controlEnabled />));
        await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
        expect(container.textContent).not.toContain("Type into the guest");
        const bridge = container.querySelector<HTMLTextAreaElement>("textarea")!;
        await act(async () =>
            container
                .querySelector('[aria-label="Live Linux desktop display"]')!
                .dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 320, clientY: 240 }))
        );
        expect(document.activeElement).toBe(bridge);
        guest.bus.send.mockClear();
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(bridge, " hello");
            bridge.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(guest.keyboard_send_text).toHaveBeenCalledWith("hello");
        const trackpad = container.querySelector<HTMLElement>('[aria-label="Desktop touch trackpad"]')!;
        await act(async () => {
            trackpad.click();
            vi.advanceTimersByTime(150);
            trackpad.click();
            vi.advanceTimersByTime(400);
        });
        expect(guest.bus.send).toHaveBeenCalledWith("mouse-click", [false, false, true]);
        expect(guest.bus.send).not.toHaveBeenCalledWith("mouse-click", [true, false, false]);
        await act(async () => root.render(<LinuxDesktop active controlEnabled={false} />));
        expect(container.querySelector("textarea")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        container.remove();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    }
});
