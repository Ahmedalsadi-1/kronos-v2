// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ipcMain } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DefaultComfyOrigin, type ComfyRequest, type ComfyResponse } from "../frontend/types/comfyui";
import { comfyOrigin } from "./comfyui-client";
import { startComfyEditorProxy } from "./comfyui-editor-proxy";
import { ensureKronRender, getComfyUiClient } from "./comfyui-runtime";
import { listNativeHudWebContents } from "./emain-hud";
import { getWaveDataDir } from "./emain-platform";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";

async function storePinnedImage(imageData: string, previewDigest: string): Promise<string> {
    const image = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(imageData ?? "");
    if (!image) throw new Error("KronRender did not return an image to pin.");
    if (createHash("sha256").update(imageData).digest("hex") !== previewDigest)
        throw new Error("This output changed since it was displayed. Preview it again before pinning.");
    const [, format, base64] = image;
    const bytes = Buffer.from(base64, "base64");
    const directory = path.join(getWaveDataDir(), "images", "canvas");
    const destination = path.join(directory, `${createHash("sha256").update(bytes).digest("hex")}.${format}`);
    const temporary = path.join(directory, `${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
        await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
        await rename(temporary, destination);
    } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
    }
    return destination;
}

async function connectComfyEditor(origin: string, rendererOrigin: string) {
    try {
        const response = await fetch(`${origin}/system_stats`, {
            redirect: "error",
            signal: AbortSignal.timeout(4000),
        });
        await response.body?.cancel();
        if (!response.ok) throw new Error(`KronRender returned ${response.status}`);
    } catch {
        if (origin === DefaultComfyOrigin) await ensureKronRender();
        else throw new Error(`Could not connect to KronRender at ${origin}. Check the local engine address.`);
    }
    return startComfyEditorProxy(origin, rendererOrigin);
}

export function registerComfyUiIpc(): void {
    const editorProxies = new Map<
        number,
        {
            origin: string;
            rendererOrigin: string;
            proxy: ReturnType<typeof startComfyEditorProxy>;
            close(): void;
        }
    >();
    ipcMain.handle("comfyui-command", async (event, request: ComfyRequest): Promise<ComfyResponse> => {
        const tab = getWaveTabViewByWebContentsId(event.sender.id);
        const trusted = tab != null || listNativeHudWebContents().some((contents) => contents.id === event.sender.id);
        if (!trusted) throw new Error("Untrusted image studio caller");
        if (request?.action === "connect") {
            if (!tab || !event.senderFrame || event.senderFrame !== event.sender.mainFrame ||
                comfyOrigin(request.origin) !== DefaultComfyOrigin)
                throw new Error("KronRender setup must use the managed workspace connection.");
            await ensureKronRender();
            return {};
        }
        if (request?.action === "pin-image") {
            if (!tab || !event.senderFrame || event.senderFrame !== event.sender.mainFrame)
                throw new Error("Untrusted KronRender canvas caller");
            const { origin, id, image, previewDigest } = request;
            if (typeof previewDigest !== "string" || !/^[0-9a-f]{64}$/.test(previewDigest))
                throw new Error("Preview the KronRender output before pinning it.");
            const { imageData } = await getComfyUiClient().execute({ action: "image", origin, id, image });
            if (event.sender.isDestroyed()) throw new Error("The KronRender workspace closed");
            return { filePath: await storePinnedImage(imageData, previewDigest) };
        }
        if (request?.action === "editor") {
            if (!tab || !event.senderFrame || event.senderFrame !== event.sender.mainFrame)
                throw new Error("Untrusted KronRender editor caller");
            const origin = comfyOrigin(request.origin);
            const rendererOrigin = new URL(event.senderFrame.url).origin;
            const id = event.sender.id;
            const existing = editorProxies.get(id);
            if (existing?.origin === origin && existing.rendererOrigin === rendererOrigin) {
                const connected = await existing.proxy;
                if (editorProxies.get(id) !== existing) throw new Error("The KronRender workspace connection changed.");
                return { editorUrl: connected.url };
            }
            existing?.close();
            const proxy = connectComfyEditor(origin, rendererOrigin);
            const close = () => {
                if (editorProxies.get(id)?.proxy === proxy) editorProxies.delete(id);
                event.sender.removeListener("destroyed", close);
                void proxy.then((value) => value.close(), () => {});
            };
            editorProxies.set(id, { origin, rendererOrigin, proxy, close });
            event.sender.once("destroyed", close);
            try {
                const connected = await proxy;
                if (event.sender.isDestroyed() || editorProxies.get(id)?.proxy !== proxy)
                    throw new Error("The KronRender workspace connection changed.");
                return { editorUrl: connected.url };
            } catch (error) {
                if (editorProxies.get(id)?.proxy === proxy) close();
                throw error;
            }
        }
        const result = await getComfyUiClient().execute(request);
        if (request?.action === "image" && result.imageData) {
            return { ...result, previewDigest: createHash("sha256").update(result.imageData).digest("hex") };
        }
        return result;
    });
}
