// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { persistentAtom } from "@hermes/lib/persisted";
export type ComposerPosition = "top" | "bottom";
export const $composerPosition = persistentAtom<ComposerPosition>("hermes.desktop.composerPosition", "bottom", {
    decode: (raw) => (raw === "top" ? "top" : "bottom"),
    encode: (value) => value,
});

export const $hudComposerPosition = persistentAtom<ComposerPosition>("hermes.desktop.hudComposerPosition", "top", {
    decode: (raw) => (raw === "bottom" ? "bottom" : "top"),
    encode: (value) => value,
});

export function resolveHudComposerEdge(
    fallback: ComposerPosition,
    embedded: boolean,
    dockedChat: boolean,
    preference: ComposerPosition
): ComposerPosition {
    return embedded && !dockedChat ? preference : fallback;
}
