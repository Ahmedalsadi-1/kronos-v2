// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { registerBrowserToolsIpc } from "./browser/browser-tools-ipc";
import * as hud from "./emain-hud";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";
import { getAllWaveWindows } from "./emain-window";
import { controlNowPlaying, getNowPlaying } from "./now-playing";
import { initializeWorkflows, subscribeWorkflows, workflowCommand, workflowStore } from "./workflow-runtime";

export function registerNativeHudIpc(): void {
    const trusted = (sender: Electron.WebContents) =>
        getWaveTabViewByWebContentsId(sender.id) != null ||
        hud.listNativeHudWebContents().some((target) => target.id === sender.id);
    const on = (channel: string, callback: (id: number, ...args: any[]) => unknown) =>
        ipcMain.on(channel, (event, ...args) => {
            if (trusted(event.sender)) callback(event.sender.id, ...args);
        });
    const handle = (channel: string, callback: (id: number, ...args: any[]) => unknown) =>
        ipcMain.handle(channel, (event, ...args) => {
            if (!trusted(event.sender)) throw new Error("Untrusted notch caller");
            return callback(event.sender.id, ...args);
        });
    on("request-agent-takeover", hud.requestNativeAgentTakeover);
    on("set-hud-window-mode", (id, active, sessionId, options) => {
        hud.setNativeHudMode(id, active, sessionId, options);
        try {
            hud.publishNativeWorkflow(workflowStore().snapshot());
        } catch (error) {
            console.warn("[workflows] HUD summary unavailable", error);
        }
    });
    on("set-window-ignore-mouse", hud.setNativeHudIgnoreMouse);
    on("request-native-hud-launch", hud.requestNativeHudLaunch);
    on("request-native-hud-exit", hud.requestNativeHudExit);
    on("move-native-hud-by", hud.moveNativeHudBy);
    on("close-native-hud-surface", hud.closeNativeHudSurface);
    on("sync-native-notch", hud.syncNativeNotch);
    on("report-agent-cursor", hud.reportNativeAgentCursor);
    handle("now-playing-get", () => getNowPlaying());
    handle("now-playing-control", (_id, source, command) => controlNowPlaying(source, command));
    handle("open-native-hud-island", hud.openNativeHudIsland);
    handle("set-native-hud-island-visibility", hud.setNativeHudIslandVisibility);
    handle("get-hud-widget-route", hud.resolveNativeHudWidgetRoute);
    handle("get-native-hud-island-presentation", hud.getNativeHudIslandPresentation);
    handle("toggle-native-hud-island-expanded", hud.toggleNativeHudIslandExpanded);
    handle("resize-current-hud-island", hud.resizeCurrentNativeHudIsland);
    handle("select-native-hud-widget", hud.selectNativeHudWidget);
    handle("capture-native-hud-block", hud.captureNativeHudBlock);
    handle("send-hermes-context", hud.forwardHermesContext);
    handle("send-hermes-selection", hud.forwardHermesSelection);
    handle("workflow-command", (_id, command) => workflowCommand(command));
    handle("workflow-context", async (id) => {
        const context = hud.nativeHudTaskContext(id);
        const { KronTermNativeToolBridge } = await import("./kronterm-native-tool-bridge");
        const bridge = new KronTermNativeToolBridge(() => context);
        return { ...context, blocks: JSON.parse(await bridge.listBlocks(context.tabId)) };
    });
    handle("workflow-open", async (id, runId) => {
        const run = workflowStore().get(runId);
        const { getWaveWindowByWorkspaceId } = await import("./emain-window");
        const window = getWaveWindowByWorkspaceId(run.target.workspaceId);
        if (!window) throw new Error("Workflow workspace is unavailable");
        await window.setActiveTab(run.target.tabId);
        window.show();
        window.focus();
        return true;
    });
    subscribeWorkflows((snapshot) => {
        for (const window of getAllWaveWindows()) {
            for (const tab of window.allLoadedTabViews.values()) {
                if (!tab.webContents.isDestroyed()) tab.webContents.send("workflow-changed", snapshot);
            }
        }
        for (const contents of hud.listNativeHudWebContents()) contents.send("workflow-changed", snapshot);
        hud.publishNativeWorkflow(snapshot);
    });
    try {
        initializeWorkflows();
    } catch (error) {
        console.error("[workflows] Local journal unavailable; workspace startup continues", error);
    }
    registerBrowserToolsIpc(trusted);
}
