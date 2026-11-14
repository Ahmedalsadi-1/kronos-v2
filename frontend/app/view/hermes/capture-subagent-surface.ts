// Copyright 2026, KronTerm. SPDX-License-Identifier: Apache-2.0

import type { AgentActivityEvent } from "../../../types/agent-activity";

import type {
    ComputerTarget,
    ComputerTargetAction,
    ComputerTargetSnapshot,
    ComputerTargetsResult,
} from "../../../types/computer-targets";
import type { LinuxDesktop, LinuxDesktopAction, LinuxDesktopActionResult } from "../../../types/linux-desktops";

type CaptureApi = {
    listLinuxDesktops: () => Promise<ComputerTargetsResult<LinuxDesktop[]>>;
    performLinuxDesktopAction: (action: LinuxDesktopAction) => Promise<ComputerTargetsResult<LinuxDesktopActionResult>>;
    listComputerTargets: () => Promise<ComputerTargetsResult<ComputerTarget[]>>;
    performComputerTargetAction: (
        action: ComputerTargetAction
    ) => Promise<ComputerTargetsResult<ComputerTargetSnapshot>>;
};

export async function captureSubagentSurface(
    activity: AgentActivityEvent,
    captureBlock: (blockId: string) => Promise<string>,
    api: CaptureApi
): Promise<string> {
    const { surfaceid: surfaceId, controlgeneration: generation } = activity;
    const isVm = surfaceId?.startsWith("vm:");
    const isDevice = surfaceId?.startsWith("device:");
    if (!isVm && !isDevice) {
        if (activity.blockid) return captureBlock(activity.blockid);
        throw new Error("No capturable surface is attached to this tool.");
    }
    const id = surfaceId.slice(surfaceId.indexOf(":") + 1);
    const assertCurrent = (target: {
        id: string;
        controlGeneration: number;
        controlOwner: string;
        automationPaused?: boolean;
    }) => {
        if (
            !target ||
            target.id !== id ||
            !Number.isSafeInteger(generation) ||
            target.controlGeneration !== generation ||
            (isVm && target.controlOwner !== "agent") ||
            target.automationPaused
        ) {
            throw new Error("Preview paused: control of this surface changed.");
        }
    };
    if (isVm) {
        const inventory = await api.listLinuxDesktops();
        if (inventory.success === false) throw new Error(inventory.error.message);
        const desktop = inventory.data.find((item) => item.id === id);
        assertCurrent(desktop);
        const result = await api.performLinuxDesktopAction({
            desktopId: id,
            action: "screenshot",
            expectedGeneration: generation,
            assignedAgentId: desktop.assignedAgentId,
        });
        if (result.success === false) throw new Error(result.error.message);
        assertCurrent(result.data.desktop);
        // A takeover can finish while the screenshot provider is still returning its old descriptor.
        const current = await api.listLinuxDesktops();
        if (current.success === false) throw new Error(current.error.message);
        assertCurrent(current.data.find((item) => item.id === id));
        if (!result.data.imageDataUrl) throw new Error("This VM did not return a screenshot.");
        return result.data.imageDataUrl;
    }
    const inventory = await api.listComputerTargets();
    if (inventory.success === false) throw new Error(inventory.error.message);
    assertCurrent(inventory.data.find((item) => item.id === id));
    const result = await api.performComputerTargetAction({
        targetId: id,
        action: "screenshot",
        expectedGeneration: generation,
    });
    if (result.success === false) throw new Error(result.error.message);
    assertCurrent(result.data.target);
    const current = await api.listComputerTargets();
    if (current.success === false) throw new Error(current.error.message);
    assertCurrent(current.data.find((item) => item.id === id));
    if (!result.data.imageDataUrl) throw new Error("This device did not return a screenshot.");
    return result.data.imageDataUrl;
}
