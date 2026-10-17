// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { ComputerSelection } from "./computer-selection-panel";

const api = vi.hoisted(() => ({ sendHermesSelection: vi.fn(async (_payload: unknown) => {}) }));
vi.mock("@/store/global", () => ({ getApi: () => api }));
beforeEach(() => vi.clearAllMocks());
it.each(["success", "failure"])(
    "queues emulator pixels through the owner IPC and preserves selection on %s",
    async (state) => {
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
        const context = vi
            .spyOn(HTMLCanvasElement.prototype, "getContext")
            .mockReturnValue({ drawImage: vi.fn() } as any);
        const dataUrl = vi
            .spyOn(HTMLCanvasElement.prototype, "toDataURL")
            .mockReturnValue("data:image/png;base64,Y2FwdHVyZQ==");
        if (state === "failure") api.sendHermesSelection.mockRejectedValueOnce(new Error("Hermes unavailable"));
        const container = document.createElement("div");
        const root = createRoot(container);
        try {
            await act(async () =>
                root.render(
                    <ComputerSelection
                        snapshot={
                            {
                                target: {
                                    id: "android:test",
                                    name: "Phone",
                                    kind: "android-emulator",
                                    runtime: "emulator",
                                    controlGeneration: 3,
                                },
                                capturedAt: 123,
                                imageDataUrl: "frozen-frame",
                            } as any
                        }
                        onClose={vi.fn()}
                    />
                )
            );
            const image = container.querySelector<HTMLImageElement>(".kt-device-selection-frame img");
            Object.defineProperties(image, { naturalWidth: { value: 200 }, naturalHeight: { value: 400 } });
            await act(async () => image.dispatchEvent(new Event("load", { bubbles: true })));
            const select = container.querySelector("select");
            await act(async () => {
                select.value = "full";
                select.dispatchEvent(new Event("change", { bubbles: true }));
            });
            const send = [...container.querySelectorAll("button")].find(
                (button) => button.textContent === "Send to Hermes"
            );
            expect(send.disabled).toBe(false);
            await act(async () => send.click());
            expect(api.sendHermesSelection).toHaveBeenCalledTimes(1);
            const payload = api.sendHermesSelection.mock.calls[0][0] as any;
            expect(payload.target).toBe("current");
            expect(payload.images).toEqual([
                { filename: "mobile-selection.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" },
            ]);
            expect(payload.text).toContain('"deviceId": "android:test"');
            expect(payload.text).not.toContain("base64");
            expect(container.querySelector('[role="status"]').textContent).toContain(
                state === "success" ? "queued" : "Hermes unavailable"
            );
            expect(container.querySelector(".kt-device-selection-preview")).not.toBeNull();
        } finally {
            await act(async () => root.unmount());
            context.mockRestore();
            dataUrl.mockRestore();
        }
    }
);
