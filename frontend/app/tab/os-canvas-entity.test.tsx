// @vitest-environment jsdom
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { stringToBase64 } from "@/util/util";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OSCanvasEntity } from "./os-canvas-entity";
import { readNativeCanvasFiles } from "./workspace-canvas-files";

vi.mock("@/util/endpoints", () => ({ getWebServerEndpoint: () => "http://localhost:1234" }));

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

    const renderFile = (path: string, onOpenResource = vi.fn(), localFile?: File) =>
        act(async () =>
            root.render(
                <OSCanvasEntity
                    object={{ id: path, kind: "file", x: 30, y: 40, width: 260, height: 180, resource: path }}
                    selected
                    zIndex={1}
                    zoom={2}
                    onSelect={onSelect}
                    onMove={onMove}
                    onResize={onResize}
                    onDelete={onDelete}
                    onOpenResource={onOpenResource}
                    localFile={localFile}
                />
            )
        );

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
        vi.unstubAllGlobals();
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

    it.each([
        ["video", "mp4", "video/mp4"],
        ["audio", "mp3", "audio/mpeg"],
    ])("keeps pinned %s playback controls on the canvas", async (kind, extension, mimetype) => {
        const path = `/media/sample & one.${extension}`;
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path, mimetype });
        const onOpenResource = vi.fn();
        await renderFile(path, onOpenResource);
        const media = host.querySelector<HTMLMediaElement>(kind);
        expect(media.controls).toBe(true);
        expect(media.autoplay).toBe(false);
        expect(new URL(media.src).searchParams.get("path")).toBe(`wsh://local/${path}`);
        await act(async () => {
            media.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
            media.dispatchEvent(new Event("error"));
        });
        expect(onOpenResource).not.toHaveBeenCalled();
        expect(host.querySelector('[role="status"]').textContent).toBe(
            kind === "video" ? "Video unavailable" : "Audio unavailable"
        );
        await act(async () => host.querySelector<HTMLButtonElement>(".os-canvas-reference").click());
        expect(onOpenResource).toHaveBeenCalledOnce();
    });

    it("pins original native paths once and skips files without a local backing path", () => {
        const clip = new File([], "clip.mp4");
        const drawing = new File([], "drawing.svg");
        const synthetic = new File([], "notes.txt");
        const files = [clip, synthetic, clip, drawing];
        const paths = new Map([
            [clip, "/media/clip.mp4"],
            [drawing, "C:\\media\\drawing.svg"],
            [synthetic, "notes.txt"],
        ]);
        expect(readNativeCanvasFiles(files, (file) => paths.get(file))).toEqual([
            { id: "local:/media/clip.mp4", kind: "file", name: "clip.mp4", resource: "/media/clip.mp4" },
            { id: "local:C:\\media\\drawing.svg", kind: "file", name: "drawing.svg", resource: "C:\\media\\drawing.svg" },
        ]);
    });

    it("previews a newly dropped video before contacting the file service and releases its object URL", async () => {
        const createObjectURL = vi.fn(() => "blob:http://localhost/dropped-video");
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("URL", class extends URL {
            static createObjectURL = createObjectURL;
            static revokeObjectURL = revokeObjectURL;
        });
        const stat = vi.spyOn(RpcApi, "FileInfoCommand");
        const file = new File([], "clip.mp4", { type: "video/mp4" });

        await renderFile("/media/clip.mp4", vi.fn(), file);
        expect(host.querySelector("video")?.src).toBe("blob:http://localhost/dropped-video");
        expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(file);
        expect(stat).not.toHaveBeenCalled();

        await act(async () => root.render(null));
        expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:http://localhost/dropped-video");
    });

    it("shows the contents of a pinned Markdown file and keeps its open action", async () => {
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path: "/assignment.md", mimetype: "text/markdown" });
        const read = vi.spyOn(RpcApi, "FileReadCommand").mockResolvedValue({
            data64: stringToBase64(
                "# Assignment\n\n[See plan](https://example.com)\n\n![Tracking](https://example.com/image.png)"
            ),
        });
        const open = vi.fn();
        await renderFile("/assignment.md", open);
        expect(host.querySelector("h1")?.textContent).toBe("Assignment");
        expect(host.textContent).toContain("See plan");
        expect(host.querySelector(".os-canvas-file-preview a, .os-canvas-file-preview img")).toBeNull();
        expect(read.mock.calls[0]?.[1]).toEqual({
            info: { path: "wsh://local//assignment.md" },
            at: { offset: 0, size: 8192 },
        });
        host.querySelector<HTMLButtonElement>('[title="Open /assignment.md"]').click();
        expect(open).toHaveBeenCalledOnce();
    });

    it("streams image contents and shows a fallback when the image fails to load", async () => {
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({
            path: "/diagram.png",
            name: "diagram.png",
            mimetype: "image/png",
        });
        const read = vi.spyOn(RpcApi, "FileReadCommand");
        await renderFile("/diagram.png");
        const img = host.querySelector("img");
        expect(img?.alt).toBe("diagram.png");
        expect(new URL(img.src).searchParams.get("path")).toBe("wsh://local//diagram.png");
        expect(read).not.toHaveBeenCalled();
        await act(async () => img.dispatchEvent(new Event("error")));
        expect(host.textContent).toContain("Image unavailable");
    });
});
