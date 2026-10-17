// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { manageNativeBackgroundWorkspaces } from "../mcp-kron-term/src/background-workspace-tools";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";

export function registerNativeTaskGroupsIpc(): void {
    ipcMain.handle("native-task-groups:manage", async (event, input: unknown) => {
        const tab = getWaveTabViewByWebContentsId(event.sender.id);
        if (tab == null || event.senderFrame !== event.sender.mainFrame) {
            return {
                success: false,
                error: {
                    code: "untrusted-caller",
                    message: "Only a KronTerm workspace can manage native task groups.",
                },
            };
        }
        try {
            if (input == null || typeof input !== "object") throw new Error("Invalid task group request.");
            const request = input as Record<string, unknown>;
            const operation = request.operation;
            if (
                ![
                    "list",
                    "pause",
                    "reveal",
                    "preview",
                    "return_windows",
                    "approve_window",
                    "remove_window",
                    "finish",
                ].includes(String(operation))
            ) {
                throw new Error("Unknown task group operation.");
            }
            if (operation !== "list" && (typeof request.sessionId !== "string" || !request.sessionId)) {
                throw new Error("Select a task group first.");
            }
            if (request.bundleId != null && typeof request.bundleId !== "string") throw new Error("Invalid app.");
            if (
                ["approve_window", "remove_window"].includes(String(operation)) &&
                (!Number.isInteger(request.windowId) || Number(request.windowId) <= 0)
            ) {
                throw new Error("Invalid window.");
            }
            const data = await manageNativeBackgroundWorkspaces(operation as any, {
                scopeId: tab.waveTabId,
                sessionId: request.sessionId as string,
                bundleId: request.bundleId as string,
                windowId: request.windowId as number,
            });
            return { success: true, data };
        } catch (error) {
            return {
                success: false,
                error: {
                    code: "native-task-group-error",
                    message: error instanceof Error ? error.message : "Task group unavailable.",
                },
            };
        }
    });
}
