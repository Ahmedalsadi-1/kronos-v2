// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { extractEmbeddedImages } from "@hermes/lib/embedded-images";

type PenImage = { type: "image"; data: string; mimeType: string };
type PenOutput = string | (PenImage | { type: "text"; text: string })[];

const ImageFields = new Set(["image", "image_base64", "image_url", "base64", "screenshot", "screenshot_url"]);
const RasterMime = /^image\/(png|jpeg|webp|gif)$/i;
const DataImage = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;
const Base64Image = /^[A-Za-z0-9+/=\s]+$/;
const PngBase64Prefix = "iVBORw0KGgo";

export function penToolOutput(result: unknown, failed = false): PenOutput {
    const images = new Map<string, PenImage>();
    let captures = 0;
    const capture = (value: unknown, mime: unknown = "image/png") => {
        if (typeof value !== "string") return false;
        const url = DataImage.exec(value);
        const mediaType = url?.[1] ?? mime;
        const bytes = url?.[2] ?? value;
        if (typeof mediaType !== "string" || !RasterMime.test(mediaType) || bytes.length < 32 || !Base64Image.test(bytes))
            return false;
        const data = bytes.replace(/\s+/g, "");
        images.set(data, { type: "image", data, mimeType: mediaType.toLowerCase() });
        captures++;
        return true;
    };
    const clean = (value: unknown): unknown => {
        if (typeof value === "string") {
            const trimmed = value.trim();
            if ((DataImage.test(trimmed) || trimmed.startsWith(PngBase64Prefix)) && capture(trimmed))
                return undefined;
            if (/^\s*[\[{]/.test(value)) {
                try {
                    const previousCaptures = captures;
                    const parsed = JSON.parse(value);
                    const cleaned = clean(parsed);
                    if (captures !== previousCaptures) return cleaned;
                } catch {
                    // A tool can print a data URL inside text that is not valid JSON.
                }
            }
            const { cleanedText, images: embedded } = extractEmbeddedImages(value);
            const supported = embedded.filter((url) => DataImage.test(url));
            if (!supported.length || supported.length !== embedded.length) return value;
            for (const url of supported) capture(url);
            return cleanedText.replace(/!\[[^\]\n]*\]\(\)/g, "").trim() || undefined;
        }
        if (Array.isArray(value)) return value.map(clean).filter((item) => item !== undefined);
        if (value == null || typeof value !== "object") return value;
        const record = value as Record<string, unknown>;
        const source = record.source as { data?: unknown; media_type?: unknown } | undefined;
        if (record.type === "image" && capture(source?.data ?? record.data, source?.media_type ?? record.mimeType))
            return undefined;
        if (record.type === "image_url" && capture((record.image_url as { url?: unknown })?.url ?? record.image_url))
            return undefined;
        if (record.type === "text" && typeof record.text === "string") {
            const text = clean(record.text);
            return text === undefined ? undefined : { ...record, text };
        }
        return Object.fromEntries(
            Object.entries(record).flatMap(([key, entry]) => {
                if (ImageFields.has(key) && capture(entry, record.mimeType ?? record.mediaType)) return [];
                const cleaned = clean(entry);
                return cleaned === undefined ? [] : [[key, cleaned]];
            })
        );
    };
    const cleaned = clean(result);
    const summary = cleaned as { _multimodal?: boolean; text_summary?: unknown } | undefined;
    const text = typeof cleaned === "string"
        ? cleaned
        : summary?._multimodal && typeof summary.text_summary === "string"
          ? summary.text_summary
          : JSON.stringify(cleaned, null, 2);
    if (!images.size) return text || (failed ? "Tool failed without output." : "No output returned.");
    const hasText = text && text !== "{}" && text !== "[]";
    return [...(hasText ? [{ type: "text" as const, text }] : []), ...images.values()];
}
