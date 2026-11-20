// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button } from "@/app/element/button";
import { CenteredDiv } from "@/app/element/quickelems";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { activePenCanvasTabAtom, requestPenEditor } from "@/app/tab/os-pen-editor-bridge";
import { getApi } from "@/store/global";
import { getWebServerEndpoint } from "@/util/endpoints";
import { getModelPreviewFormat } from "@/util/model-preview";
import { formatRemoteUri } from "@/util/waveutil";
import { useAtomValue } from "jotai";
import {
    ChevronDown,
    Copy,
    Download,
    Expand,
    GripVertical,
    Image,
    MessageSquareDashed,
    PanelRight,
    X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, useControls } from "react-zoom-pan-pinch";
import type { SpecializedViewProps } from "./preview";
import "./preview-image.css";

const ModelPreview = lazy(() => import("./preview-3d").then((module) => ({ default: module.ModelPreview })));

function ImageZoomControls({ scale }: { scale: number }) {
    const { zoomIn, zoomOut, resetTransform } = useControls();

    return (
        <details className="image-viewer-zoom">
            <summary aria-label="Image zoom">
                {Math.round(scale * 100)}% <ChevronDown size={12} />
            </summary>
            <div>
                <button type="button" onClick={() => zoomIn()}>
                    Zoom in
                </button>
                <button type="button" onClick={() => zoomOut()}>
                    Zoom out
                </button>
                <button type="button" onClick={() => resetTransform()}>
                    Reset zoom
                </button>
            </div>
        </details>
    );
}

type ImageComment = { number: number; x: number; y: number; text: string };

export function StreamingImagePreview({
    url,
    filename,
    onDismiss,
    onMoveToSidePanel,
    onDownload,
    downloading,
    localPath,
}: {
    url: string;
    filename: string;
    onDismiss?: () => void;
    onMoveToSidePanel?: () => void;
    onDownload?: () => void;
    downloading?: boolean;
    localPath?: string;
}) {
    const viewer = useRef<HTMLDialogElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [scale, setScale] = useState(1);
    const [toolbarOffset, setToolbarOffset] = useState({ x: 0, y: 0 });
    const toolbarDrag = useRef<{ x: number; y: number }>(null);
    const openViewer = () => {
        const dialog = viewer.current;
        if (!dialog || dialog.open) return;
        dialog.showModal();
        setExpanded(true);
    };
    const closeViewer = () => {
        viewer.current?.close();
        setExpanded(false);
    };
    const modalOnly = Boolean(onDismiss);
    const [docked, setDocked] = useState(false);
    const moveToSidePanel = () => {
        if (modalOnly) {
            const dialog = viewer.current;
            if (!dialog) return;
            setDocked(true);
            dialog.close("dock");
            setExpanded(false);
            onMoveToSidePanel?.();
            return;
        }
        closeViewer();
    };
    useEffect(() => {
        const dialog = viewer.current;
        if (modalOnly && !docked && dialog && !dialog.open) {
            dialog.showModal();
            setExpanded(true);
        }
    }, [modalOnly, docked]);
    const [annotating, setAnnotating] = useState(false);
    const [comments, setComments] = useState<ImageComment[]>([]);
    const [draft, setDraft] = useState<ImageComment>();
    const [status, setStatus] = useState("");

    const reviewImage = useRef<{ url: string; data: Promise<string> }>(undefined);
    const [sendingReview, setSendingReview] = useState(false);
    const stageReview = async (notes: ImageComment[]) => {
        const tabId = globalStore.get(activePenCanvasTabAtom);
        if (!tabId) {
            if (notes.length) setStatus("Open KronOS v2 chat to add this review to the draft.");
            return;
        }
        setSendingReview(true);
        try {
            if (reviewImage.current?.url !== url) {
                const data = (async () => {
                    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return url;
                    const source = new URL(url, document.baseURI);
                    const path = source.pathname === "/wave/stream-file" ? source.searchParams.get("path") : null;
                    if (path) {
                        const { info, data64 } = await RpcApi.FileReadCommand(TabRpcClient, { info: { path } });
                        if (!info?.mimetype?.startsWith("image/") || !data64)
                            throw new Error("Could not read the image.");
                        return `data:${info.mimetype};base64,${data64}`;
                    }
                    const image = viewer.current?.querySelector("img");
                    if (!image?.naturalWidth) throw new Error("The image is still loading.");
                    const canvas = document.createElement("canvas");
                    canvas.width = image.naturalWidth;
                    canvas.height = image.naturalHeight;
                    const context = canvas.getContext("2d");
                    if (!context) throw new Error("Could not prepare the image.");
                    context.drawImage(image, 0, 0);
                    return canvas.toDataURL("image/png");
                })();
                reviewImage.current = { url, data };
            }
            const dataUrl = await reviewImage.current.data;
            await requestPenEditor(tabId, "stage_image_review", { filename, dataUrl, comments: notes });
            setStatus(notes.length ? "Image comments added to the chat draft." : "Image added to the chat draft.");
        } catch (error) {
            reviewImage.current = undefined;
            setStatus(error instanceof Error ? error.message : "Could not add the image to chat.");
        } finally {
            setSendingReview(false);
        }
    };

    const copyComments = async () => {
        const lines = comments.map(
            ({ number, x, y, text }) => `${number}. (x: ${x.toFixed(1)}%, y: ${y.toFixed(1)}%) ${text}`
        );
        try {
            await navigator.clipboard.writeText([`Image comments for ${filename}:`, ...lines].join("\n"));
            setStatus("Comments copied. Paste them into chat.");
        } catch {
            setStatus("Could not copy comments.");
        }
    };

    const copyImage = async () => {
        try {
            const image = viewer.current?.querySelector("img");
            if (!image?.naturalWidth) throw new Error("Image unavailable.");
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            canvas.getContext("2d").drawImage(image, 0, 0);
            const png = new Promise<Blob>((resolve, reject) =>
                canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image unavailable."))))
            );
            await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
            setStatus("Image copied. Paste it into chat.");
        } catch {
            setStatus("Could not copy the image. You can attach the original file in chat.");
        }
    };

    const [commentInSidePanel, setCommentInSidePanel] = useState(false);
    const commentEditor = draft && (
        <form
            className="image-viewer-comment"
            data-align={draft.x > 55 ? "left" : "right"}
            style={commentInSidePanel ? undefined : { left: `${draft.x}%`, top: `${draft.y}%` }}
            onSubmit={(event) => {
                event.preventDefault();
                const text = draft.text.trim();
                if (!text) return;
                setComments((rows) =>
                    rows.some(({ number }) => number === draft.number)
                        ? rows.map((row) => (row.number === draft.number ? { ...draft, text } : row))
                        : [...rows, { ...draft, text }]
                );
                setDraft(undefined);
            }}
        >
            <label className="contents">
                <span className="sr-only">Comment {draft.number}</span>
                <textarea
                    autoFocus
                    required
                    maxLength={2000}
                    value={draft.text}
                    onChange={(event) => setDraft({ ...draft, text: event.target.value })}
                    placeholder="Add a comment…"
                    rows={1}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            setDraft(undefined);
                        }
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                        }
                    }}
                />
            </label>
            <div className="image-viewer-comment-actions">
                {comments.some(({ number }) => number === draft.number) && (
                    <Button
                        type="button"
                        onClick={() => {
                            setComments((rows) => rows.filter(({ number }) => number !== draft.number));
                            setDraft(undefined);
                        }}
                    >
                        Delete
                    </Button>
                )}
                <Button type="button" onClick={() => setDraft(undefined)}>
                    Cancel
                </Button>
                <Button type="submit" disabled={!draft.text.trim()} aria-label="Save comment">
                    Save
                </Button>
                <Button type="button" onClick={() => setCommentInSidePanel(!commentInSidePanel)}>
                    {commentInSidePanel ? "Move onto image" : "Move to side panel"}
                </Button>
            </div>
        </form>
    );

    return (
        <dialog
            ref={viewer}
            className="image-viewer"
            data-modal-only={(modalOnly && !docked) || undefined}
            data-docked={docked || undefined}
            aria-label={filename}
            onClose={() => {
                setExpanded(false);
                if (viewer.current?.returnValue !== "dock") onDismiss?.();
            }}
        >
            <TransformWrapper
                initialScale={1}
                centerOnInit
                pinch={{ step: 10 }}
                panning={{ disabled: annotating }}
                onTransformed={(_ref, state) => setScale(state.scale)}
            >
                <header className="image-viewer-header">
                    <span className="image-viewer-pill" title={filename}>
                        <Image size={16} /> Image
                    </span>
                    <div>
                        <details className="image-viewer-zoom">
                            <summary>
                                Open in <ChevronDown size={12} />
                            </summary>
                            <div>
                                {localPath && (
                                    <>
                                        <button type="button" onClick={() => getApi().revealNativePath(localPath)}>
                                            Show in Finder
                                        </button>
                                        <button type="button" onClick={() => getApi().openNativePath(localPath)}>
                                            Default app
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                getApi().openExternal(
                                                    "vscode://file" +
                                                        localPath.split("/").map(encodeURIComponent).join("/")
                                                )
                                            }
                                        >
                                            Visual Studio Code
                                        </button>
                                    </>
                                )}
                                <button
                                    type="button"
                                    onClick={
                                        onDownload ??
                                        (() => {
                                            const link = document.createElement("a");
                                            link.href = url;
                                            link.download = filename;
                                            link.click();
                                        })
                                    }
                                >
                                    Download image
                                </button>
                            </div>
                        </details>
                        {expanded && (!modalOnly || onMoveToSidePanel) && (
                            <button type="button" className="image-viewer-pill" onClick={moveToSidePanel}>
                                <PanelRight size={15} /> Move to side panel
                            </button>
                        )}
                        <ImageZoomControls scale={scale} />
                        {onDownload ? (
                            <button
                                type="button"
                                className="image-viewer-pill"
                                aria-label="Download image"
                                onClick={onDownload}
                                disabled={downloading}
                            >
                                <Download size={16} />
                            </button>
                        ) : (
                            <a className="image-viewer-pill" href={url} download={filename} aria-label="Download image">
                                <Download size={16} />
                            </a>
                        )}
                        {expanded ? (
                            <>
                                <button
                                    type="button"
                                    className="image-viewer-pill"
                                    aria-label="Close image viewer"
                                    onClick={closeViewer}
                                >
                                    <X size={16} />
                                </button>
                            </>
                        ) : docked ? (
                            <button
                                type="button"
                                className="image-viewer-pill"
                                aria-label="Close image viewer"
                                onClick={onDismiss}
                            >
                                <X size={16} />
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="image-viewer-pill"
                                aria-label="Expand image"
                                onClick={openViewer}
                            >
                                <Expand size={16} />
                            </button>
                        )}
                    </div>
                </header>
                <TransformComponent wrapperClass="image-viewer-stage">
                    <div className="image-viewer-media">
                        <img src={url} alt={filename} draggable={false} />
                        {!expanded && !annotating && (
                            <button
                                type="button"
                                className="image-viewer-hit-target cursor-zoom-in"
                                aria-label="Open image viewer"
                                onClick={openViewer}
                            />
                        )}
                        {annotating && (
                            <button
                                type="button"
                                aria-label="Place an image comment"
                                className="image-viewer-hit-target cursor-crosshair"
                                onClick={(event) => {
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    if (!rect.width || !rect.height) return;
                                    setDraft({
                                        number: Math.max(0, ...comments.map(({ number }) => number)) + 1,
                                        x: event.detail ? ((event.clientX - rect.left) * 100) / rect.width : 50,
                                        y: event.detail ? ((event.clientY - rect.top) * 100) / rect.height : 50,
                                        text: "",
                                    });
                                }}
                            />
                        )}
                        {[
                            ...comments,
                            ...(draft && !comments.some(({ number }) => number === draft.number) ? [draft] : []),
                        ].map((comment) => (
                            <button
                                type="button"
                                key={comment.number}
                                className="image-viewer-pin"
                                style={{ left: `${comment.x}%`, top: `${comment.y}%` }}
                                aria-label={`Comment ${comment.number}`}
                                onClick={() => setDraft(comment)}
                            >
                                {comment.number}
                            </button>
                        ))}
                        {!commentInSidePanel && commentEditor}
                    </div>
                </TransformComponent>
                {commentInSidePanel && draft && (
                    <aside className="image-viewer-comment-panel" aria-label="Image comment side panel">
                        <strong>Comment {draft.number}</strong>
                        {commentEditor}
                    </aside>
                )}
                <div
                    className="image-viewer-tools"
                    role="toolbar"
                    aria-label="Image tools"
                    style={{ translate: `${toolbarOffset.x}px ${toolbarOffset.y}px` }}
                >
                    <button
                        type="button"
                        className="image-viewer-grip"
                        aria-label="Move image toolbar"
                        onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            toolbarDrag.current = {
                                x: event.clientX - toolbarOffset.x,
                                y: event.clientY - toolbarOffset.y,
                            };
                        }}
                        onPointerMove={(event) => {
                            const start = toolbarDrag.current;
                            const bounds = viewer.current?.getBoundingClientRect();
                            const tools = event.currentTarget.parentElement?.getBoundingClientRect();
                            if (!start || !bounds || !tools || !event.currentTarget.hasPointerCapture(event.pointerId))
                                return;
                            setToolbarOffset((current) => ({
                                x: Math.min(
                                    current.x + bounds.right - tools.right - 8,
                                    Math.max(current.x + bounds.left - tools.left + 8, event.clientX - start.x)
                                ),
                                y: Math.min(
                                    current.y + bounds.bottom - tools.bottom - 8,
                                    Math.max(current.y + bounds.top - tools.top + 8, event.clientY - start.y)
                                ),
                            }));
                        }}
                        onLostPointerCapture={() => {
                            toolbarDrag.current = null;
                        }}
                        onDoubleClick={() => setToolbarOffset({ x: 0, y: 0 })}
                    >
                        <GripVertical size={16} />
                    </button>
                    {annotating ? (
                        <>
                            <span>Click on the image to add comments</span>
                            <button
                                type="button"
                                className="image-viewer-send"
                                disabled={sendingReview || comments.length === 0}
                                onClick={() => void stageReview(comments)}
                            >
                                Send to chat
                            </button>
                            <button
                                type="button"
                                aria-label="Copy comments"
                                title="Copy comments"
                                disabled={comments.length === 0}
                                onClick={() => void copyComments()}
                            >
                                <Copy size={15} />
                            </button>
                            <button type="button" onClick={() => void copyImage()}>
                                Copy image
                            </button>
                            <button
                                type="button"
                                aria-label="Exit comment mode"
                                onClick={() => {
                                    setAnnotating(false);
                                    setDraft(undefined);
                                }}
                            >
                                <X size={16} />
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            aria-pressed={false}
                            onClick={() => {
                                setAnnotating(true);
                                void stageReview([]);
                            }}
                        >
                            <MessageSquareDashed size={16} /> Comment{comments.length ? ` (${comments.length})` : ""}
                        </button>
                    )}
                </div>
            </TransformWrapper>
            {status && (
                <p role="status" className="absolute bottom-2 left-2 rounded bg-black px-2 py-1 text-white">
                    {status}
                </p>
            )}
        </dialog>
    );
}

function StreamingPreview({ model }: SpecializedViewProps) {
    useEffect(() => {
        model.refreshCallback = () => {
            globalStore.set(model.refreshVersion, (v) => v + 1);
        };
        return () => {
            model.refreshCallback = null;
        };
    }, []);
    const conn = useAtomValue(model.connection);
    const fileInfo = useAtomValue(model.statFile);
    const refreshVersion = useAtomValue(model.refreshVersion);
    const filePath = fileInfo.path;
    const remotePath = formatRemoteUri(filePath, conn);
    const usp = new URLSearchParams();
    usp.set("path", remotePath);
    const streamingUrl = `${getWebServerEndpoint()}/wave/stream-file?${usp.toString()}`;
    const modelFormat = getModelPreviewFormat(filePath);
    if (modelFormat) {
        return (
            <Suspense fallback={<CenteredDiv>Loading 3D preview…</CenteredDiv>}>
                <ModelPreview
                    key={`${streamingUrl}:${refreshVersion}`}
                    url={streamingUrl}
                    format={modelFormat}
                    size={fileInfo.size}
                    name={fileInfo.name}
                />
            </Suspense>
        );
    }
    if (fileInfo.mimetype === "application/pdf") {
        return (
            <div className="flex flex-row h-full overflow-hidden items-center justify-center p-[5px]">
                <iframe src={streamingUrl} width="100%" height="100%" name="pdfview" />
            </div>
        );
    }
    if (fileInfo.mimetype.startsWith("video/")) {
        return (
            <div className="flex flex-row h-full overflow-hidden items-center justify-center">
                <video controls src={streamingUrl} className="w-full h-full p-[10px] object-contain" />
            </div>
        );
    }
    if (fileInfo.mimetype.startsWith("audio/")) {
        return (
            <div className="flex flex-row h-full overflow-hidden items-center justify-center">
                <audio controls src={streamingUrl} className="w-full h-full p-[10px] object-contain" />
            </div>
        );
    }
    if (fileInfo.mimetype.startsWith("image/")) {
        return (
            <StreamingImagePreview
                key={streamingUrl}
                url={streamingUrl}
                filename={fileInfo.name}
                localPath={(!conn || conn === "local") && filePath.startsWith("/") ? filePath : undefined}
            />
        );
    }
    return <CenteredDiv>Preview Not Supported</CenteredDiv>;
}

export { StreamingPreview };
