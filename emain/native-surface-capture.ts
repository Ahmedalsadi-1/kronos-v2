// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { desktopCapturer, ipcMain, webContents, type Session, type WebContents } from "electron";
import { selectNativeSurfaceSource } from "./native-surface-selection";

export function registerNativeSurfaceCaptureIpc(isTrusted: (sender: WebContents) => boolean): void {
    const sessions = new WeakSet<Session>();
    const preparing = new Set<number>();
    const observed = new WeakSet<WebContents>();
    const pending = new Map<number, { source: Electron.DesktopCapturerSource; expires: number; url: string }>();
    ipcMain.handle("prepare-native-surface-capture", async (event, input) => {
        if (event.senderFrame !== event.sender.mainFrame || !isTrusted(event.sender)) {
            throw new Error("Capture requires a trusted workspace surface");
        }
        if (typeof input?.appName !== "string" || !input.appName.trim()) {
            throw new Error("An application name is required for capture");
        }
        const sender = event.sender;
        if (preparing.has(sender.id) || (pending.get(sender.id)?.expires ?? 0) > Date.now()) {
            throw new Error("Another app capture is being prepared; retry live capture shortly");
        }
        preparing.add(sender.id);
        const url = sender.mainFrame.url;
        try {
            const sources = await desktopCapturer.getSources({
                types: ["window"],
                thumbnailSize: { width: 0, height: 0 },
            });
            const source = selectNativeSurfaceSource(sources, input.appName);
            if (!source) throw new Error(`No unambiguous window found for ${input.appName}`);
            if (sender.isDestroyed() || event.senderFrame !== sender.mainFrame || sender.mainFrame.url !== url) {
                throw new Error("The workspace changed while preparing capture");
            }
            const session = sender.session;
            if (!sessions.has(session)) {
                session.setDisplayMediaRequestHandler((request, callback) => {
                    const frame = request.frame;
                    const owner = frame && webContents.fromFrame(frame);
                    if (!owner || frame !== owner.mainFrame || !isTrusted(owner)) {
                        callback({});
                        return;
                    }
                    const selection = pending.get(owner.id);
                    pending.delete(owner.id);
                    if (
                        !selection ||
                        selection.expires < Date.now() ||
                        selection.url !== frame.url ||
                        !request.videoRequested ||
                        request.audioRequested
                    ) {
                        callback({});
                        return;
                    }
                    callback({ video: selection.source });
                });
                sessions.add(session);
            }
            pending.set(sender.id, { source, expires: Date.now() + 10_000, url: sender.mainFrame.url });
            const id = sender.id;
            if (!observed.has(sender)) {
                observed.add(sender);
                sender.once("destroyed", () => pending.delete(id));
            }
            return { sourceId: source.id, title: source.name };
        } finally {
            preparing.delete(sender.id);
        }
    });
}
