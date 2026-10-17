import { getApi } from "@/store/global";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Lets KronTerm system UI (desktop Kronos card, suggestion chips) send a prompt into
// the Hermes chat. Hermes already routes Quick Entry submits through its normal prompt
// pipeline, so this feeds that channel. Prompts sent before Hermes mounts are queued
// and delivered when its bridge subscribes.

export type HermesQuickSubmitImage = { filename: string; dataUrl: string };
export type HermesQuickSubmit = { target: "new" | "current"; text: string; images?: HermesQuickSubmitImage[] };

type Listener = (payload: HermesQuickSubmit) => void;

const listeners = new Set<Listener>();
const pending: HermesQuickSubmit[] = [];
const MaxPending = 4;
let unsubscribeContext: (() => void) | null = null;

export function submitToHermes(
    text: string,
    target: HermesQuickSubmit["target"] = "new",
    images?: HermesQuickSubmitImage[]
): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    const payload: HermesQuickSubmit = {
        target,
        text: trimmed,
        ...(images?.length ? { images: images.map((image) => ({ ...image })) } : {}),
    };
    if (listeners.size === 0) {
        pending.push(payload);
        pending.splice(0, Math.max(0, pending.length - MaxPending));
        return;
    }
    // Several Hermes surfaces can be mounted at once (panel, HUD); one prompt must
    // start exactly one turn, so only the most recently mounted surface receives it.
    [...listeners][listeners.size - 1](payload);
}

export function subscribeHermesQuickSubmit(listener: Listener): () => void {
    listeners.add(listener);
    if (!unsubscribeContext && new URLSearchParams(window.location.search).get("nativeSurface") === "hud") {
        const offContext = getApi().onHermesContext?.((text) => submitToHermes(text, "current"));
        const offSelection = getApi().onHermesSelection?.((payload) =>
            submitToHermes(payload.text, payload.target, payload.images)
        );
        unsubscribeContext = () => {
            offContext?.();
            offSelection?.();
        };
    }
    const queued = pending.splice(0, pending.length);
    // Deliver after the subscriber finishes wiring its own handler.
    if (queued.length > 0) {
        window.setTimeout(
            () => queued.forEach((payload) => submitToHermes(payload.text, payload.target, payload.images)),
            0
        );
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            unsubscribeContext?.();
            unsubscribeContext = null;
        }
    };
}
