// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type NativeSurfaceSource = {
    id: string;
    name: string;
};

function normalizedNativeSurfaceName(value: string): string {
    return value
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function selectNativeSurfaceSource<T extends NativeSurfaceSource>(sources: T[], appName: string): T | undefined {
    const requestedName = normalizedNativeSurfaceName(appName);
    if (requestedName === "") return undefined;
    const exact = sources.find((source) => normalizedNativeSurfaceName(source.name) === requestedName);
    if (exact != null) return exact;
    const matching = sources.filter((source) => {
        const sourceName = normalizedNativeSurfaceName(source.name);
        return sourceName.length > 0 && sourceName.includes(requestedName);
    });
    if (matching.length === 1) return matching[0];
    return undefined;
}
