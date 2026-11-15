// @vitest-environment jsdom
// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { stringToBase64 } from "@/util/util";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OSCanvasEntity } from "./os-canvas-entity";
import { CanvasTextEditor } from "./os-canvas-text-editor";
import {
    allowCanvasDrop,
    isCanvasPasteTarget,
    persistCanvasFile,
    readCanvasTransfer,
    readNativeCanvasFiles,
} from "./workspace-canvas-files";

vi.mock("@/util/endpoints", () => ({ getWebServerEndpoint: () => "http://localhost:1234" }));

vi.mock("@/app/monaco/monaco-react", () => ({
    MonacoCodeEditor: ({ text, onChange }: { text: string; onChange: (text: string) => void }) => (
        <button type="button" data-editor-text={text} onClick={() => onChange("const count = 2;")}>
            Change editor draft
        </button>
    ),
}));

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

    const renderFile = (
        path: string,
        onOpenResource = vi.fn(),
        localFile?: File,
        onOpenCanvasEntry?: ReturnType<typeof vi.fn>,
        browseFolderOnClick = false
    ) =>
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
                    onOpenCanvasEntry={onOpenCanvasEntry}
                    browseFolderOnClick={browseFolderOnClick}
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

    it("enlarges a selected file from its floating toolbar and resizes from the top left", async () => {
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path: "/sample.txt", mimetype: "text/plain" });
        vi.spyOn(RpcApi, "FileReadCommand").mockResolvedValue({ data64: stringToBase64("Sample") });
        await renderFile("/sample.txt");
        const toolbar = host.querySelector('[aria-label="Canvas file controls"]');
        await act(async () => {
            pointer(toolbar.querySelector("span"), "pointerdown", 1, 0, 20, 10);
            pointer(toolbar, "pointermove", 1, 0, 60, 30);
            pointer(toolbar, "pointerup");
        });
        expect(onMove).toHaveBeenCalledWith("/sample.txt", 50, 50);
        await act(async () => toolbar.querySelector<HTMLButtonElement>('[aria-label="Expand"]').click());
        expect(onResize).toHaveBeenCalledWith("/sample.txt", 325, 225);
        await act(async () => toolbar.querySelector<HTMLButtonElement>('[aria-label="Minimize"]').click());
        expect(host.querySelector(".is-canvas-file-minimized")).toBeTruthy();
        await act(async () =>
            toolbar.querySelector<HTMLButtonElement>('[aria-label="Restore minimized file"]').click()
        );
        expect(host.querySelector(".is-canvas-file-minimized")).toBeNull();
        const corner = host.querySelector('[aria-label="Resize from top left"]');
        await act(async () => {
            pointer(corner, "pointerdown", 1, 0, 40, 40);
            pointer(corner, "pointermove", 1, 0, 0, 20);
            pointer(corner, "pointerup");
        });
        expect(onResize).toHaveBeenLastCalledWith("/sample.txt", 280, 190, { x: 10, y: 30 });
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
            {
                id: "local:C:\\media\\drawing.svg",
                kind: "file",
                name: "drawing.svg",
                resource: "C:\\media\\drawing.svg",
            },
        ]);
    });

    it("previews a newly dropped video before contacting the file service and releases its object URL", async () => {
        const createObjectURL = vi.fn(() => "blob:http://localhost/dropped-video");
        const revokeObjectURL = vi.fn();
        vi.stubGlobal(
            "URL",
            class extends URL {
                static createObjectURL = createObjectURL;
                static revokeObjectURL = revokeObjectURL;
            }
        );
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

    it("renders a local HTML document in a sandbox and opens a larger preview", async () => {
        const showModal = vi.fn();
        const proto = HTMLDialogElement.prototype;
        Object.defineProperty(proto, "showModal", { configurable: true, value: showModal });
        const path = "/index.html";
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path, mimetype: "text/html" });
        vi.spyOn(RpcApi, "FileReadCommand").mockResolvedValue({
            data64: stringToBase64(
                '<html><head><style>h1 { color: purple }</style><meta http-equiv="refresh" content="0;url=https://example.com"></head><body><h1>Preview</h1><script>alert(1)</script><a href="https://example.com">Link</a></body></html>'
            ),
        });
        await renderFile(path);
        const frame = host.querySelector("iframe");
        expect(frame.getAttribute("sandbox")).toBe("");
        expect(frame.srcdoc).toContain("<h1>Preview</h1>");
        expect(frame.srcdoc).toContain("color: purple");
        expect(frame.srcdoc).toContain("Content-Security-Policy");
        expect(frame.srcdoc).not.toMatch(/<script|http-equiv="refresh"|href=/);
        const button = [...host.querySelectorAll("button")].find((node) => node.textContent === "Open HTML");
        await act(async () => button.click());
        expect(showModal).toHaveBeenCalledOnce();
        expect(host.querySelector<HTMLIFrameElement>("dialog iframe").srcdoc).toBe(frame.srcdoc);
        delete proto.showModal;
    });

    it("renders a directory with folder artwork and opens it as a folder", async () => {
        const path = "/projects/sample.png";
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path, isdir: true, name: "sample.png" });
        const onOpen = vi.fn();
        await renderFile(path, onOpen);
        const folder = host.querySelector<HTMLButtonElement>(".canvas-folder-preview");
        expect(folder.querySelector(".canvas-folder-art")).toBeTruthy();
        expect(host.querySelector("img")).toBeNull();
        await act(async () => folder.click());
        expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ kind: "folder", resource: path }));
    });

    it("opens a KronOS v2 folder on activation and leaves it closed on hover or focus", async () => {
        const path = "/project";
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path, name: "Project", isdir: true });
        const list = vi.spyOn(RpcApi, "FileListCommand").mockResolvedValue([]);
        const open = vi.fn();
        await renderFile(path, open, undefined, undefined, true);
        const folder = host.querySelector<HTMLButtonElement>(".canvas-folder-preview");
        await act(async () => {
            folder.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
            folder.focus();
        });
        expect(list).not.toHaveBeenCalled();
        expect(folder.getAttribute("aria-expanded")).toBe("false");
        await act(async () => folder.click());
        expect(list).toHaveBeenCalledOnce();
        expect(folder.getAttribute("aria-expanded")).toBe("true");
        await act(async () => folder.click());
        expect(folder.getAttribute("aria-expanded")).toBe("false");
        expect(open).not.toHaveBeenCalled();
    });

    it("drags the folder icon at canvas zoom without opening it", async () => {
        const path = "/project";
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path, name: "Project", isdir: true });
        vi.spyOn(RpcApi, "FileListCommand").mockResolvedValue([]);
        const open = vi.fn();
        await renderFile(path, open);
        const folder = host.querySelector(".canvas-folder-preview");
        await act(async () => {
            pointer(folder, "pointerdown", 1, 0, 10, 20);
            pointer(folder, "pointermove", 1, 0, 11, 21);
            expect(onMove).not.toHaveBeenCalled();
            pointer(folder, "pointermove", 1, 0, 50, 80);
            pointer(folder, "pointerup", 1, 0, 50, 80);
            folder.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
        });
        expect(onMove).toHaveBeenCalledExactlyOnceWith(path, 50, 70);
        expect(open).not.toHaveBeenCalled();
    });

    it("browses nested folders and previews a selected file from the folder icon", async () => {
        const path = "/project";
        vi.spyOn(RpcApi, "FileInfoCommand").mockImplementation(async (_client, { info }) =>
            info.path.endsWith(".png")
                ? { path: info.path, mimetype: "image/png" }
                : { path, name: "project", isdir: true }
        );
        const list = vi
            .spyOn(RpcApi, "FileListCommand")
            .mockImplementation(async (_client, { path }) =>
                path.endsWith("/assets")
                    ? [{ path: "/project/assets/photo.png", name: "photo.png" }]
                    : [{ path: "/project/assets", name: "assets", isdir: true }]
            );
        const open = vi.fn();
        const openOnCanvas = vi.fn();
        await renderFile(path, open, undefined, openOnCanvas);
        const icon = host.querySelector<HTMLButtonElement>(".canvas-folder-preview");
        vi.spyOn(icon, "getBoundingClientRect").mockReturnValue(new DOMRect(260, 470, 180, 150));
        await act(async () => icon.focus());
        expect(list.mock.calls[0][1]).toEqual({ path: "wsh://local//project" });
        const panel = document.querySelector<HTMLElement>(".canvas-folder-browser");
        expect(panel.dataset.fanDirection).toBe("up");
        expect(panel.style.bottom).toBe(`${window.innerHeight - 470}px`);
        const click = async (label: string) =>
            act(async () => {
                const button = [...panel.querySelectorAll("button")].find(
                    (button) => button.textContent.trim() === label || button.getAttribute("aria-label") === label
                );
                expect(button).toBeDefined();
                button.click();
            });
        const hover = async (name: string) =>
            act(async () => {
                const button = [...panel.querySelectorAll("button")].find((node) => node.textContent.trim() === name);
                button.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
            });
        await hover("assets");
        expect(panel.querySelector(".canvas-subfolder-contents").textContent).toContain("photo.png");
        await click("assets");
        expect(panel.querySelector(".canvas-folder-entry-icon img")?.getAttribute("src")).toContain("photo.png");
        await hover("photo.png");
        const preview = panel.querySelector<HTMLElement>(".canvas-folder-selection");
        expect(preview.querySelector("img")?.getAttribute("alt")).toBe("photo.png");
        expect(parseInt(preview.style.left)).toBeGreaterThan(parseInt(panel.style.left) + parseInt(panel.style.width));
        await click("photo.png");
        expect(panel.querySelector(".canvas-folder-selection")).toBeNull();
        expect(openOnCanvas).toHaveBeenCalledWith(
            expect.objectContaining({ resource: path }),
            "/project/assets/photo.png",
            "photo.png"
        );
        expect(open).not.toHaveBeenCalled();
        await click("Back to parent folder");
        expect(panel.getAttribute("aria-label")).toBe("Contents of project");
    });

    it("restores and saves a canvas editor draft and rejects an external file change", async () => {
        const path = "/project/sample.ts";
        const text = "const count = 1;";
        const stat = vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path, size: text.length });
        const read = vi.spyOn(RpcApi, "FileReadCommand").mockResolvedValue({ data64: stringToBase64(text) });
        const write = vi.spyOn(RpcApi, "FileWriteCommand").mockResolvedValue(undefined);
        const openEditor = () =>
            act(async () =>
                root.render(
                    <CanvasTextEditor
                        objectId="recovery-test"
                        path={path}
                        name="sample.ts"
                        text={text}
                        fileSize={text.length}
                        readOnly={false}
                    />
                )
            );
        await openEditor();
        const click = async (name: string) =>
            act(async () => {
                [...host.querySelectorAll("button")].find((button) => button.textContent === name).click();
            });
        expect(host.querySelector(".canvas-text-editor-toolbar").textContent).toContain("sample.ts");
        await click("Change editor draft");
        expect(host.querySelector('[aria-label="Unsaved changes"]')).toBeTruthy();
        await act(async () => root.render(null));
        await openEditor();
        expect(host.querySelector("[data-editor-text]").getAttribute("data-editor-text")).toBe("const count = 2;");
        expect(host.querySelector('[aria-label="Unsaved changes"]')).toBeTruthy();
        read.mockResolvedValueOnce({ data64: stringToBase64("const count = 3;") });
        await click("Save");
        expect(write).not.toHaveBeenCalled();
        expect(host.querySelector("[role=status]").textContent).toContain("File changed on disk");
        await click("Save");
        expect(stat).toHaveBeenCalledTimes(2);
        expect(host.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
        expect(write.mock.calls[0][1]).toEqual({
            info: { path: "wsh://local//project/sample.ts" },
            data64: stringToBase64("const count = 2;"),
        });
    });

    it("shows all 25 folder items in a five-column grid without a root toolbar", async () => {
        const path = "/project";
        vi.spyOn(RpcApi, "FileInfoCommand").mockResolvedValue({ path, name: "Project", isdir: true });
        vi.spyOn(RpcApi, "FileListCommand").mockResolvedValue(
            Array.from({ length: 25 }, (_, index) => ({ name: `File ${index}`, path: `${path}/File ${index}` }))
        );
        await renderFile(path);
        await act(async () => host.querySelector<HTMLButtonElement>(".canvas-folder-preview").focus());
        const panel = document.querySelector(".canvas-folder-browser");
        const grid = panel.querySelector<HTMLElement>(".canvas-folder-entries");
        expect(grid.style.getPropertyValue("--folder-columns")).toBe("5");
        expect(grid.querySelectorAll("button")).toHaveLength(25);
        expect(panel.querySelector("header")).toBeNull();
    });

    it("recognizes browser media, clipboard HTML, and virtual files while preserving editor paste", async () => {
        const transfer = (items: Record<string, string>, files: File[] = []) =>
            ({ files, getData: (type: string) => items[type] ?? "" }) as unknown as DataTransfer;
        const image = readCanvasTransfer(
            transfer({ "text/html": '<img src="https://example.com/diagram.png?version=2">' }),
            () => ""
        );
        expect(image.resources[0].resource).toBe("https://example.com/diagram.png?version=2");
        const stat = vi.spyOn(RpcApi, "FileInfoCommand");
        await renderFile(image.resources[0].resource);
        expect(host.querySelector("img").src).toBe(image.resources[0].resource);
        expect(stat).not.toHaveBeenCalled();
        const html = readCanvasTransfer(
            transfer({ "text/plain": "<h1>Example</h1>", "text/html": "&lt;h1&gt;Example&lt;/h1&gt;" }),
            () => ""
        );
        expect(html.virtual[0]).toMatchObject({ name: "Pasted HTML.html", type: "text/html" });
        const screenshot = new File([], "image.png", { type: "image/png" });
        expect(readCanvasTransfer(transfer({}, [screenshot]), () => "").virtual).toEqual([screenshot]);
        expect(isCanvasPasteTarget(document.createElement("textarea"))).toBe(false);
        expect(isCanvasPasteTarget(host)).toBe(true);
    });

    it("persists virtual files in chunks and removes partial imports on failure", async () => {
        vi.spyOn(RpcApi, "FileMkdirCommand").mockResolvedValue(undefined);
        const append = vi.spyOn(RpcApi, "FileAppendCommand").mockResolvedValue(undefined);
        const remove = vi.spyOn(RpcApi, "FileDeleteCommand").mockResolvedValue(undefined);
        const file = {
            name: "image.png",
            type: "image/png",
            size: 128 * 1024 + 1,
            slice: (start: number, end: number) => ({
                arrayBuffer: async () => new ArrayBuffer(Math.min(128 * 1024 + 1, end) - start),
            }),
        } as File;
        const resource = await persistCanvasFile(file, "/home/user");
        expect(resource.resource).toMatch(/^\/home\/user\/\.kronos\/canvas-imports\/.+\/image\.png$/);
        expect(append).toHaveBeenCalledTimes(2);
        expect(append.mock.calls[1][1].data64).toBe("AA==");
        append.mockRejectedValueOnce(new Error("disk full"));
        await expect(persistCanvasFile(file, "/home/user")).rejects.toThrow("disk full");
        expect(remove).toHaveBeenCalledWith(undefined, {
            path: expect.stringContaining("/.kronos/canvas-imports/"),
            recursive: true,
        });
    });

    it("keeps canvas drag-over accepted even if the global backend prevented default in capture", () => {
        const viewport = document.createElement("div");
        host.append(viewport);
        const dragOver = (event: DragEvent) => allowCanvasDrop(event);
        const preventDefault = (event: Event) => event.preventDefault();
        const rejectUnhandled = (event: DragEvent) => {
            event.dataTransfer.dropEffect = "none";
        };
        document.addEventListener("dragover", preventDefault, true);
        document.addEventListener("dragover", rejectUnhandled);
        viewport.addEventListener("dragover", dragOver);
        try {
            const event = new Event("dragover", { bubbles: true, cancelable: true });
            const dataTransfer = { dropEffect: "none" };
            Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
            viewport.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
            expect(dataTransfer.dropEffect).toBe("copy");
        } finally {
            document.removeEventListener("dragover", preventDefault, true);
            document.removeEventListener("dragover", rejectUnhandled);
        }
    });

    it("keeps a native directory typed as a folder and accepts clipboard items without a FileList", () => {
        const folder = new File([], "Project");
        const image = new File([], "Screenshot.png", { type: "image/png" });
        const transfer = {
            files: [folder],
            items: [{ kind: "file", webkitGetAsEntry: () => ({ isDirectory: true }) }],
            getData: () => "",
        } as unknown as DataTransfer;
        expect(readCanvasTransfer(transfer, () => "/Users/example/Project")).toEqual({
            resources: [
                {
                    id: "local:/Users/example/Project",
                    resource: "/Users/example/Project",
                    name: "Project",
                    kind: "folder",
                },
            ],
            virtual: [],
        });

        const clipboard = {
            files: [],
            items: [{ kind: "file", getAsFile: () => image }],
            getData: () => "",
        } as unknown as DataTransfer;
        expect(readCanvasTransfer(clipboard, () => "", true).virtual).toEqual([image]);
    });
});
