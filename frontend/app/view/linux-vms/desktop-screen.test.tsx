// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DesktopScreen } from "./desktop-screen";

const Api = vi.hoisted(() => ({ listLinuxDesktops: vi.fn(), performLinuxDesktopAction: vi.fn() }));
vi.mock("@/store/global", () => ({ getApi: () => Api }));
vi.mock("@/app/view/agent-surface-cursor", () => ({ AgentSurfaceCursor: () => null }));
vi.mock("@/app/components/system-ui", () => ({
    SystemButton: ({ children, size, ...props }) => <button {...props}>{children}</button>,
}));
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
    if (root) await act(async () => root.unmount());
    vi.clearAllMocks();
    vi.useRealTimers();
});
it("shows the actual running desktop without launching or provisioning another VM", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Api.listLinuxDesktops.mockResolvedValue({
        success: true,
        data: [{ id: "linux-vm:ubuntu", ready: true, status: "running", controlGeneration: 3 }],
    });
    Api.performLinuxDesktopAction.mockResolvedValue({
        success: true,
        data: { imageDataUrl: "data:image/png;base64,c2NyZWVu" },
    });
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<DesktopScreen />));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,c2NyZWVu");
    expect(Api.performLinuxDesktopAction).toHaveBeenCalledWith({
        desktopId: "linux-vm:ubuntu",
        action: "screenshot",
    });
    expect(Api.performLinuxDesktopAction).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[role=status]")).toBeNull();
});
it("does not capture or inspect VMs while the page is hidden", async () => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<DesktopScreen />));
    expect(Api.listLinuxDesktops).not.toHaveBeenCalled();
    expect(Api.performLinuxDesktopAction).not.toHaveBeenCalled();
});
it("reduces idle captures after two unchanged frames", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    Api.listLinuxDesktops.mockResolvedValue({
        success: true,
        data: [{ id: "linux-vm:ubuntu", ready: true, status: "running", controlGeneration: 3 }],
    });
    Api.performLinuxDesktopAction.mockResolvedValue({
        success: true,
        data: { imageDataUrl: "data:image/png;base64,c2NyZWVu" },
    });
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(<DesktopScreen />));
    await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
    });
    expect(Api.performLinuxDesktopAction).toHaveBeenCalledTimes(3);
    await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
    });
    expect(Api.performLinuxDesktopAction).toHaveBeenCalledTimes(4);
});

it("batches rapid typing and forwards wheel input", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    const desktop = { id: "linux-vm:ubuntu", ready: true, status: "running", controlGeneration: 3 };
    Api.listLinuxDesktops.mockResolvedValue({ success: true, data: [desktop] });
    Api.performLinuxDesktopAction.mockResolvedValue({
        success: true,
        data: { desktop, imageDataUrl: "data:image/png;base64,c2NyZWVu" },
    });
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<DesktopScreen />));
    const image = container.querySelector("img");
    await act(async () => {
        for (const key of "hello") image.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        await vi.advanceTimersByTimeAsync(40);
    });
    expect(Api.performLinuxDesktopAction.mock.calls.filter(([input]) => input.action === "type")).toEqual([
        [{ desktopId: desktop.id, expectedGeneration: 3, action: "type", text: "hello" }],
    ]);
    await act(async () => {
        image.dispatchEvent(new WheelEvent("wheel", { deltaY: 80, bubbles: true }));
        image.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true }));
        await vi.advanceTimersByTimeAsync(40);
    });
    expect(Api.performLinuxDesktopAction).toHaveBeenCalledWith({
        desktopId: desktop.id,
        expectedGeneration: 3,
        action: "scroll",
        deltaX: 0,
        deltaY: 200,
    });
});
