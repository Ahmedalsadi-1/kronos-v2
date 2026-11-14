// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { base64ToString } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import { importPenLayers } from "./os-pen-import";
import type { OSCanvasObject } from "./os-workspace-model";

const MaxDirectories = 256;
const MaxDocumentBytes = 10_000_000;
const MaxDocumentsPerScan = 64;
const ExcludedDirectories = new Set(["node_modules", "vendor", "dist", "coverage", "target", "build"]);

export type PenProjectDocument = {
    path: string;
    layers: OSCanvasObject[];
    skipped: number;
};

export function penProjectRoots(roots: string[], cwd: string, home: string): string[] {
    const absolute = (path: string) =>
        path
            .replace(/^~(?=\/)/, home ?? "")
            .replace(/\\/g, "/")
            .replace(/\/+$/, "");
    const paths = roots.length ? roots : [cwd];
    return [...new Set(paths.map((path) => absolute(path?.trim() ?? "")))].filter(
        (path) => /^(?:\/[^/]|[a-z]:[\\/])/i.test(path) && path !== absolute(home)
    );
}

export async function loadPenProject(
    roots: string[],
    loadedPaths: readonly string[],
    signal: AbortSignal,
    onDocument: (document: PenProjectDocument) => void
) {
    const queue = [...roots];
    const visited = new Set<string>();
    const loaded = new Set(loadedPaths);
    let found = 0;
    let failed = 0;
    let skipped = 0;
    let reads = 0;
    while (queue.length && visited.size < MaxDirectories) {
        signal.throwIfAborted();
        const dir = queue.shift();
        if (visited.has(dir)) continue;
        visited.add(dir);
        let entries: FileInfo[];
        try {
            entries = await RpcApi.FileListCommand(TabRpcClient, { path: formatRemoteUri(dir, "local") });
        } catch {
            failed++;
            continue;
        }
        signal.throwIfAborted();
        for (const entry of entries ?? []) {
            const name = entry.name;
            if (!name || name.startsWith(".") || /[\\/]/.test(name) || /^[Ll]/.test(entry.modestr ?? "")) continue;
            const path = dir + "/" + name;
            if (entry.isdir) {
                if (!ExcludedDirectories.has(name)) queue.push(path);
                continue;
            }
            if (!/\.pen$/i.test(name)) continue;
            found++;
            if (loaded.has(path)) continue;
            if (reads++ >= MaxDocumentsPerScan) return { found, failed, skipped, limited: true };
            try {
                if (entry.size > MaxDocumentBytes) throw new Error("Design file is too large.");
                const data = await RpcApi.FileReadCommand(TabRpcClient, {
                    info: { path: formatRemoteUri(path, "local") },
                    at: { offset: 0, size: MaxDocumentBytes + 1 },
                });
                signal.throwIfAborted();
                if ((data.data64?.length ?? 0) > Math.ceil(MaxDocumentBytes / 3) * 4)
                    throw new Error("Design file is too large.");
                const document = importPenLayers(base64ToString(data.data64 ?? ""));
                loaded.add(path);
                skipped += document.skipped;
                onDocument({ path, ...document });
            } catch {
                signal.throwIfAborted();
                failed++;
            }
        }
    }
    return { found, failed, skipped, limited: queue.length > 0 };
}
