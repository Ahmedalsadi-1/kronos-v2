// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type VideoCaption = { id: string; start: number; end: number; text: string };
export type VideoProject = {
    version: 1;
    source: string;
    duration: number;
    trimStart: number;
    trimEnd: number;
    captions: VideoCaption[];
};

function isLocalVideoPath(path: unknown): path is string {
    return typeof path === "string" && !path.includes("\0") && /^(?:\/|[a-z]:[\\/]|\\\\[^\\])/i.test(path);
}

export function isVideoStudioSource(path: unknown): path is string {
    return isLocalVideoPath(path) && /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(path);
}

export function normalizeVideoProject(value: unknown): VideoProject {
    const candidate = value as Partial<VideoProject>;
    const duration =
        typeof candidate?.duration === "number" && Number.isFinite(candidate.duration)
            ? Math.max(0, candidate.duration)
            : 0;
    const clamp = (number: unknown, fallback: number) =>
        typeof number === "number" && Number.isFinite(number) ? Math.min(duration, Math.max(0, number)) : fallback;
    const trimStart = clamp(candidate?.trimStart, 0);
    const trimEnd = Math.max(trimStart, clamp(candidate?.trimEnd, duration));
    return {
        version: 1,
        source: isLocalVideoPath(candidate?.source) ? candidate.source : "",
        duration,
        trimStart,
        trimEnd,
        captions: Array.isArray(candidate?.captions)
            ? candidate.captions
                  .filter(
                      (caption) =>
                          caption &&
                          typeof caption.id === "string" &&
                          typeof caption.text === "string" &&
                          Number.isFinite(caption.start) &&
                          Number.isFinite(caption.end) &&
                          caption.end > caption.start &&
                          caption.start >= 0
                  )
                  .map((caption) => ({ id: caption.id, text: caption.text, start: caption.start, end: caption.end }))
            : [],
    };
}

export function captionsAtTime(project: VideoProject, time: number): VideoCaption[] {
    return project.captions.filter((caption) => time >= caption.start && time < caption.end);
}

function subtitleTime(seconds: number): string {
    const milliseconds = Math.round(seconds * 1000);
    const padded = (value: number, length = 2) => String(value).padStart(length, "0");
    return `${padded(Math.floor(milliseconds / 3600000))}:${padded(Math.floor(milliseconds / 60000) % 60)}:${padded(Math.floor(milliseconds / 1000) % 60)},${padded(milliseconds % 1000, 3)}`;
}

export function exportTrimmedSubtitles(project: VideoProject): string {
    return project.captions
        .map((caption) => ({
            ...caption,
            start: Math.max(project.trimStart, caption.start),
            end: Math.min(project.trimEnd, caption.end),
        }))
        .filter((caption) => caption.end > caption.start)
        .sort((a, b) => a.start - b.start)
        .map(
            (caption, index) =>
                `${index + 1}\n${subtitleTime(caption.start - project.trimStart)} --> ${subtitleTime(caption.end - project.trimStart)}\n${caption.text}\n`
        )
        .join("\n");
}
