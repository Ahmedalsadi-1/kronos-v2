// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { stringToBase64 } from "@/util/util";
import type { ComposerAttachment } from "@hermes/store/composer";

const MaxAttachmentBytes = 20 * 1024 * 1024;
const MaxAttachmentCount = 20;
const ImageTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function penComposerAttachments(files: unknown): ComposerAttachment[] {
    if (files == null) return [];
    if (!Array.isArray(files) || files.length > MaxAttachmentCount) {
        throw new Error(`Attach at most ${MaxAttachmentCount} files per message.`);
    }
    let totalBytes = 0;
    return files.map((file) => {
        if (!file || typeof file.name !== "string" || !file.name.trim() || file.name.length > 512) {
            throw new Error("The attachment has no valid filename. Remove it and attach it again.");
        }
        const name = file.name.split(/[\\/]/).at(-1);
        if (!name || name === "." || name === ".." || /[\x00-\x1f]/.test(name)) {
            throw new Error("The attachment filename is invalid.");
        }
        let mime: string;
        let data: string;
        let kind: "image" | "file" = "file";
        if (file.type === "text" && typeof file.content === "string") {
            if (file.content.length > MaxAttachmentBytes)
                throw new Error(`${name} exceeds the 20 MB attachment limit.`);
            mime = "text/plain;charset=utf-8";
            data = stringToBase64(file.content);
        } else if (file.type === "pdf") {
            mime = "application/pdf";
            data = file.data;
        } else if (file.type === "image" && file.source?.type === "base64" && ImageTypes.has(file.source.media_type)) {
            kind = "image";
            mime = file.source.media_type;
            data = file.source.data;
        } else {
            // Embedded Pen paths are browser filenames, not trusted desktop paths.
            throw new Error(
                `${name} cannot be sent from Pen chat. Attach an image, PDF, or text file; audio and path-only attachments are not supported here yet.`
            );
        }
        if (
            typeof data !== "string" ||
            data.length > Math.ceil(MaxAttachmentBytes / 3) * 4 ||
            data.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
        ) {
            throw new Error(`${name} has invalid attachment data or exceeds the 20 MB limit.`);
        }
        totalBytes += (data.length / 4) * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
        if (totalBytes > MaxAttachmentBytes) throw new Error("Attachments exceed the 20 MB total per message.");
        const dataUrl = `data:${mime};base64,${data}`;
        return {
            id: crypto.randomUUID(),
            kind,
            label: name,
            path: name,
            ...(kind === "image" ? { imageDataUrl: dataUrl } : { fileDataUrl: dataUrl }),
        };
    });
}
