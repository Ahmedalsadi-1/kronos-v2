// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
export type CaptionRow = { id: string; start: number; end: number; text: string };
export function captionTimestamp(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 359999.999)
        throw new Error("Caption time must be between 0 and 359999.999 seconds.");
    const ms = Math.round(seconds * 1000);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function validateCaptions(input: unknown): CaptionRow[] {
    if (!Array.isArray(input) || input.length > 10000) throw new Error("Use a caption list with at most 10000 rows.");
    if (JSON.stringify(input).length > 2_000_000) throw new Error("Caption project exceeds 2 MB.");
    const ids = new Set<string>();
    for (const row of input) {
        if (
            !row ||
            typeof row.id !== "string" ||
            !row.id ||
            ids.has(row.id) ||
            typeof row.text !== "string" ||
            !row.text.trim() ||
            !Number.isFinite(row.start) ||
            !Number.isFinite(row.end) ||
            row.start < 0 ||
            row.end <= row.start ||
            row.end > 359999.999
        )
            throw new Error("Every caption needs a unique ID, text and an end time after its start.");
        ids.add(row.id);
    }
    return structuredClone(input);
}
export function captionsToSrt(rows: CaptionRow[]): string {
    return (
        validateCaptions(rows)
            .slice()
            .sort((a, b) => a.start - b.start)
            .map(
                (row, index) =>
                    `${index + 1}\n${captionTimestamp(row.start)} --> ${captionTimestamp(row.end)}\n${row.text.replace(/\r/g, "").trim()}`
            )
            .join("\n\n") + "\n"
    );
}
function parseTime(input: string): number {
    const match = /^(\d{2,3}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(input);
    if (!match || Number(match[2]) > 59 || Number(match[3]) > 59)
        throw new Error(`Invalid caption timestamp: ${input}`);
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}
export function captionsFromSrt(text: string): CaptionRow[] {
    if (text.length > 2_000_000) throw new Error("SRT file exceeds 2 MB.");
    const normalized = text
        .replace(/^\uFEFF/, "")
        .replace(/\r\n?/g, "\n")
        .trim();
    if (!normalized) return [];
    const rows = normalized.split(/\n[ \t]*\n/).map((block, index) => {
        const lines = block.split("\n");
        if (/^\d+$/.test(lines[0].trim())) lines.shift();
        const timing = /^(\S+)\s+-->\s+(\S+)$/.exec(lines.shift()?.trim() ?? "");
        if (!timing || !lines.length) throw new Error(`Invalid SRT caption ${index + 1}.`);
        return {
            id: `import-${index}`,
            start: parseTime(timing[1]),
            end: parseTime(timing[2]),
            text: lines.join("\n"),
        };
    });
    return validateCaptions(rows);
}
