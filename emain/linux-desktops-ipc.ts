// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { hasRunningExternalAgentForTab } from "./acp/acp-agent-manager";
import { bindSandboxComputer, registerComputerChats, sandboxComputerForTab } from "./computer-access-policy";
import { isTrustedNativeHudSender, nativeHudTaskContext } from "./emain-hud";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";
import { getLinuxDesktopsRuntime } from "./linux-desktops-runtime";

export function registerLinuxDesktopsIpc(): void {
    const runtime = getLinuxDesktopsRuntime();
    const handle = (channel: string, callback: (input: any) => Promise<unknown>) =>
        ipcMain.handle(channel, async (event, input) => {
            if (
                (getWaveTabViewByWebContentsId(event.sender.id) == null &&
                    !isTrustedNativeHudSender(event.sender.id)) ||
                event.senderFrame !== event.sender.mainFrame
            ) {
                return {
                    success: false,
                    error: {
                        code: "untrusted-caller",
                        message: "Only a KronTerm workspace can manage Linux desktops.",
                    },
                };
            }
            try {
                return { success: true, data: await callback(input) };
            } catch (error) {
                return {
                    success: false,
                    error: {
                        code: "linux-desktop-error",
                        message: error instanceof Error ? error.message : "Linux desktop operation failed.",
                    },
                };
            }
        });
    handle("computer-plugins:manage", (input) => runtime.manage(input));
    ipcMain.handle(
        "computer-access",
        async (event, input?: { desktopId?: string; enabled?: boolean; sessionIds?: string[] }) => {
            const tab = getWaveTabViewByWebContentsId(event.sender.id);
            if ((!tab && !isTrustedNativeHudSender(event.sender.id)) || event.senderFrame !== event.sender.mainFrame)
                throw new Error("Only a workspace can enable Computer mode.");
            const tabId = tab?.waveTabId || nativeHudTaskContext(event.sender.id)?.tabId;
            if (!tabId) throw new Error("Computer mode requires an owning workspace tab.");
            if (input?.sessionIds) registerComputerChats(tabId, input.sessionIds, tab?.savedInitOpts?.workspaceId);
            if (input?.enabled != null) {
                if (typeof input.enabled !== "boolean") throw new Error("Invalid Computer mode selection.");
                if (input.enabled) {
                    if (hasRunningExternalAgentForTab(tabId))
                        throw new Error("Stop the workspace's external ACP agent before enabling Computer mode.");
                    const desktop = (await runtime.list()).find((desktop) => desktop.id === input.desktopId);
                    if (!desktop) throw new Error("Choose an available sandbox computer first.");
                    if (desktop.controlOwner === "agent" && desktop.assignedAgentId !== `sandbox:${tabId}`)
                        throw new Error(
                            "This computer is assigned to another workspace. Take control there or choose another computer."
                        );
                    const previous = sandboxComputerForTab(tabId);
                    await runtime.assign(desktop.id, `sandbox:${tabId}`, desktop.controlGeneration);
                    if (previous && previous !== desktop.id) {
                        const old = (await runtime.list()).find((item) => item.id === previous);
                        if (old?.assignedAgentId === `sandbox:${tabId}` && old.controlOwner === "agent")
                            await runtime.takeover(previous);
                    }
                    bindSandboxComputer(tabId, desktop.id);
                } else {
                    const id = sandboxComputerForTab(tabId);
                    if (id) {
                        const desktop = (await runtime.list()).find((desktop) => desktop.id === id);
                        if (desktop?.assignedAgentId === `sandbox:${tabId}` && desktop.controlOwner === "agent")
                            await runtime.takeover(id);
                    }
                    bindSandboxComputer(tabId);
                }
            }
            const desktopId = sandboxComputerForTab(tabId);
            return { enabled: Boolean(desktopId), desktopId: desktopId || "" };
        }
    );
    handle("linux-desktops:list", () => runtime.list());
    handle("linux-desktops:action", (input) => runtime.perform(input));
    handle("linux-desktops:takeover", (input) => runtime.takeover(input));
    handle("linux-desktops:resume", (input) => runtime.resume(input?.desktopId, input?.expectedGeneration));
    handle("linux-desktops:assign", (input) =>
        runtime.assign(input?.desktopId, input?.agentId, input?.expectedGeneration)
    );
}
