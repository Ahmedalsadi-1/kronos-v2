// @vitest-environment jsdom
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OSCanvasEntity } from "./os-canvas-entity";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function pointer(target: Element, type: string, pointerId = 1, button = 0, x = 10, y = 20) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    target.dispatchEvent(event);
}

describe("OS canvas object pointer ownership", () => {
    let host: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    let captures: WeakMap<HTMLElement, number>;
    const onSelect = vi.fn();
    const onMove = vi.fn();
    const onResize = vi.fn();
    const onDelete = vi.fn();
    const onTextChange = vi.fn();

    beforeEach(async () => {
        vi.clearAllMocks();
        captures = new WeakMap();
        Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
            configurable: true,
            value: vi.fn(function (id) {
                captures.set(this, id);
            }),
        });
        Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
            configurable: true,
            value: vi.fn(function (id) {
                return captures.get(this) === id;
            }),
        });
        Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
            configurable: true,
            value: vi.fn(function () {
                captures.delete(this);
            }),
        });
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
        await act(async () =>
            root.render(
                <OSCanvasEntity
                    object={{ id: "note", kind: "note", x: 30, y: 40, width: 260, height: 180, text: "Original" }}
                    selected
                    zIndex={1}
                    zoom={2}
                    onSelect={onSelect}
                    onMove={onMove}
                    onResize={onResize}
                    onDelete={onDelete}
                    onOpenResource={vi.fn()}
                    onTextChange={onTextChange}
                />
            )
        );
    });
    afterEach(async () => {
        await act(async () => root.unmount());
        host.remove();
        vi.restoreAllMocks();
    });

    it("leaves nested Delete to its click handler without capturing or dragging", async () => {
        const button = host.querySelector('[aria-label="Delete canvas object"]');
        await act(async () => {
            pointer(button, "pointerdown");
            pointer(button, "pointermove", 1, 0, 50, 60);
            pointer(button, "pointerup");
            (button as HTMLButtonElement).click();
        });
        expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
        expect(onMove).not.toHaveBeenCalled();
        expect(onDelete).toHaveBeenCalledExactlyOnceWith("note");
    });

    it("moves keyboard focus from widget text to the selected canvas note", async () => {
        const widgetInput = document.createElement("input");
        document.body.append(widgetInput);
        widgetInput.focus();
        await act(async () => pointer(host.querySelector("p"), "pointerdown"));
        expect(document.activeElement).toBe(host.querySelector("article"));
        widgetInput.remove();
    });

    it("rejects nonprimary handles and ignores another pointer during a zoomed drag", async () => {
        const handle = host.querySelector(".os-canvas-object-handle");
        await act(async () => {
            pointer(handle, "pointerdown", 1, 2);
            pointer(handle, "pointermove", 1, 2, 70, 80);
        });
        expect(onMove).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
        await act(async () => {
            pointer(handle, "pointerdown");
            pointer(handle, "pointerdown", 2, 0, 50, 60);
            pointer(handle, "pointermove", 2, 0, 50, 60);
        });
        expect(onMove).not.toHaveBeenCalled();
        await act(async () => pointer(handle, "pointermove", 1, 0, 50, 60));
        expect(onMove).toHaveBeenCalledExactlyOnceWith("note", 50, 60);
        await act(async () => {
            pointer(handle, "pointercancel");
            pointer(handle, "pointermove", 1, 0, 90, 100);
            pointer(handle, "pointerup");
        });
        expect(onMove).toHaveBeenCalledTimes(1);
        expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalledTimes(1);
    });

    it("cancels resize on capture loss and never releases uncaptured pointers", async () => {
        const resize = host.querySelector('[aria-label="Resize canvas object"]');
        await act(async () => {
            pointer(resize, "pointerdown");
            pointer(resize, "pointermove", 1, 0, 50, 60);
            pointer(resize, "lostpointercapture");
            pointer(resize, "pointermove", 1, 0, 90, 100);
            pointer(resize, "pointerup");
        });
        expect(onResize).toHaveBeenCalledExactlyOnceWith("note", 280, 200);
        expect(HTMLElement.prototype.releasePointerCapture).toHaveBeenCalledTimes(1);
    });
    it("focuses the note editor and cancels without deleting or dragging", async () => {
        await act(async () => host.querySelector("p").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
        const editor = host.querySelector<HTMLTextAreaElement>('[aria-label="Note text"]');
        expect(editor).not.toBeNull();
        expect(document.activeElement).toBe(editor);
        await act(async () => {
            pointer(editor, "pointerdown");
            editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        });
        expect(host.querySelector("textarea")).toBeNull();
        expect(onMove).not.toHaveBeenCalled();
        expect(onDelete).not.toHaveBeenCalled();
        expect(onTextChange).not.toHaveBeenCalled();
    });
});
