// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { init } from "react-grab/core";
import "react-grab/styles.css";
import type { ScreenSelectorPrompt } from "./screen-selector-toolbar";
import { installSelectorToolbarChrome, SelectorToolbarStyles } from "./selector-toolbar-chrome";

const channel = "kronterm:screen-selector";
const actions = {
    copy: ["select", "Select screen target"],
    comment: ["comment", "Comment on screen target"],
    edit: ["region", "Select screen region"],
} as const;

if (window.parent !== window) {
    // React Grab owns a single renderer per document. Each screen gets its own toolbar document.
    const send = (message: object) => {
        window.setTimeout(() => window.parent.postMessage({ channel, ...message }, "*"), 0);
    };
    let shadow: ShadowRoot;
    let frame = 0;
    let pointer: { x: number; y: number };
    let moved = false;
    let dragging = false;
    let prompt: ScreenSelectorPrompt;
    let anchor: HTMLElement;
    const labelSelector = "[data-react-grab-selection-label]";
    const inputSelector = 'textarea[aria-label="Add context for selected element"]';
    const measure = () => {
        frame = 0;
        if (dragging) return;
        const labels = prompt ? shadow?.querySelectorAll(labelSelector) : null;
        for (const label of labels ?? []) {
            const heading = label.querySelector("span");
            if (heading && heading.textContent !== prompt.label) heading.textContent = prompt.label;
        }
        const bounds = [
            ...(labels ?? shadow?.querySelectorAll("[data-react-grab-toolbar], [data-react-grab-toolbar-menu]") ?? []),
        ]
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => rect.width > 0 && rect.height > 0);
        if (!bounds.length) return;
        const margin = prompt ? 10 : 2;
        send({
            insets: [
                Math.min(...bounds.map((rect) => rect.top)) - margin,
                innerWidth - Math.max(...bounds.map((rect) => rect.right)) - margin,
                innerHeight - Math.max(...bounds.map((rect) => rect.bottom)) - margin,
                Math.min(...bounds.map((rect) => rect.left)) - margin,
            ],
        });
    };
    const scheduleMeasure = () => {
        if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(scheduleMeasure);
    installSelectorToolbarChrome(
        SelectorToolbarStyles +
            `
        :host-context([data-kronterm-screen-prompt]) [data-react-grab-toolbar] { display: none; }
    `,
        (slot) => {
            observer.disconnect();
            if (!slot) return;
            shadow = slot.getRootNode() as ShadowRoot;
            for (const [id, [, label]] of Object.entries(actions)) {
                shadow.querySelector(`[data-react-grab-toolbar-action="${id}"]`)?.setAttribute("aria-label", label);
            }
            observer.observe(shadow, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["style", "class"],
            });
            scheduleMeasure();
        }
    );
    addEventListener("resize", scheduleMeasure);
    addEventListener("message", (event) => {
        if (event.source !== window.parent || event.data?.channel !== channel) return;
        const next = event.data.prompt as ScreenSelectorPrompt;
        if (next && Number.isFinite(next.x) && Number.isFinite(next.y) && typeof next.label === "string") {
            if (prompt?.x === next.x && prompt?.y === next.y && prompt?.label === next.label) return;
            prompt = next;
            document.documentElement.setAttribute("data-kronterm-screen-prompt", "");
            document.documentElement.dataset.theme = "light";
            if (!anchor) {
                anchor = document.createElement("div");
                anchor.style.cssText = "position:absolute;width:2px;height:2px;";
                document.body.append(anchor);
            }
            const x = Math.max(1, Math.min(innerWidth - 2, innerWidth * prompt.x));
            const y = Math.max(1, Math.min(innerHeight - 2, innerHeight * prompt.y));
            anchor.style.left = `${x - 1}px`;
            anchor.style.top = `${y - 1}px`;
            api.deactivate();
            api.comment();
            const pointer = {
                clientX: x,
                clientY: y,
                pointerId: 1,
                isPrimary: true,
                pointerType: "mouse",
                bubbles: true,
                composed: true,
            };
            anchor.dispatchEvent(new PointerEvent("pointermove", pointer));
            anchor.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, buttons: 1 }));
            anchor.dispatchEvent(new PointerEvent("pointerup", pointer));
        }
        scheduleMeasure();
    });
    const finishPointer = () => {
        pointer = undefined;
        dragging = false;
        scheduleMeasure();
    };
    document.addEventListener(
        "pointerdown",
        (event) => {
            moved = false;
            if (
                !event
                    .composedPath()
                    .some(
                        (element) => element instanceof HTMLElement && element.hasAttribute("data-react-grab-toolbar")
                    )
            )
                return;
            pointer = { x: event.clientX, y: event.clientY };
            dragging = true;
            send({ insets: [0, 0, 0, 0] });
        },
        true
    );
    document.addEventListener(
        "pointermove",
        (event) => {
            if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 5) moved = true;
        },
        true
    );
    document.addEventListener("pointerup", finishPointer, true);
    document.addEventListener("pointercancel", finishPointer, true);
    addEventListener("blur", finishPointer);
    window.addEventListener(
        "click",
        (event) => {
            if (
                prompt &&
                event
                    .composedPath()
                    .some((item) => item instanceof HTMLElement && item.hasAttribute("data-react-grab-submit"))
            ) {
                submitComment(event);
                return;
            }
            const button = event
                .composedPath()
                .find(
                    (element): element is HTMLElement =>
                        element instanceof HTMLElement && element.hasAttribute("data-react-grab-toolbar-action")
                );
            const id = button?.dataset.reactGrabToolbarAction;
            if (id !== "copy" && id !== "comment" && id !== "edit") return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (moved && event.detail !== 0) return;
            const action = id === "copy" ? (api.getToolbarState()?.defaultAction ?? "copy") : id;
            send({ action: actions[action as keyof typeof actions]?.[0] ?? "select" });
        },
        true
    );
    const submitComment = (event: Event) => {
        const input = shadow?.querySelector<HTMLTextAreaElement>(inputSelector);
        const comment = input?.value.trim().slice(0, 2000);
        if (!comment) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        send({ comment });
    };
    window.addEventListener(
        "keydown",
        (event) => {
            if (!prompt || event.isComposing) return;
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                send({ cancelled: true });
            } else if (
                event.key === "Enter" &&
                !event.shiftKey &&
                event.composedPath()[0] === shadow?.querySelector(inputSelector)
            ) {
                submitComment(event);
            }
        },
        true
    );
    const api = init({ telemetry: false, freezeReactUpdates: false });
    api.setToolbarState({ enabled: true, collapsed: false, edge: "bottom", ratio: 0 });
}
