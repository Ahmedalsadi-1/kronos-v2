// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ManagedComputerWidget } from "./managed-computer-widget";

const api = vi.hoisted(() => ({ listLinuxDesktops: vi.fn(), performLinuxDesktopAction: vi.fn() }));
const viewer = vi.hoisted(() => vi.fn((_props: any) => <div data-viewer="" />));
vi.mock("@/store/global", () => ({ getApi: () => api }));
vi.mock("./managed-vnc-screen", () => ({ ManagedVncScreen: viewer }));
let root: ReturnType<typeof createRoot>;
afterEach(async () => {
    if (root) await act(async () => root.unmount());
    vi.clearAllMocks();
});

it("automatically supplies the managed VM endpoint without requiring a manual computer", async () => {
    const desktop = {
        id: "linux-vm:ubuntu",
        name: "Ubuntu",
        status: "running",
        ready: true,
        viewerUrl: "ws://127.0.0.1:12345/token",
    };
    api.listLinuxDesktops.mockResolvedValue({ success: true, data: [desktop] });
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<ManagedComputerWidget />));
    expect(viewer.mock.calls.at(-1)[0].desktop).toEqual(desktop);
    expect(api.performLinuxDesktopAction).not.toHaveBeenCalled();
    expect(viewer.mock.calls.at(-1)[0].onLifecycle).toBeTypeOf("function");
});

it("starts the existing stopped VM with its current control generation", async () => {
    const desktop = { id: "linux-vm:ubuntu", status: "stopped", imagePrepared: true, controlGeneration: 7 };
    api.listLinuxDesktops.mockResolvedValue({ success: true, data: [desktop] });
    api.performLinuxDesktopAction.mockResolvedValue({
        success: true,
        data: { desktop: { ...desktop, status: "running" } },
    });
    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root.render(<ManagedComputerWidget />));
    await act(async () => viewer.mock.calls.at(-1)[0].onLifecycle());
    expect(api.performLinuxDesktopAction).toHaveBeenCalledWith({
        desktopId: desktop.id,
        action: "start",
        expectedGeneration: 7,
    });
});
