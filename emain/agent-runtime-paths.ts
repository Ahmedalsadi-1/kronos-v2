// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

function existingExecutable(candidate: string | undefined): string | undefined {
    if (!candidate) {
        return undefined;
    }
    try {
        if (!fs.statSync(candidate).isFile()) {
            return undefined;
        }
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
    } catch {
        return undefined;
    }
}

export function resolveAgentWsh(
    options: {
        cwd?: string;
        resourcesPath?: string;
        platform?: string;
        arch?: string;
        configured?: string;
    } = {}
): string {
    const cwd = options.cwd ?? process.cwd();
    const platform = options.platform ?? process.platform;
    const arch = options.arch ?? process.arch;
    const resourcesPath =
        options.resourcesPath ?? (process as typeof process & { resourcesPath?: string }).resourcesPath;
    const filename = platform === "win32" ? "wsh.exe" : "wsh";
    const binDirs = [
        resourcesPath ? path.join(resourcesPath, "app.asar.unpacked", "dist", "bin") : undefined,
        resourcesPath ? path.join(resourcesPath, "bin") : undefined,
        path.join(cwd, "dist", "bin"),
        path.resolve(import.meta.dirname, "..", "bin"),
    ].filter(Boolean);
    const platformSuffix = `${platform === "win32" ? "windows" : platform}.${arch}${platform === "win32" ? ".exe" : ""}`;
    const candidates = [
        options.configured ?? process.env.KRONTERM_WSH ?? process.env.WAVETERM_WSH ?? process.env.WAVETERM_WSH_BIN,
        path.join(cwd, filename),
        ...binDirs.flatMap((directory) => {
            const names = fs.existsSync(directory) ? fs.readdirSync(directory).sort().reverse() : [];
            return [
                path.join(directory, filename),
                ...names
                    .filter((name) => name.startsWith("wsh-") && name.endsWith(platformSuffix))
                    .map((name) => path.join(directory, name)),
            ];
        }),
        ...(process.env.PATH ?? "")
            .split(path.delimiter)
            .filter(Boolean)
            .map((directory) => path.join(directory, filename)),
    ];
    const resolved = candidates.find(existingExecutable);
    if (!resolved) {
        throw new Error("KronOS's wsh executable is missing. Rebuild or reinstall KronOS, or set KRONTERM_WSH.");
    }
    return path.resolve(resolved);
}
