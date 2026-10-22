// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { app, ipcMain } from "electron";
import { isTrustedNativeHudSender } from "./emain-hud";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";
import { MacVmRuntime } from "./macos-vm-runtime";

export function registerMacVmIpc(): void {
    const runtime = new MacVmRuntime();
    const owners = new Set<number>();
    let quitting = false;
    app.on("before-quit", (event) => {
        if (quitting || !runtime.hasActiveSessions()) return;
        event.preventDefault();
        quitting = true;
        void runtime.dispose().finally(() => app.quit());
    });
    const handle = (channel: string, operation: (input: any, owner: number, origin: string) => Promise<unknown>) =>
        ipcMain.handle(channel, async (event, input) => {
            const sender = event.sender;
            if (
                event.senderFrame !== sender.mainFrame ||
                (!getWaveTabViewByWebContentsId(sender.id) && !isTrustedNativeHudSender(sender.id))
            ) {
                return {
                    success: false,
                    error: { code: "untrusted-caller", message: "Only a KronTerm workspace can manage macOS VMs." },
                };
            }
            if (!owners.has(sender.id)) {
                owners.add(sender.id);
                sender.once("destroyed", () => {
                    owners.delete(sender.id);
                    void runtime.closeOwner(sender.id);
                });
            }
            try {
                const origin = new URL(sender.mainFrame.url).origin;
                const data = await operation(input, sender.id, origin);
                if (sender.isDestroyed()) {
                    await runtime.closeOwner(sender.id);
                    throw new Error("The workspace closed while starting its VM");
                }
                return { success: true, data };
            } catch (error) {
                return {
                    success: false,
                    error: {
                        code: "macos-vm-unavailable",
                        message: error instanceof Error ? error.message : "macOS VM operation failed.",
                    },
                };
            }
        });
    handle("macos-vms:list", () => runtime.list());
    handle("macos-vms:start", (input, owner, origin) => runtime.start(input?.name, owner, origin));
    handle("macos-vms:stop", async (input, owner) => {
        await runtime.stop(input?.sessionId, owner);
    });
}
