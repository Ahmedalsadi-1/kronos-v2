// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, ipcMain } from "electron";
import type { ComputerTargetsResult } from "../frontend/types/computer-targets";
import { ComputerTargetSessions } from "./computer-target-sessions";
import { getComputerTargetsRuntime } from "./computer-targets-runtime";
import { isTrustedNativeHudSender } from "./emain-hud";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";

export function registerComputerTargetsIpc(): void {
    const runtime = getComputerTargetsRuntime();
    const sessions = new ComputerTargetSessions(runtime);
    const owners = new Set<number>();
    app?.on("before-quit", () => void sessions.dispose());
    const handle = <T>(channel: string, callback: (input: unknown, owner: number) => Promise<T>) =>
        ipcMain.handle(channel, async (event, input): Promise<ComputerTargetsResult<T>> => {
            if (
                (getWaveTabViewByWebContentsId(event.sender.id) == null &&
                    !isTrustedNativeHudSender(event.sender.id)) ||
                event.senderFrame !== event.sender.mainFrame
            ) {
                return {
                    success: false,
                    error: { code: "untrusted-caller", message: "Only a KronOS workspace can manage computers." },
                };
            }
            if (!owners.has(event.sender.id)) {
                owners.add(event.sender.id);
                event.sender.once?.("destroyed", () => void sessions.closeOwner(event.sender.id));
            }
            try {
                return { success: true, data: await callback(input, event.sender.id) };
            } catch (error) {
                return {
                    success: false,
                    error: {
                        code: "computer-target-unavailable",
                        message: error instanceof Error ? error.message : "Simulator operation failed.",
                    },
                };
            }
        });
    handle("computer-targets:list", () => runtime.list());
    handle("computer-targets:action", (input) => runtime.perform(input));
    handle("computer-targets:pick", (input) => runtime.pickElement(input));
    handle("computer-targets:takeover", (input) => runtime.takeOver(input));
    handle("computer-targets:resume", (input) => {
        if (input == null || typeof input !== "object") throw new Error("Invalid resume request.");
        const request = input as { targetId: unknown; expectedGeneration: number };
        return runtime.resume(request.targetId, request.expectedGeneration);
    });
    handle("computer-targets:connect", (input, owner) => {
        if (input == null || typeof input !== "object") throw new Error("Invalid device connection.");
        const request = input as { targetId: unknown; expectedGeneration: unknown };
        return sessions.start(request.targetId, request.expectedGeneration, owner);
    });
    handle("computer-targets:frame", (input, owner) => sessions.frame(input, owner));
    handle("computer-targets:disconnect", (input, owner) => sessions.stop(input, owner));
}
