// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type NotchExplorerEntry = { path: string; name: string; directory: boolean; depth: number; expanded: boolean };
export type NotchExplorerState = {
    blockId: string;
    root: string;
    selected: string;
    entries: NotchExplorerEntry[];
    error: string;
};
export type NotchAgent = { id: string; name: string; backend: string; detail: string; phase: string; blockId?: string };

export function terminalAgentBackend(command: string): string | undefined {
    const match = String(command ?? "")
        .trim()
        .match(
            /^(?:env\s+)?(?:[A-Z_][A-Z_0-9]*=\S+\s+)*(?:\S*\/)?(opencode|claude|hermes|codex|gemini|kronoscode)(?:\s|$)/i
        );
    return match?.[1].toLowerCase();
}

export function validateNotchExplorer(value: unknown, blockId: string): NotchExplorerState | undefined {
    if (!value || typeof value !== "object") return;
    const state = value as NotchExplorerState;
    if (
        state.blockId !== blockId ||
        !Array.isArray(state.entries) ||
        ![state.root, state.selected, state.error].every((v) => typeof v === "string" && v.length <= 4096)
    )
        return;
    const entries = state.entries
        .slice(0, 300)
        .filter(
            (row) =>
                row &&
                [row.path, row.name].every((v) => typeof v === "string" && v.length > 0 && v.length <= 4096) &&
                typeof row.directory === "boolean" &&
                typeof row.expanded === "boolean" &&
                Number.isInteger(row.depth) &&
                row.depth >= 0 &&
                row.depth <= 12
        );
    return { blockId, root: state.root, selected: state.selected, error: state.error, entries };
}
