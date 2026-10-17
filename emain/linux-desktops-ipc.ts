// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { isTrustedNativeHudSender } from "./emain-hud";
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
    handle("linux-desktops:list", () => runtime.list());
    handle("linux-desktops:action", (input) => runtime.perform(input));
    handle("linux-desktops:takeover", (input) => runtime.takeover(input));
    handle("linux-desktops:resume", (input) => runtime.resume(input?.desktopId, input?.expectedGeneration));
    handle("linux-desktops:assign", (input) =>
        runtime.assign(input?.desktopId, input?.agentId, input?.expectedGeneration)
    );
}
