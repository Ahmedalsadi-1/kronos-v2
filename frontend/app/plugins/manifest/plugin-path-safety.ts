// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Adapted from stablyai/orca src/shared/plugins/plugin-path-safety.ts and plugin-id-format.ts
// (MIT, Copyright (c) 2026 Lovecast Inc.). See THIRD_PARTY_NOTICES.md.

// Windows normalizes these names even when the host doing validation does not.
const WindowsDeviceNameRe = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const WindowsForbiddenCharRe = /[<>:"|?*]/;
const PluginIdRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DangerousPluginNames = new Set(["__proto__", "prototype", "constructor"]);
// Reserved so no third-party package can impersonate built-in or legacy product identity.
const ReservedPublishers = new Set(["kronterm", "builtin", "wave", "waveterm", "hermes", "kronoscode"]);

const PluginIdMaxLength = 64;

function isSafePluginId(id: string): boolean {
    return (
        typeof id === "string" && id.length <= PluginIdMaxLength && PluginIdRe.test(id) && !DangerousPluginNames.has(id)
    );
}

function isReservedPublisher(publisher: string): boolean {
    return ReservedPublishers.has(publisher);
}

function pluginPathSegmentError(segment: string): string {
    if (segment.length === 0 || segment === "." || segment === "..") {
        return "empty and dot path segments are not allowed";
    }
    if (segment.endsWith(".") || segment.endsWith(" ")) {
        return "path segments may not end with a dot or space";
    }
    if (WindowsForbiddenCharRe.test(segment) || [...segment].some((ch) => ch.charCodeAt(0) <= 31)) {
        return "path segment contains a Windows-forbidden character or alternate-data-stream colon";
    }
    if (WindowsDeviceNameRe.test(segment)) {
        return "path segment is a Windows reserved device name";
    }
    return null;
}

function pluginRelativePathError(value: string): string {
    if (value.length === 0 || value.startsWith("/") || value.startsWith("\\")) {
        return "must be a non-empty relative path";
    }
    for (const segment of value.split(/[\\/]/)) {
        const error = pluginPathSegmentError(segment);
        if (error != null) {
            return error;
        }
    }
    return null;
}

function isSafePluginRelativePath(value: string): boolean {
    return pluginRelativePathError(value) == null;
}

export {
    PluginIdMaxLength,
    ReservedPublishers,
    isReservedPublisher,
    isSafePluginId,
    isSafePluginRelativePath,
    pluginPathSegmentError,
    pluginRelativePathError,
};
