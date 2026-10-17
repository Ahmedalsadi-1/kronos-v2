// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const Extensions: Record<string, string[]> = {
    image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic", "tif", "tiff", "bmp"],
    video: ["mp4", "mov", "mkv", "webm", "avi", "m4v"],
    audio: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "aiff"],
    "3d": ["blend", "glb", "gltf", "obj", "fbx", "stl", "usd", "usdz"],
    document: ["pdf", "docx", "pptx", "odt", "odp"],
};

export function classifyMedia(entry: Pick<FileInfo, "path" | "mimetype" | "isdir">): string {
    if (entry.isdir) return "folder";
    const mime = entry.mimetype?.split("/")[0];
    if (["image", "video", "audio"].includes(mime)) return mime;
    const extension = entry.path.split(".").pop()?.toLowerCase();
    return Object.keys(Extensions).find((kind) => Extensions[kind].includes(extension)) ?? "other";
}

export function filterMedia(entries: FileInfo[], query: string, category: string): FileInfo[] {
    const search = query.trim().toLocaleLowerCase();
    return entries
        .filter((entry) => {
            const kind = classifyMedia(entry);
            return (
                kind !== "other" &&
                (kind === "folder" || category === "all" || category === kind) &&
                `${entry.name ?? ""} ${entry.path}`.toLocaleLowerCase().includes(search)
            );
        })
        .sort(
            (a, b) =>
                Number(Boolean(b.isdir)) - Number(Boolean(a.isdir)) ||
                (a.name ?? a.path).localeCompare(b.name ?? b.path)
        );
}
