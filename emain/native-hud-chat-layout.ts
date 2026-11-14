// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { coucouChatBounds, coucouRecoveryChatBounds, type CoucouHudEvent } from "./coucou-hud";

type ChatLayoutHost = {
    setIntent: (open: boolean) => void;
    hide: () => void;
    present: (bounds: Electron.Rectangle, measured: boolean) => void;
    previewBounds: () => Electron.Rectangle;
};

export class NativeHudChatLayout {
    phase: "closed" | "measuring" | "visible" | "fallback" = "closed";
    revision = -1;
    timer: ReturnType<typeof setTimeout>;

    constructor(private host: ChatLayoutHost) {}

    apply(event: CoucouHudEvent): void {
        if (event.layoutRevision <= this.revision) return;
        this.cancel();
        this.revision = event.layoutRevision;
        this.host.setIntent(event.chatIntent);
        if (!event.chatIntent) {
            this.phase = "closed";
            this.host.hide();
            return;
        }
        if (event.layoutReady) {
            this.phase = "visible";
            this.host.present(coucouChatBounds(event), true);
            return;
        }
        this.phase = "measuring";
        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.phase = "fallback";
            this.host.present(
                event.compactChat
                    ? coucouChatBounds(event)
                    : coucouRecoveryChatBounds(event, this.host.previewBounds()),
                false
            );
        }, 1_000);
    }

    cancel(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
    }
}
