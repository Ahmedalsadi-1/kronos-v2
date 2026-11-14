// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BrowserWindow, dialog, ipcMain } from "electron";
import type { LinuxDesktopAction, SandboxComputerAccessRequest } from "../frontend/types/linux-desktops";
import type { SandboxLoginUiCommand } from "../frontend/types/sandbox-login";
import { hasRunningExternalAgentForTab } from "./acp/acp-agent-manager";
import {
    bindSandboxChatComputer,
    bindSandboxComputer,
    computerTabForChats,
    hasSeparateChatComputer,
    registerComputerChats,
    sandboxChatComputer,
    sandboxChatSelection,
    sandboxComputerForTab,
    sandboxComputerModeForTab,
} from "./computer-access-policy";
import { isTrustedNativeHudSender, nativeHudTaskContext } from "./emain-hud";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";
import { getLinuxDesktopsRuntime } from "./linux-desktops-runtime";
import { getSandboxLoginBroker } from "./sandbox-login";

export function registerLinuxDesktopsIpc(): void {
    const runtime = getLinuxDesktopsRuntime();
    const changingAccess = new Set<string>();
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
                        message: "Only a KronOS workspace can manage Linux desktops.",
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
    ipcMain.handle("sandbox-login", async (event, input: SandboxLoginUiCommand) => {
        const tab = getWaveTabViewByWebContentsId(event.sender.id);
        if ((!tab && !isTrustedNativeHudSender(event.sender.id)) || event.senderFrame !== event.sender.mainFrame)
            throw new Error("Only a workspace can manage sign-in.");
        const senderTabId = tab?.waveTabId || nativeHudTaskContext(event.sender.id)?.tabId;
        const tabId = computerTabForChats(input?.sessionIds, senderTabId);
        if (!tabId) throw new Error("Sign-in requires an owning workspace.");
        return getSandboxLoginBroker().ui(tabId, input);
    });
    ipcMain.handle("computer-access", async (event, input?: SandboxComputerAccessRequest) => {
        const tab = getWaveTabViewByWebContentsId(event.sender.id);
        if ((!tab && !isTrustedNativeHudSender(event.sender.id)) || event.senderFrame !== event.sender.mainFrame)
            throw new Error("Only a workspace can enable Computer mode.");
        const hudContext = tab ? undefined : nativeHudTaskContext(event.sender.id);
        const senderTabId = tab?.waveTabId || hudContext?.tabId;
        const ownerTabId = computerTabForChats(input?.sessionIds, senderTabId);
        const tabId = input?.enabled === true ? senderTabId : ownerTabId;
        if (!tabId) throw new Error("Computer mode requires an owning workspace tab.");
        const sessionId = input?.sessionIds?.at(-1);
        if (input?.enabled != null && ownerTabId !== senderTabId && sandboxChatComputer(ownerTabId, sessionId))
            throw new Error("Manage the separate sandbox from the chat's owning workspace.");
        const workspaceId =
            tabId === senderTabId ? (tab?.savedInitOpts?.workspaceId ?? hudContext?.workspaceId) : undefined;
        if (input?.sessionIds) registerComputerChats(tabId, input.sessionIds, workspaceId);
        const chatComputer = sandboxChatComputer(tabId, sessionId);
        if (input?.enabled != null) {
            if (typeof input.enabled !== "boolean") throw new Error("Invalid Computer mode selection.");
            if (input.mode != null && !["sandbox", "hybrid"].includes(input.mode))
                throw new Error("Invalid computer access mode.");
            if (input.separateChat != null && typeof input.separateChat !== "boolean")
                throw new Error("Invalid separate sandbox permission.");
            if (input.startIfStopped != null && typeof input.startIfStopped !== "boolean")
                throw new Error("Invalid sandbox startup preference.");
            const separate = Boolean(chatComputer || (input.enabled && input.separateChat));
            const chatId = separate ? sandboxChatSelection(tabId, sessionId) : undefined;
            const previous = separate ? chatComputer?.desktopId : sandboxComputerForTab(tabId);
            if (changingAccess.has(tabId)) throw new Error("Another Computer mode change is in progress.");
            if (getSandboxLoginBroker().blocksTab(tabId))
                throw new Error("Finish or cancel sign-in before changing Computer mode.");
            changingAccess.add(tabId);
            try {
                if (input.enabled) {
                    if (getSandboxLoginBroker().blocksComputer(input.desktopId))
                        throw new Error("Finish or cancel sign-in in the chat login card before returning control.");
                    if (hasRunningExternalAgentForTab(tabId))
                        throw new Error("Stop the workspace's external ACP agent before enabling Computer mode.");
                    if (
                        hasSeparateChatComputer(input.desktopId, tabId, chatId) ||
                        (separate && sandboxComputerForTab(tabId) === input.desktopId)
                    )
                        throw new Error(
                            "Choose a computer that is not already granted to this workspace or another chat."
                        );
                    const desktops = await runtime.list();
                    const desktop = desktops.find((desktop) => desktop.id === input.desktopId);
                    if (!desktop || desktop.status === "unavailable")
                        throw new Error("Choose an available sandbox computer first.");
                    if (!desktop.imagePrepared && desktop.status !== "running")
                        throw new Error("Prepare this desktop before granting Computer mode.");
                    const agentId = `sandbox:${tabId}`;
                    const previousAgentId = desktop.assignedAgentId;
                    if (previousAgentId?.startsWith("sandbox:") && previousAgentId !== agentId) {
                        const options = {
                            type: "question" as const,
                            message: `Move control of ${desktop.name} to this workspace?`,
                            detail: "The other workspace will lose access to this desktop. Its files and apps will stay open.",
                            buttons: ["Cancel", "Move control"],
                            defaultId: 0,
                            cancelId: 0,
                            noLink: true,
                        };
                        const parent = BrowserWindow.fromWebContents(event.sender);
                        const { response } = await (parent
                            ? dialog.showMessageBox(parent, options)
                            : dialog.showMessageBox(options));
                        if (response !== 1) throw new Error("This computer is assigned to another workspace.");
                        if (getSandboxLoginBroker().blocksComputer(desktop.id))
                            throw new Error("Finish or cancel sign-in before moving computer control.");
                    } else if (desktop.controlOwner === "agent" && previousAgentId !== agentId) {
                        throw new Error(
                            "This computer is reserved by another agent. Take control in the desktop viewer first."
                        );
                    }
                    if (input.startIfStopped && desktop.status !== "running") {
                        const start: LinuxDesktopAction = {
                            desktopId: desktop.id,
                            action: "start",
                            expectedGeneration: desktop.controlGeneration,
                        };
                        const started =
                            desktop.controlOwner === "agent"
                                ? await runtime.performAgent({ ...start, assignedAgentId: previousAgentId })
                                : await runtime.perform(start);
                        if (started.desktop.controlGeneration !== desktop.controlGeneration)
                            throw new Error("Computer control changed. Choose the desktop again.");
                    }
                    const unchangedGrant =
                        previous === desktop.id &&
                        desktop.controlOwner === "agent" &&
                        previousAgentId === agentId &&
                        sandboxComputerModeForTab(tabId, chatId) === (input.mode || "sandbox");
                    const grant = unchangedGrant
                        ? undefined
                        : await runtime.assign(desktop.id, agentId, desktop.controlGeneration);
                    try {
                        if (previous && previous !== desktop.id) {
                            const old = desktops.find((item) => item.id === previous);
                            if (old?.assignedAgentId === `sandbox:${tabId}` && old.controlOwner === "agent")
                                await runtime.takeover(previous, {
                                    agentId: old.assignedAgentId,
                                    generation: old.controlGeneration,
                                });
                        }
                    } catch (error) {
                        if (grant)
                            await runtime
                                .takeover(grant.id, {
                                    agentId: grant.assignedAgentId,
                                    generation: grant.controlGeneration,
                                })
                                .catch(() => {});
                        throw error;
                    }
                    if (separate) bindSandboxChatComputer(tabId, chatId, desktop.id, input.mode);
                    else bindSandboxComputer(tabId, desktop.id, input.mode);
                    if (!separate && input.sessionIds)
                        registerComputerChats(tabId, input.sessionIds, workspaceId, true);
                } else {
                    if (previous) {
                        const desktop = (await runtime.list()).find((desktop) => desktop.id === previous);
                        if (desktop?.assignedAgentId === `sandbox:${tabId}` && desktop.controlOwner === "agent")
                            await runtime.takeover(previous, {
                                agentId: desktop.assignedAgentId,
                                generation: desktop.controlGeneration,
                            });
                    }
                    if (separate) bindSandboxChatComputer(tabId, chatId);
                    else bindSandboxComputer(tabId);
                }
            } finally {
                changingAccess.delete(tabId);
            }
        }
        const desktopId = sandboxComputerForTab(tabId, sessionId);
        return {
            enabled: Boolean(desktopId),
            desktopId: desktopId || "",
            mode: sandboxComputerModeForTab(tabId, sessionId),
            ...(sandboxChatComputer(tabId, sessionId) && { separateChat: true }),
        };
    });
    handle("linux-desktops:list", () => runtime.list());
    handle("linux-desktops:action", (input) => runtime.perform(input));
    handle("linux-desktops:takeover", (input) => runtime.takeover(input));
    handle("linux-desktops:resume", (input) => {
        if (getSandboxLoginBroker().blocksComputer(input?.desktopId))
            throw new Error("Finish or cancel sign-in in the chat login card before returning control.");
        return runtime.resume(input?.desktopId, input?.expectedGeneration);
    });
    handle("linux-desktops:assign", (input) =>
        runtime.assign(input?.desktopId, input?.agentId, input?.expectedGeneration)
    );
}
