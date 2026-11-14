import { expect, it, vi } from "vitest";
import type { AgentActivityEvent } from "../../../types/agent-activity";
import { captureSubagentSurface } from "./capture-subagent-surface";

const activity: AgentActivityEvent = {
    source: "hermes",
    surface: "sandbox",
    surfaceid: "vm:one",
    controlgeneration: 4,
    phase: "running",
    action: "inspect",
};
const desktop = { id: "one", controlOwner: "agent", controlGeneration: 4, assignedAgentId: "lease-owner" };
const ok = (data: unknown) => ({ success: true, data });
const mocks = () => ({
    listLinuxDesktops: vi.fn().mockResolvedValue(ok([desktop])),
    performLinuxDesktopAction: vi.fn().mockResolvedValue(ok({ desktop, imageDataUrl: "data:image/png;base64,vm" })),
    listComputerTargets: vi.fn().mockResolvedValue(ok([{ ...desktop, controlOwner: "user", automationPaused: false }])),
    performComputerTargetAction: vi
        .fn()
        .mockResolvedValue(
            ok({ target: { ...desktop, controlOwner: "user" }, imageDataUrl: "data:image/png;base64,device" })
        ),
});

it("captures only the VM identified by the child activity", async () => {
    const api = mocks();
    const widget = vi.fn();
    expect(await captureSubagentSurface(activity, widget, api)).toContain(",vm");
    expect(api.performLinuxDesktopAction).toHaveBeenCalledExactlyOnceWith({
        desktopId: "one",
        action: "screenshot",
        expectedGeneration: 4,
        assignedAgentId: "lease-owner",
    });
    expect(widget).not.toHaveBeenCalled();
});

it("rejects changed ownership before capture and never falls back to a widget", async () => {
    const api = mocks();
    api.listLinuxDesktops.mockResolvedValue(ok([{ ...desktop, controlGeneration: 5 }]));
    const widget = vi.fn();
    await expect(captureSubagentSurface({ ...activity, blockid: "fallback" }, widget, api)).rejects.toThrow("control");
    expect(api.performLinuxDesktopAction).not.toHaveBeenCalled();
    expect(widget).not.toHaveBeenCalled();
});

it("discards a screenshot if the user takes over during capture", async () => {
    const api = mocks();
    api.listLinuxDesktops
        .mockResolvedValueOnce(ok([desktop]))
        .mockResolvedValue(ok([{ ...desktop, controlOwner: "user", controlGeneration: 5 }]));
    await expect(captureSubagentSurface(activity, vi.fn(), api)).rejects.toThrow("control");
});

it("captures an active device and refuses paused automation", async () => {
    const api = mocks();
    const device = { ...activity, surfaceid: "device:one" };
    expect(await captureSubagentSurface(device, vi.fn(), api)).toContain(",device");
    api.listComputerTargets.mockResolvedValue(ok([{ ...desktop, automationPaused: true }]));
    await expect(captureSubagentSurface(device, vi.fn(), api)).rejects.toThrow("control");
    expect(api.performComputerTargetAction).toHaveBeenCalledTimes(1);
});
