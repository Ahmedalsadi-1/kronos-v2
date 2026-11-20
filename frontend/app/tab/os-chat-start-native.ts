// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

type NativeComposer = { insert?: (text: string) => void; send: (text: string) => unknown; attach?: () => void };
type NativeSlot = HTMLElement & { kronosControls?: NativeComposer };

export function nativeStartComposer(doc: Document): NativeComposer {
    const slots = [...doc.querySelectorAll<NativeSlot>("[data-kronos-pen-composer-controls]")];
    const slot =
        slots.find((node) => node.closest("[data-chat-fullscreen]") && node.kronosControls?.send) ??
        slots.find((node) => node.getClientRects().length && node.kronosControls?.send);
    if (!slot) throw new Error("Chat is still starting. Please try again in a moment.");
    return slot.kronosControls;
}

export function nativeStartCanvasButton(doc: Document): HTMLButtonElement {
    const button = [...doc.querySelectorAll<HTMLButtonElement>("button")].find(
        (node) => node.textContent.trim() === "Open canvas" || node.getAttribute("aria-label") === "Open canvas"
    );
    if (!button) throw new Error("Canvas is still starting. Please try again in a moment.");
    return button;
}

export async function nativeStartCanvasChat(doc: Document, text: string) {
    nativeStartCanvasButton(doc).click();
    const view = doc.defaultView;
    view.dispatchEvent(new Event("kronos:canvas-chat"));
    await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
    const slot = doc.querySelector<NativeSlot>("[data-agent-spotlight] [data-kronos-pen-composer-controls]");
    if (!slot?.kronosControls?.send) throw new Error("Canvas chat is still starting. Please try again in a moment.");
    await slot.kronosControls.send(text);
}

export function nativeStartTool(doc: Document, label: string, text: string) {
    const composer = nativeStartComposer(doc);
    if (text && !composer.insert) throw new Error("Chat cannot accept this draft yet. Please try again.");
    const button = [
        ...doc.querySelectorAll<HTMLButtonElement>(
            "[data-kronos-pen-island-bar] button, [data-chat-fullscreen] button"
        ),
    ].find(
        (node) =>
            node.getAttribute("aria-label") === label ||
            node.title === label ||
            node.getAttribute("aria-label")?.startsWith(label + " (")
    );
    if (label === "Attach files" && !composer.attach && !button) throw new Error("Attachments are not ready yet.");
    if (label === "Chat options") {
        if (text) composer.insert(text);
        return () =>
            doc
                .querySelector<HTMLElement>(
                    '[data-kronos-pen-island-bar] [contenteditable="true"], [data-chat-fullscreen] [contenteditable="true"]'
                )
                ?.focus();
    }
    if (button?.hidden) throw new Error(`${label} is currently unavailable.`);
    if (button?.disabled) throw new Error(`${label} is currently unavailable.`);
    if (label !== "Attach files" && !button) throw new Error(`${label} is not ready yet.`);
    if (text) composer.insert(text);
    return () => (label === "Attach files" && composer.attach ? composer.attach() : button.click());
}
