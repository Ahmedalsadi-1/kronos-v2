// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ComputersPanel } from "@/app/view/computers/computers";
import { ComputersController, type ComputersState } from "@/app/view/computers/computers-state";
import { DeviceWorkspace } from "@/app/view/computers/device-workspace";
import { getApi } from "@/store/global";
import { useEffect, useState } from "react";
import { DesktopScreen } from "./desktop-screen";
import "./linux-vms.css";
import { MacVmScreen } from "./macos-vm-screen";

export type MachineSection = "desktop" | "macos" | "android" | "iphone";

export function LinuxVmsPanel({
    initialSection = "desktop",
    settings = false,
    targetId,
    blockId,
}: {
    initialSection?: MachineSection;
    settings?: boolean;
    targetId?: string;
    blockId?: string;
}) {
    return (
        <div
            className="flex h-full min-h-0 flex-col bg-[var(--kt-content)] text-[var(--kt-label)]"
            style={
                initialSection !== "desktop" && !settings
                    ? { background: initialSection === "macos" ? "#141416" : "transparent" }
                    : undefined
            }
        >
            <div className="min-h-0 flex-1 overflow-hidden">
                {initialSection == "macos" ? (
                    <MacVmScreen blockId={blockId} targetName={targetId} />
                ) : initialSection == "desktop" ? (
                    <DesktopScreen settings={settings} desktopId={targetId} />
                ) : (
                    <MobileMachinePanel
                        key={`${initialSection}:${targetId ?? "default"}`}
                        platform={initialSection}
                        settings={settings}
                        targetId={targetId}
                    />
                )}
            </div>
        </div>
    );
}

function MobileMachinePanel({
    platform,
    settings,
    targetId,
}: {
    platform: string;
    settings: boolean;
    targetId?: string;
}) {
    const [state, setState] = useState<ComputersState>({
        targets: [],
        selectedId: "",
        loading: true,
        busy: false,
        error: "",
    });
    const [controller] = useState(() => {
        const api = getApi();
        return new ComputersController(
            {
                listComputerTargets: async () => {
                    const result = await api.listComputerTargets();
                    if (result.success === false) return result;
                    return {
                        success: true,
                        data: result.data,
                    };
                },
                performComputerTargetAction: (action) => api.performComputerTargetAction(action),
                takeOverComputerTarget: (id) => api.takeOverComputerTarget(id),
                resumeComputerTarget: (id, generation) => api.resumeComputerTarget(id, generation),
                startComputerTargetSession: (id, generation) => api.startComputerTargetSession(id, generation),
                readComputerTargetFrame: (id) => api.readComputerTargetFrame(id),
                stopComputerTargetSession: (id) => api.stopComputerTargetSession(id),
            },
            setState
        );
    });
    useEffect(() => {
        void controller.refresh().then(() => {
            if (targetId) controller.select(targetId);
        });
        return () => controller.dispose();
    }, [controller]);
    return settings ? (
        <ComputersPanel state={state} controller={controller} />
    ) : (
        <DeviceWorkspace
            state={state}
            controller={controller}
            preferredPlatform={platform === "android" ? "android" : "ios"}
        />
    );
}
