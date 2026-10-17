// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { ComposerAttachment } from "@hermes/store/composer";
import type { QuickEntrySubmitPayload } from "@hermes/store/quick-entry";

export async function deliverQuickEntryImages(
    payload: QuickEntrySubmitPayload,
    submit: (text: string, options: { attachments: ComposerAttachment[] }) => Promise<unknown> | unknown,
    restore: (text: string, attachments: ComposerAttachment[]) => void
): Promise<void> {
    const attachments: ComposerAttachment[] = payload.images.map((image) => ({
        id: crypto.randomUUID(),
        kind: "image",
        label: image.filename,
        path: image.filename,
        imageDataUrl: image.dataUrl,
    }));
    try {
        if ((await submit(payload.text, { attachments })) !== false) return;
    } catch {
        // Submission owns error presentation; keep the captured bytes available for retry.
    }
    restore(payload.text, attachments);
}
