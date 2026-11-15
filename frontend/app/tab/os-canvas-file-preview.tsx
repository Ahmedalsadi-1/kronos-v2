// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { classifyMedia } from "@/app/view/medialibrary/media-library-utils";
import { getWebServerEndpoint } from "@/util/endpoints";
import { base64ToArray, base64ToString } from "@/util/util";
import { formatRemoteUri } from "@/util/waveutil";
import DOMPurify from "dompurify";
import { ArrowLeft, ArrowUpRight, FileText, Folder } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { readCanvasDraft } from "./os-canvas-editor-storage";
import "./os-canvas-file-preview.css";
import { canvasMediaUrl } from "./workspace-canvas-files";

const CanvasTextEditor = lazy(async () => {
    const { CanvasTextEditor } = await import("./os-canvas-text-editor");
    return { default: CanvasTextEditor };
});

const MaxHtmlPreviewBytes = 1024 * 1024;
const HtmlPreviewCsp =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";

function htmlPreviewDocument(html: string): string {
    const clean = DOMPurify.sanitize(html, {
        WHOLE_DOCUMENT: true,
        ADD_TAGS: ["style"],
        FORBID_TAGS: ["base", "meta", "link", "iframe", "form", "object", "embed"],
        FORBID_ATTR: ["href", "xlink:href", "autofocus"],
    });
    const document = new DOMParser().parseFromString(clean, "text/html");
    const meta = document.createElement("meta");
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = HtmlPreviewCsp;
    document.head.prepend(meta);
    return `<!doctype html>${document.documentElement.outerHTML}`;
}

function useCanvasFolderListing(path: string | undefined) {
    const [listing, setListing] = useState<{ path: string; entries?: FileInfo[]; error?: boolean }>();
    useEffect(() => {
        if (!path) return;
        let active = true;
        void RpcApi.FileListCommand(TabRpcClient, { path: formatRemoteUri(path, "local") }).then(
            (entries) => {
                if (active) setListing({ path, entries: entries ?? [] });
            },
            () => {
                if (active) setListing({ path, error: true });
            }
        );
        return () => {
            active = false;
        };
    }, [path]);
    return listing?.path === path ? listing : undefined;
}

function CanvasSubfolderContents({ path }: { path: string }) {
    const listing = useCanvasFolderListing(path);
    if (!listing) return <span role="status">Loading folder…</span>;
    if (listing.error) return <span role="status">Folder unavailable</span>;
    if (!listing.entries.length) return <span role="status">Empty folder</span>;
    return (
        <ul className="canvas-subfolder-contents">
            {listing.entries.map((entry) => {
                const Icon = entry.isdir ? Folder : FileText;
                return (
                    <li key={entry.path}>
                        <Icon size={16} aria-hidden="true" />
                        <span>{entry.name}</span>
                    </li>
                );
            })}
        </ul>
    );
}

type FolderDragHandlers = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => void;
};

export function CanvasFolderPreview({
    name,
    path,
    onOpen,
    onOpenEntry,
    browseOnClick = false,
    drag,
    onSelect,
}: {
    name: string;
    browseOnClick?: boolean;
    drag?: FolderDragHandlers;
    onSelect?: () => void;
    path: string;
    onOpen: () => void;
    onOpenEntry?: (path: string, name: string, directory: boolean) => void;
}) {
    const panelId = useId();
    const press = useRef<{ x: number; y: number; moved: boolean; released?: boolean }>(undefined);
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLElement>(null);
    const closeTimer = useRef<number>(undefined);
    const [position, setPosition] = useState<{
        grid: CSSProperties;
        preview: CSSProperties;
        direction: "up" | "down";
    }>();
    const [trail, setTrail] = useState<{ path: string; name: string }[]>([]);
    const [hovered, setHovered] = useState<{ path: string; name: string; directory: boolean }>();
    const current = trail.at(-1) ?? { path, name };
    const visible = position != null;
    const listing = useCanvasFolderListing(visible ? current.path : undefined);
    const entryCount = listing?.path === current.path ? (listing.entries?.length ?? 0) : 0;
    const columns = Math.max(
        1,
        Math.min(5, Math.ceil(Math.sqrt(entryCount)), Math.floor(Number(position?.grid.width ?? 0) / 83))
    );
    const rows = Math.max(1, Math.min(5, Math.ceil(entryCount / columns)));
    const toolbarHeight = trail.length ? 40 : 0;
    const rowHeight = Math.max(
        48,
        Math.min(80, Math.floor((Number(position?.grid.maxHeight ?? 0) - toolbarHeight - 8) / rows) - 4)
    );
    const gridLayout = {
        "--folder-columns": columns,
        "--folder-cell-height": `${rowHeight}px`,
    } as CSSProperties;

    useEffect(() => () => window.clearTimeout(closeTimer.current), []);

    const cancelClose = () => window.clearTimeout(closeTimer.current);
    const show = () => {
        cancelClose();
        if (visible) return;
        const rect = trigger.current.getBoundingClientRect();
        const inset = 8;
        const width = Math.min(550, window.innerWidth - inset * 2);
        const center = rect.left + rect.width / 2;
        const left = Math.max(inset, Math.min(center - width / 2, window.innerWidth - width - inset));
        const above = Math.max(0, rect.top - inset);
        const below = Math.max(0, window.innerHeight - rect.bottom - inset);
        const up = above >= Math.min(320, below);
        const height = Math.min(430, up ? above : below);
        const rightSpace = window.innerWidth - left - width - inset * 2;
        const leftSpace = left - inset * 2;
        const sideSpace = Math.max(rightSpace, leftSpace);
        const hasSide = sideSpace >= 300;
        const previewWidth = Math.min(500, hasSide ? sideSpace : window.innerWidth - inset * 2);
        const previewLeft = hasSide
            ? rightSpace >= leftSpace
                ? left + width + inset
                : left - previewWidth - inset
            : Math.max(inset, Math.min(center - previewWidth / 2, window.innerWidth - previewWidth - inset));
        const previewHeight = Math.min(420, window.innerHeight - inset * 2);
        setPosition({
            grid: {
                left,
                width,
                maxHeight: height,
                ...(up ? { bottom: window.innerHeight - rect.top } : { top: rect.bottom }),
            },
            preview: {
                left: previewLeft,
                top: Math.max(inset, Math.min(rect.top, window.innerHeight - previewHeight - inset)),
                width: previewWidth,
                height: previewHeight,
            },
            direction: up ? "up" : "down",
        });
    };
    const close = () => {
        cancelClose();
        setPosition(undefined);
        setTrail([]);
        setHovered(undefined);
    };
    const scheduleClose = () => {
        cancelClose();
        closeTimer.current = window.setTimeout(() => {
            if (panel.current?.contains(document.activeElement)) return;
            close();
        }, 220);
    };

    return (
        <>
            <button
                ref={trigger}
                type="button"
                className="os-canvas-file-preview is-folder canvas-folder-preview"
                data-folder-draggable={drag ? "" : undefined}
                data-folder-click-to-open={browseOnClick ? "" : undefined}
                aria-label={`Open ${name || "folder"}`}
                aria-expanded={visible}
                aria-controls={visible ? panelId : undefined}
                onPointerEnter={browseOnClick ? cancelClose : show}
                onPointerLeave={scheduleClose}
                onFocus={browseOnClick ? undefined : show}
                onBlur={scheduleClose}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    if (!drag || event.button !== 0 || event.isPrimary === false) return;
                    press.current = { x: event.clientX, y: event.clientY, moved: false };
                    drag.onPointerDown(event);
                }}
                onPointerMove={(event) => {
                    const start = press.current;
                    if (!drag || !start || start.released) return;
                    if (!start.moved && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) return;
                    if (!start.moved) {
                        start.moved = true;
                        close();
                    }
                    drag.onPointerMove(event);
                }}
                onPointerUp={(event) => {
                    if (press.current) press.current.released = true;
                    drag?.onPointerUp(event);
                }}
                onPointerCancel={(event) => {
                    press.current = undefined;
                    drag?.onPointerCancel(event);
                }}
                onLostPointerCapture={drag?.onLostPointerCapture}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey && visible)) {
                        event.preventDefault();
                        if (visible) panel.current?.focus();
                        else show();
                    }
                    if (event.key === "Escape" && visible) {
                        event.stopPropagation();
                        close();
                    }
                }}
                onClick={(event) => {
                    const moved = press.current?.moved;
                    press.current = undefined;
                    if (event.detail > 0 && moved) return;
                    onSelect?.();
                    if (browseOnClick) {
                        trigger.current?.focus({ preventScroll: true });
                        if (visible) close();
                        else show();
                        return;
                    }
                    onOpen();
                    close();
                }}
            >
                <span className="canvas-folder-art" aria-hidden="true" />
                {visible && (
                    <span className="canvas-folder-name" aria-hidden="true">
                        {name || "Folder"}
                    </span>
                )}
            </button>
            {visible &&
                createPortal(
                    <section
                        id={panelId}
                        ref={panel}
                        tabIndex={-1}
                        className="canvas-folder-browser"
                        style={position.grid}
                        data-fan-direction={position.direction}
                        aria-label={`Contents of ${current.name || "folder"}`}
                        data-canvas-shortcuts="ignore"
                        onPointerEnter={cancelClose}
                        onPointerLeave={scheduleClose}
                        onPointerDown={(event) => event.stopPropagation()}
                        onWheel={(event) => event.stopPropagation()}
                        onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose();
                        }}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Escape" && hovered) {
                                panel.current?.focus();
                                setHovered(undefined);
                            } else if (event.key === "Escape") {
                                trigger.current?.focus();
                                close();
                            }
                        }}
                    >
                        {trail.length > 0 && (
                            <header>
                                <button
                                    type="button"
                                    aria-label="Back to parent folder"
                                    onClick={() => {
                                        setTrail((folders) => folders.slice(0, -1));
                                        setHovered(undefined);
                                    }}
                                >
                                    <ArrowLeft size={16} />
                                </button>
                                <strong>{current.name}</strong>
                                <button
                                    type="button"
                                    aria-label="Open folder in Files"
                                    onClick={() => {
                                        if (onOpenEntry) onOpenEntry(current.path, current.name, true);
                                        else onOpen();
                                        close();
                                    }}
                                >
                                    <ArrowUpRight size={16} />
                                </button>
                            </header>
                        )}
                        <div className="canvas-folder-entries" key={current.path} style={gridLayout}>
                            {listing?.path !== current.path ? (
                                <span role="status">Loading folder…</span>
                            ) : listing.error ? (
                                <span role="status">Folder unavailable</span>
                            ) : !listing.entries.length ? (
                                <span role="status">Empty folder</span>
                            ) : (
                                listing.entries.map((entry) => {
                                    const child = {
                                        path: `${current.path.replace(/[\\/]$/, "")}/${entry.name}`,
                                        name: entry.name,
                                    };
                                    const Icon = entry.isdir ? Folder : FileText;
                                    const endpoint = getWebServerEndpoint();
                                    const image =
                                        endpoint &&
                                        classifyMedia({
                                            path: child.path,
                                            mimetype: entry.mimetype,
                                            isdir: entry.isdir,
                                        }) === "image";
                                    const thumbnail =
                                        image &&
                                        `${endpoint}/wave/stream-file?${new URLSearchParams({
                                            path: formatRemoteUri(child.path, "local"),
                                        })}`;
                                    return (
                                        <button
                                            type="button"
                                            key={entry.path}
                                            title={entry.name}
                                            data-entry-kind={entry.isdir ? "folder" : thumbnail ? "image" : "file"}
                                            onPointerEnter={() => setHovered({ ...child, directory: entry.isdir })}
                                            onPointerLeave={() => setHovered(undefined)}
                                            onFocus={(event) => {
                                                if (event.currentTarget.matches(":focus-visible")) {
                                                    setHovered({ ...child, directory: entry.isdir });
                                                }
                                            }}
                                            onBlur={() => setHovered(undefined)}
                                            onClick={() => {
                                                setHovered(undefined);
                                                if (entry.isdir) setTrail((folders) => [...folders, child]);
                                                else onOpenEntry?.(child.path, child.name, false);
                                            }}
                                        >
                                            <span className="canvas-folder-entry-icon" aria-hidden="true">
                                                <Icon size={30} strokeWidth={1.4} />
                                                {thumbnail && (
                                                    <img
                                                        src={thumbnail}
                                                        alt=""
                                                        loading="lazy"
                                                        draggable={false}
                                                        onError={(event) => {
                                                            event.currentTarget.hidden = true;
                                                        }}
                                                    />
                                                )}
                                            </span>
                                            <span>{entry.name}</span>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                        {hovered && (
                            <div className="canvas-folder-selection" style={position.preview}>
                                {hovered.directory ? (
                                    <CanvasSubfolderContents key={hovered.path} path={hovered.path} />
                                ) : (
                                    <OSCanvasFilePreview
                                        key={hovered.path}
                                        path={hovered.path}
                                        displayMode="hover"
                                        onOpen={() => undefined}
                                    />
                                )}
                            </div>
                        )}
                    </section>,
                    document.body
                )}
        </>
    );
}

function htmlFilePreview(content: string, size: number): FilePreview {
    return { kind: "html", document: htmlPreviewDocument(content), truncated: size > MaxHtmlPreviewBytes };
}

const MaxPreviewBytes = 8192;
const MarkdownPlugins = [remarkGfm];
type EditableCanvasFile = { name: string; text: string; size: number; readOnly: boolean };

type FilePreview =
    | ({ kind: "editor" } & EditableCanvasFile)
    | { kind: "image" | "video" | "audio"; url: string; name: string }
    | { kind: "text" | "markdown"; text: string; truncated: boolean }
    | { kind: "html"; document: string; truncated: boolean; source?: EditableCanvasFile }
    | { kind: "folder"; name: string }
    | { kind: "status"; text: string };

export function OSCanvasFilePreview({
    path,
    objectId,
    localFile,
    onOpen,
    onOpenFolder = onOpen,
    onOpenEntry,
    displayMode,
    browseFolderOnClick,
    onSelectFolder,
    folderDrag,
}: {
    path: string;
    objectId?: string;
    localFile?: File;
    browseFolderOnClick?: boolean;
    onSelectFolder?: () => void;
    folderDrag?: FolderDragHandlers;
    displayMode?: "canvas" | "hover";
    onOpen: () => void;
    onOpenFolder?: () => void;
    onOpenEntry?: (path: string, name: string, directory: boolean) => void;
}) {
    const element = useRef<HTMLDivElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [editingHtml, setEditingHtml] = useState(() => Boolean(readCanvasDraft(objectId, path)));
    const savedHtml = useRef<EditableCanvasFile>(undefined);
    const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
    const [preview, setPreview] = useState<FilePreview>({ kind: "status", text: "Loading preview…" });

    useEffect(() => {
        if (localFile || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            setVisible(true);
            observer.disconnect();
        });
        observer.observe(element.current);
        return () => observer.disconnect();
    }, [localFile]);

    useEffect(() => {
        if (!visible && !localFile) return;
        let active = true;
        let objectUrl: string;
        const remotePath = formatRemoteUri(path, "local");
        const name = localFile?.name || path.split(/[\\/]/).pop();
        const endpoint = getWebServerEndpoint();
        const streamUrl = endpoint && `${endpoint}/wave/stream-file?${new URLSearchParams({ path: remotePath })}`;
        const load = async (): Promise<FilePreview | undefined> => {
            const external = canvasMediaUrl(path);
            if (external) {
                const kind = classifyMedia({ path: new URL(external).pathname, mimetype: undefined, isdir: false });
                if (kind === "image" || kind === "video" || kind === "audio") return { kind, name, url: external };
            }
            const htmlExtension = /\.html?$/i.test(path);
            if (localFile && (htmlExtension || localFile.type === "text/html")) {
                const content = await localFile.slice(0, MaxHtmlPreviewBytes).text();
                return htmlFilePreview(content, localFile.size);
            }
            const initialKind = classifyMedia({ path, mimetype: localFile?.type, isdir: false });
            if (localFile && (initialKind === "image" || initialKind === "video" || initialKind === "audio")) {
                if (localFile && typeof URL.createObjectURL === "function") objectUrl = URL.createObjectURL(localFile);
                if (objectUrl || streamUrl) return { kind: initialKind, name, url: objectUrl || streamUrl };
            }
            if (localFile && (localFile.type.startsWith("text/") || /\.(?:txt|mdx?|markdown)$/i.test(path))) {
                const content = await localFile.slice(0, MaxPreviewBytes).text();
                return content
                    ? {
                          kind: /\.(?:mdx?|markdown)$/i.test(path) ? "markdown" : "text",
                          text: content,
                          truncated: localFile.size > MaxPreviewBytes,
                      }
                    : { kind: "status", text: "Empty file" };
            }
            const info = await RpcApi.FileInfoCommand(TabRpcClient, { info: { path: remotePath } });
            if (info?.notfound || info?.staterror || !info) return { kind: "status", text: "File unavailable" };
            if (info.isdir) return { kind: "folder", name: info.name || name };
            const mime = info.mimetype ?? "";
            const classified = classifyMedia({ path, mimetype: mime, isdir: false });
            const kind = mime.startsWith("text/") ? undefined : classified;
            if (streamUrl && (kind === "image" || kind === "video" || kind === "audio")) {
                return {
                    kind,
                    name: info.name || name,
                    url: streamUrl,
                };
            }
            const markdown = mime.startsWith("text/markdown") || /\.mdx?$/i.test(path);
            const html = htmlExtension || /^(?:text\/html|application\/xhtml\+xml)\b/.test(mime);
            const text =
                html ||
                markdown ||
                mime.startsWith("text/") ||
                /^application\/(?:json|yaml|toml|xml|javascript|typescript|x-sh|x-shellscript)\b/.test(mime);
            if (!text) return { kind: "status", text: "Open file to view" };
            if (!active) return;
            if (displayMode === "canvas" && info.size != null && info.size <= MaxHtmlPreviewBytes) {
                const data =
                    info.size > 0
                        ? await RpcApi.FileReadCommand(TabRpcClient, {
                              info: { path: remotePath },
                              at: { offset: 0, size: info.size },
                          })
                        : undefined;
                const bytes = data?.data64 ? base64ToArray(data.data64) : new Uint8Array();
                if (bytes.byteLength !== info.size) return { kind: "status", text: "File preview incomplete" };
                const content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
                if (content.includes("\0")) return { kind: "status", text: "Open file to view" };
                const file = { name, text: content, size: info.size, readOnly: Boolean(info.readonly) };
                return html
                    ? { kind: "html", document: htmlPreviewDocument(content), truncated: false, source: file }
                    : { kind: "editor", ...file };
            }
            const limit = html
                ? Math.min(MaxHtmlPreviewBytes, Math.max(1, info.size ?? MaxHtmlPreviewBytes))
                : MaxPreviewBytes;
            const data = await RpcApi.FileReadCommand(TabRpcClient, {
                info: { path: remotePath },
                at: { offset: 0, size: limit },
            });
            const content = data?.data64 ? base64ToString(data.data64) : "";
            if (!content) return { kind: "status", text: "Empty file" };
            if (html) return htmlFilePreview(content, info.size);
            return { kind: markdown ? "markdown" : "text", text: content, truncated: info.size > limit };
        };
        void load().then(
            (result) => {
                if (active && result) setPreview(result);
            },
            () => {
                if (active) setPreview({ kind: "status", text: "Preview unavailable" });
            }
        );
        return () => {
            active = false;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [path, localFile, visible, displayMode]);

    const editingHtmlSource = preview.kind === "html" && editingHtml;
    const editable = preview.kind === "editor" ? preview : editingHtmlSource ? preview.source : undefined;

    return (
        <div
            ref={element}
            className={`os-canvas-file-preview is-${editable ? "editor" : preview.kind}${displayMode ? ` mode-${displayMode}` : ""}`}
            onDoubleClick={["video", "audio", "html", "folder", "editor"].includes(preview.kind) ? undefined : onOpen}
            onWheel={(event) => {
                const node = event.currentTarget;
                if (!event.ctrlKey && !event.metaKey && node.scrollHeight > node.clientHeight) event.stopPropagation();
            }}
        >
            {preview.kind === "folder" && (
                <CanvasFolderPreview
                    name={preview.name}
                    path={path}
                    browseOnClick={browseFolderOnClick}
                    onSelect={onSelectFolder}
                    drag={folderDrag}
                    onOpen={onOpenFolder}
                    onOpenEntry={onOpenEntry}
                />
            )}
            {preview.kind === "image" && (
                <img
                    src={preview.url}
                    alt={preview.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onError={() => setPreview({ kind: "status", text: "Image unavailable" })}
                />
            )}
            {preview.kind === "video" && (
                <video
                    controls
                    playsInline
                    preload="metadata"
                    src={preview.url}
                    aria-label={preview.name}
                    data-canvas-shortcuts="ignore"
                    onError={() => setPreview({ kind: "status", text: "Video unavailable" })}
                />
            )}
            {preview.kind === "audio" && (
                <audio
                    controls
                    preload="none"
                    src={preview.url}
                    aria-label={preview.name}
                    data-canvas-shortcuts="ignore"
                    onError={() => setPreview({ kind: "status", text: "Audio unavailable" })}
                />
            )}
            {preview.kind === "markdown" && (
                <ReactMarkdown
                    remarkPlugins={MarkdownPlugins}
                    skipHtml
                    disallowedElements={["a", "img"]}
                    unwrapDisallowed
                >
                    {preview.text}
                </ReactMarkdown>
            )}
            {preview.kind === "text" && <pre>{preview.text}</pre>}
            {editable && (
                <Suspense fallback={<span role="status">Loading editor…</span>}>
                    <CanvasTextEditor
                        key={path}
                        path={path}
                        objectId={objectId}
                        name={editable.name}
                        text={editable.text}
                        fileSize={editable.size}
                        readOnly={editable.readOnly}
                        onSaved={
                            editingHtmlSource
                                ? (text, size) => {
                                      savedHtml.current = { ...editable, text, size };
                                  }
                                : undefined
                        }
                        onShowPreview={
                            editingHtmlSource
                                ? () => {
                                      const source = savedHtml.current ?? editable;
                                      setPreview({
                                          kind: "html",
                                          document: htmlPreviewDocument(source.text),
                                          truncated: false,
                                          source,
                                      });
                                      setEditingHtml(false);
                                      savedHtml.current = undefined;
                                  }
                                : undefined
                        }
                    />
                </Suspense>
            )}
            {preview.kind === "html" && !editable && (
                <>
                    <iframe title="HTML preview" sandbox="" srcDoc={preview.document} loading="lazy" tabIndex={-1} />
                    {preview.source && (
                        <div className="canvas-text-editor-toolbar">
                            <span title={path}>{preview.source.name}</span>
                            <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => setEditingHtml(true)}
                            >
                                Edit source
                            </button>
                        </div>
                    )}
                    {!displayMode && (
                        <>
                            <div className="canvas-html-controls">
                                {preview.truncated && <span>Partial preview</span>}
                                <button
                                    type="button"
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onClick={() => {
                                        dialog.current.showModal();
                                        setExpanded(true);
                                    }}
                                >
                                    Open HTML
                                </button>
                            </div>
                            <dialog
                                ref={dialog}
                                className="canvas-html-dialog"
                                aria-label="HTML preview"
                                onClose={() => setExpanded(false)}
                                onPointerDown={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                                onPaste={(event) => event.stopPropagation()}
                            >
                                <button type="button" onClick={() => dialog.current.close()}>
                                    Close
                                </button>
                                {expanded && (
                                    <iframe title="Expanded HTML preview" sandbox="" srcDoc={preview.document} />
                                )}
                            </dialog>
                        </>
                    )}
                </>
            )}
            {(preview.kind === "text" || preview.kind === "markdown") && preview.truncated && (
                <small>Open the file to read the rest.</small>
            )}
            {preview.kind === "status" && <span role="status">{preview.text}</span>}
        </div>
    );
}
