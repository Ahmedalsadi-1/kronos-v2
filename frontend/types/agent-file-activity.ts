// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function filePathFromAgentInput(input?: Record<string, unknown>): string | undefined {
    for (const key of ["file_path", "filePath", "filepath", "path", "filename", "file"]) {
        const value = input?.[key];
        if (typeof value === "string" && value.trim() && !/[\r\n\0]/.test(value)) return value.trim();
    }
    const patch = input?.patch ?? input?.patch_text ?? input?.input;
    if (typeof patch !== "string") return;
    return patch.match(/^\*\*\* (?:Update|Add) File: (.+)$/m)?.[1]?.trim();
}

export function resolveAgentFilePath(file: string, root: string): string | undefined {
    if (!file || !root || /[\r\n\0]/.test(file) || /^[a-z]+:\/\//i.test(file)) return;
    const joined = file.startsWith("/") ? file : `${root}/${file}`;
    const segments: string[] = [];
    for (const segment of joined.split("/")) {
        if (!segment || segment === ".") continue;
        if (segment === "..") segments.pop();
        else segments.push(segment);
    }
    const resolved = `/${segments.join("/")}`;
    const base = root.replace(/\/$/, "");
    return resolved.startsWith(`${base}/`) || root === "/" ? resolved : undefined;
}
