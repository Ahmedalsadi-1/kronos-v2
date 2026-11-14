// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { strToU8, zipSync } from "fflate";

export function penDownload(result: { content?: string; assets?: Array<{ path: string; data: Uint8Array | ArrayBuffer }> }) {
    if (typeof result?.content !== "string" || !result.content) throw new Error("The editor did not return a document.");
    if (!result.assets?.length) return { name: "design.pen", type: "application/json", bytes: strToU8(result.content) };
    const files: Record<string, Uint8Array> = { "design.pen": strToU8(result.content) };
    for (const asset of result.assets) {
        const path = asset.path.replace(/^\.\//, "");
        if (!path || path.startsWith("/") || path.includes("\\") || path.includes(":") || path.split("/").includes("..") || path === "design.pen") {
            throw new Error("The design contains an asset with an unsupported export path.");
        }
        files[path] = asset.data instanceof Uint8Array ? asset.data : new Uint8Array(asset.data);
    }
    return { name: "design.zip", type: "application/zip", bytes: zipSync(files) };
}
