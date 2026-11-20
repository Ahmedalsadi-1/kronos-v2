// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

interface PreviewSaveOptions {
    baseline: string;
    draft: string;
    force?: boolean;
    read: () => Promise<{ binary?: boolean; text?: string }>;
    write: (text: string) => Promise<unknown>;
}

export async function savePreviewDraft({
    baseline,
    draft,
    force,
    read,
    write,
}: PreviewSaveOptions): Promise<"saved" | "conflict"> {
    if (!force) {
        const current = await read();
        if (current.binary) {
            throw new Error("The file is no longer text. Your draft has not been saved.");
        }
        if (current.text == null) {
            throw new Error("Could not verify the current file contents. Your draft has not been saved.");
        }
        if (current.text !== baseline) {
            return "conflict";
        }
    }
    await write(draft);
    return "saved";
}
