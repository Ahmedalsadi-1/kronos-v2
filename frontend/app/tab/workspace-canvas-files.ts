// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { OSResourceReference } from "@/app/store/os-system-types";
import { classifyMedia } from "@/app/view/medialibrary/media-library-utils";
import type { WorkspaceCanvasSize } from "./workspace-canvas-utils";

export function isLocalCanvasFilePath(path: string): boolean {
    return !path.includes("\0") && /^(?:\/|[a-z]:[\\/]|\\\\[^\\])/i.test(path);
}

export function canvasFileResource(path: string, name?: string): OSResourceReference {
    return { id: `local:${path}`, kind: "file", name: name || path.split(/[\\/]/).pop() || path, resource: path };
}

export function readNativeCanvasFiles(files: ArrayLike<File>, getPath: (file: File) => string): OSResourceReference[] {
    return readNativeCanvasDrops(files, getPath).map(({ resource }) => resource);
}

export function readNativeCanvasDrops(files: ArrayLike<File>, getPath: (file: File) => string) {
    const entries = new Map<string, { resource: OSResourceReference; file: File }>();
    for (const file of Array.from(files)) {
        try {
            const path = getPath?.(file);
            if (path && isLocalCanvasFilePath(path)) entries.set(path, { resource: canvasFileResource(path, file.name), file });
        } catch {
            // Virtual items can lack a host path. Leave other files in the drop available.
        }
    }
    return [...entries.values()];
}

export function canvasFileCardSize(path: string): WorkspaceCanvasSize {
    const kind = classifyMedia({ path, mimetype: undefined, isdir: false });
    if (kind === "audio") return { width: 360, height: 126 };
    if (kind === "video" || kind === "image") return { width: 400, height: 270 };
    return { width: 320, height: 220 };
}
