// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { OSResourceReference } from "@/app/store/os-system-types";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { classifyMedia } from "@/app/view/medialibrary/media-library-utils";
import { arrayToBase64, base64ToArrayBuffer } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import type { WorkspaceCanvasSize } from "./workspace-canvas-utils";

export function isLocalCanvasFilePath(path: string): boolean {
    return !path.includes("\0") && /^(?:\/|[a-z]:[\\/]|\\\\[^\\])/i.test(path);
}

export function canvasFileResource(path: string, name?: string): OSResourceReference {
    return { id: `local:${path}`, kind: "file", name: name || path.split(/[\\/]/).pop() || path, resource: path };
}

function partitionCanvasFiles(files: ArrayLike<File>, getPath: (file: File) => string, items?: DataTransferItemList) {
    const native = new Map<string, OSResourceReference>();
    const virtual: File[] = [];
    const seen = new Set<File>();
    const add = (file: File, directory = false) => {
        if (seen.has(file) && !directory) return;
        seen.add(file);
        let path = "";
        try {
            path = getPath?.(file) || "";
        } catch {
            // Browser and clipboard files can lack a host path.
        }
        if (isLocalCanvasFilePath(path)) {
            const resource = canvasFileResource(path, file.name);
            if (directory) resource.kind = "folder";
            if (native.get(path)?.kind !== "folder") native.set(path, resource);
        } else if (!directory) {
            virtual.push(file);
        }
    };
    const entries = Array.from(items ?? []).filter((item) => item.kind === "file");
    const listed = Array.from(files);
    entries.forEach((item, index) => {
        const file = listed[index] ?? item.getAsFile();
        if (file) add(file, item.webkitGetAsEntry?.()?.isDirectory === true);
    });
    listed.forEach((file) => add(file));
    return { resources: [...native.values()], virtual };
}

export function readNativeCanvasFiles(files: ArrayLike<File>, getPath: (file: File) => string): OSResourceReference[] {
    return partitionCanvasFiles(files, getPath).resources;
}

export function canvasFileCardSize(path: string): WorkspaceCanvasSize {
    const kind = classifyMedia({
        path: canvasMediaUrl(path) ? new URL(path).pathname : path,
        mimetype: undefined,
        isdir: false,
    });
    if (kind === "audio") return { width: 360, height: 126 };
    if (kind === "video" || kind === "image") return { width: 400, height: 270 };
    return { width: 320, height: 220 };
}

export function canvasResourceCardSize(resource: OSResourceReference): WorkspaceCanvasSize {
    if (resource.kind === "folder") return { width: 340, height: 260 };
    if (resource.kind === "file" || resource.kind === "generated-artifact") {
        return canvasFileCardSize(resource.resource);
    }
    return { width: 260, height: 112 };
}

export function acceptsCanvasTransfer(transfer: DataTransfer): boolean {
    return ["Files", "text/html", "text/uri-list"].some((type) => transfer.types.includes(type));
}

export function allowCanvasDrop(event: Pick<DragEvent, "preventDefault" | "stopPropagation" | "dataTransfer">): void {
    event.preventDefault();
    // The global HTML5 drag backend overrides dropEffect for sources it doesn't own.
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
}

export function isCanvasPasteTarget(target: EventTarget): boolean {
    return !(
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable], [role='textbox'], [data-canvas-shortcuts='ignore']")
    );
}

export function canvasMediaUrl(value: string): string | undefined {
    try {
        const url = new URL(value);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
        const kind = classifyMedia({ path: url.pathname, mimetype: undefined, isdir: false });
        if (["image", "video", "audio"].includes(kind)) return url.href;
    } catch {
        return;
    }
}

export function readCanvasTransfer(transfer: DataTransfer, getPath: (file: File) => string, paste = false) {
    const { resources, virtual } = partitionCanvasFiles(transfer.files, getPath, transfer.items);
    if (resources.length || virtual.length) return { resources, virtual };

    const html = transfer.getData("text/html");
    const plain = transfer.getData("text/plain").trim();
    const plainIsMarkup = /^<(?:!doctype\s+html\b|[a-z][\w-]*(?:\s|>|\/>))/i.test(plain);
    if (plainIsMarkup) {
        virtual.push(new File([plain], "Pasted HTML.html", { type: "text/html" }));
        return { resources, virtual };
    }

    const template = document.createElement("template");
    template.innerHTML = html;
    const media = template.content.querySelectorAll("img[src], video[src], audio[src]");
    const source = media.length === 1 && !template.content.textContent.trim() ? media[0].getAttribute("src") : "";
    const uri = transfer
        .getData("text/uri-list")
        .split(/\r?\n/)
        .find((line) => line && !line.startsWith("#"));
    const url = [source, uri, plain].filter(Boolean).map(canvasMediaUrl).find(Boolean);
    if (url) {
        const name = new URL(url).pathname.split("/").pop();
        resources.push({ id: url, kind: "file", name, resource: url });
        return { resources, virtual };
    }
    const embedded = /^data:image\/(png|jpeg|gif|webp|avif);base64,(.+)$/is.exec(source || "");
    if (embedded) {
        const [, format, data] = embedded;
        try {
            virtual.push(new File([base64ToArrayBuffer(data)], `image.${format}`, { type: `image/${format}` }));
            return { resources, virtual };
        } catch {
            // Keep malformed embedded images in the HTML fragment.
        }
    }
    if (html.trim()) virtual.push(new File([html], "Pasted HTML.html", { type: "text/html" }));
    else if (paste && plain)
        virtual.push(new File([transfer.getData("text/plain")], "Pasted text.txt", { type: "text/plain" }));
    return { resources, virtual };
}

export async function persistCanvasFile(file: File, home: string): Promise<OSResourceReference> {
    const directory = `${home}/.kronos/canvas-imports/${crypto.randomUUID()}`;
    if (!home || !isLocalCanvasFilePath(directory)) throw new Error("Local storage unavailable");
    const fallbackExtension = file.type === "image/jpeg" ? "jpg" : file.type.match(/^image\/(png|gif|webp|avif)$/)?.[1];
    const filename = file.name || (fallbackExtension ? `Image.${fallbackExtension}` : "Untitled");
    const name = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "") || "Untitled";
    const path = `${directory}/${name}`;
    const remotePath = formatRemoteUri(path, "local");
    await RpcApi.FileMkdirCommand(TabRpcClient, { info: { path: formatRemoteUri(directory, "local") } });
    try {
        const chunkSize = 128 * 1024;
        for (let offset = 0; offset < Math.max(file.size, 1); offset += chunkSize) {
            const bytes = await file.slice(offset, offset + chunkSize).arrayBuffer();
            await RpcApi.FileAppendCommand(TabRpcClient, {
                info: { path: remotePath, mode: 0o600 },
                data64: arrayToBase64(new Uint8Array(bytes)),
            });
        }
    } catch (error) {
        await RpcApi.FileDeleteCommand(TabRpcClient, {
            path: formatRemoteUri(directory, "local"),
            recursive: true,
        }).catch(() => undefined);
        throw error;
    }
    return canvasFileResource(path, filename);
}

export function importCanvasTransfer(
    transfer: DataTransfer,
    api: Pick<ElectronApi, "getPathForFile" | "getHomeDir">,
    place: (resources: OSResourceReference[]) => void,
    onError: (message: string) => void,
    paste = false
): boolean {
    const { resources, virtual } = readCanvasTransfer(transfer, api.getPathForFile, paste);
    if (!resources.length && !virtual.length) return false;
    if (resources.length) place(resources);
    if (virtual.length) {
        const home = api.getHomeDir();
        void Promise.allSettled(virtual.map((file) => persistCanvasFile(file, home))).then((results) => {
            const imported = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
            if (imported.length) place(imported);
            if (imported.length !== virtual.length) {
                onError(
                    imported.length || resources.length
                        ? "Some files could not be imported."
                        : "Could not import the files."
                );
            }
        });
    }
    return true;
}
