// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

export function reusableTerminal(blocks: Array<Record<string, any>>, cwd?: string): string | undefined {
    const candidates = blocks.filter((block) => {
        const meta = block.meta ?? {};
        return (
            (block.view ?? meta.view) === "term" &&
            meta.controller === "shell" &&
            !meta.connection &&
            !meta["cmd"] &&
            (!cwd || meta["cmd:cwd"] === cwd)
        );
    });
    const match = candidates.find((block) => block.focused) ?? candidates[0];
    return match?.blockid ?? match?.blockId;
}
