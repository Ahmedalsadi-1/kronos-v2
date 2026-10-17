// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function hudLocationForMeta(meta: Record<string, unknown>, blockId: string): string {
    const view = String(meta?.view ?? "");
    const value =
        view === "web" || view === "webview"
            ? meta.url
            : view === "term"
              ? (meta["cmd:cwd"] ?? meta["term:cwd"])
              : view === "sandbox"
                ? (meta["sandbox:name"] ?? meta["sandbox:browserurl"] ?? `Sandbox ${blockId.slice(0, 8)}`)
                : ["file", "preview", "codeeditor", "aifilediff", "diff"].includes(view)
                  ? meta.file
                  : undefined;
    return typeof value === "string" ? value : "";
}
