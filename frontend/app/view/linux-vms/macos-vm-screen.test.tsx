// @vitest-environment jsdom
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pressMacVmKeys, typeMacVmText } from "./macos-vm-input";
import { MacVmScreen } from "./macos-vm-screen";

const mocks = vi.hoisted(() => ({ list: vi.fn(), start: vi.fn(), stop: vi.fn(), clients: [] as any[] }));
vi.mock("@/store/global", () => ({
    getApi: () => ({ listMacVms: mocks.list, startMacVm: mocks.start, stopMacVm: mocks.stop }),
}));
vi.mock("@/app/view/agent-surface-cursor", () => ({ AgentSurfaceCursor: () => null }));
vi.mock("@novnc/novnc", () => ({
    default: class extends EventTarget {
        scaleViewport = true;
        resizeSession = false;
        sendKey = vi.fn();
        disconnect = vi.fn();
        constructor() {
            super();
            mocks.clients.push(this);
        }
    },
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.clients.length = 0;
    mocks.stop.mockResolvedValue({ success: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});
function button(label: string): HTMLButtonElement {
    return [...host.querySelectorAll("button")].find((button) => button.textContent === label);
}

it("shows prerequisites and disables boot when the runtime is unavailable", async () => {
    mocks.list.mockResolvedValue({ success: true, data: { available: false, problem: "Install Tart", machines: [] } });
    await act(async () => root.render(<MacVmScreen blockId="guest-1" />));
    expect(host.textContent).toContain("Install Tart");
    expect(button("Start VM").disabled).toBe(true);
    await act(async () => button("Refresh").click());
    expect(mocks.list).toHaveBeenCalledTimes(2);
    expect(mocks.start).not.toHaveBeenCalled();
});

it("connects the guest, routes text and shortcuts to VNC, changes scale, and stops", async () => {
    mocks.list.mockResolvedValue({
        success: true,
        data: { available: true, machines: [{ name: "mac", running: false }] },
    });
    mocks.start.mockResolvedValue({
        success: true,
        data: { name: "mac", sessionId: "session", url: "ws://127.0.0.1/display", password: "secret" },
    });
    await act(async () => root.render(<MacVmScreen blockId="guest-2" />));
    await act(async () => button("Start VM").click());
    expect(mocks.start).toHaveBeenCalledWith("mac");
    const client = mocks.clients[0];
    await act(async () => client.dispatchEvent(new Event("connect")));
    await typeMacVmText("guest-2", "A");
    pressMacVmKeys("guest-2", ["Meta", "Space"]);
    expect(client.sendKey.mock.calls).toEqual([
        [65, "", true],
        [65, "", false],
        [0xffeb, "", true],
        [32, "", true],
        [32, "", false],
        [0xffeb, "", false],
    ]);
    await act(async () => button("Actual size").click());
    expect(client.scaleViewport).toBe(false);
    await act(async () => button("Stop VM").click());
    expect(mocks.stop).toHaveBeenCalledWith("session");
    expect(client.disconnect).toHaveBeenCalled();
    await expect(typeMacVmText("guest-2", "A")).rejects.toThrow("not connected");
});
