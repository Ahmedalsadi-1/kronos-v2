// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { HermesSelection } from "../../../types/hermes-selection";

export const BrowserChatSelectionEvent = "kronos:stage-browser-selection";
export type BrowserChatSelectionRequest = {
    selection: HermesSelection;
    stage?: Promise<unknown>;
};

export async function stageBrowserSelectionInChat(selection: HermesSelection): Promise<void> {
    const detail: BrowserChatSelectionRequest = { selection };
    window.dispatchEvent(new CustomEvent(BrowserChatSelectionEvent, { detail }));
    if (detail.stage) {
        await detail.stage;
        return;
    }
    const [{ hermesSurfaceController }, composer] = await Promise.all([
        import("@/app/view/hermes/hermes-surface-controller"),
        import("@hermes/app/chat/composer/focus"),
    ]);
    const images = await Promise.all(
        (selection.images ?? []).map(
            async (image) =>
                new File([await (await fetch(image.dataUrl)).blob()], image.filename, { type: "image/png" })
        )
    );
    hermesSurfaceController.requestOpenChat();
    composer.requestComposerAttachImages(images);
    composer.requestComposerInsert(selection.text);
    composer.requestComposerFocus();
}
