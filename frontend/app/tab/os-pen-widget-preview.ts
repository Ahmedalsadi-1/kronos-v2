// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/app/store/global";

export type PenWidgetPreview = { blockId: string; dataUrl: string; width: number; height: number };

export async function capturePenWidgetPreview(blockId: string): Promise<PenWidgetPreview> {
    const root = document.querySelector<HTMLElement>(`[data-live-blockid="${CSS.escape(blockId)}"]`);
    if (!root || root.getBoundingClientRect().width < 1) return;
    const guest = root.querySelector("webview") as Electron.WebviewTag;
    let dataUrl: string;
    if (guest) {
        dataUrl = (await getApi().captureBrowserPage({ guestId: guest.getWebContentsId() })).dataUrl;
    } else {
        const rect = root.getBoundingClientRect();
        if (rect.x < 0 || rect.y < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return;
        // Renderer captures include overlays; retain the last clean preview while another surface covers this widget.
        for (const x of [rect.left + 2, rect.left + rect.width / 2, rect.right - 2]) {
            for (const y of [rect.top + 2, rect.top + rect.height / 2, rect.bottom - 2]) {
                const top = document.elementFromPoint(x, y);
                if (!top || !root.contains(top)) return;
            }
        }
        dataUrl = await getApi().captureScreenshot(
            {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            },
            true
        );
    }
    if (!dataUrl) return;
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(512, image.naturalWidth);
    canvas.height = Math.max(1, Math.round((canvas.width * image.naturalHeight) / image.naturalWidth));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { blockId, dataUrl: canvas.toDataURL("image/webp", 0.7), width: canvas.width, height: canvas.height };
}
