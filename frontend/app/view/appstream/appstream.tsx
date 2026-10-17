import { reportDesktopPetActivity } from "@/app/aipanel/desktop-pet-activity";
import { getSettingsKeyAtom } from "@/app/store/global";
import { ActionMarker } from "@/app/view/action-marker";
import { AppStreamFrameSizeEvent, type AppStreamFrameSize } from "@/app/view/appstream/appstream-events";
import { useAgentOverlays } from "@/app/view/use-agent-overlays";
import { WaterFlowOverlay } from "@/app/view/waterflow-overlay";
import { AgentSurfaceCursor } from "@/app/view/agent-surface-cursor";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeAgentActivityStream } from "../../../types/agent-activity";
import { drawAppStreamFrame } from "./appstream-canvas";
import { AppStreamViewModel } from "./appstream-model";

type StreamFitMode = "fit" | "fill" | "actual";

type CanvasPoint = { x: number; y: number };

const DefaultStreamFps = 6;
const DefaultStreamQuality = 80;

function clampCanvasCoordinate(value: number, max: number): number {
    return Math.min(Math.max(0, value), Math.max(0, max - 1));
}

export function clientPointToCanvasPoint(
    clientX: number,
    clientY: number,
    rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
    canvasWidth: number,
    canvasHeight: number,
    fitMode: StreamFitMode
): CanvasPoint {
    if (canvasWidth <= 0 || canvasHeight <= 0 || rect.width <= 0 || rect.height <= 0) {
        return { x: 0, y: 0 };
    }
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    if (fitMode === "fill") {
        const scale = Math.max(rect.width / canvasWidth, rect.height / canvasHeight);
        const renderedWidth = canvasWidth * scale;
        const renderedHeight = canvasHeight * scale;
        return {
            x: Math.round(clampCanvasCoordinate((localX - (rect.width - renderedWidth) / 2) / scale, canvasWidth)),
            y: Math.round(clampCanvasCoordinate((localY - (rect.height - renderedHeight) / 2) / scale, canvasHeight)),
        };
    }
    return {
        x: Math.round(clampCanvasCoordinate(localX * (canvasWidth / rect.width), canvasWidth)),
        y: Math.round(clampCanvasCoordinate(localY * (canvasHeight / rect.height), canvasHeight)),
    };
}

export function AppStreamView({ model }: ViewComponentProps<AppStreamViewModel>) {
    const status = useAtomValue(model.statusAtom);
    const streamUrl = useAtomValue(model.streamUrlAtom);
    const mediaStream = useAtomValue(model.mediaStreamAtom);
    const transport = useAtomValue(model.transportAtom);
    const captureFallbackReason = useAtomValue(model.captureFallbackReasonAtom);
    const error = useAtomValue(model.errorAtom);
    const appName = useAtomValue(model.appNameAtom);
    const nativeSurfaceV2Enabled = useAtomValue(getSettingsKeyAtom("feature:nativesurfacev2")) ?? false;
    const surfaceRef = useRef<HTMLDivElement>(null);
    const [surfaceVisible, setSurfaceVisible] = useState(!document.hidden);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const cursorPosRef = useRef({ x: -1, y: -1 });
    const dragStartRef = useRef<CanvasPoint | null>(null);
    const suppressClickRef = useRef(false);
    const streamingRef = useRef(false);
    const lastPreviewImageUrlRef = useRef<string>(undefined);
    const fitMode = "fit" as StreamFitMode;
    const fps = DefaultStreamFps;
    const quality = DefaultStreamQuality;
    const frameSizeRef = useRef<{ width: number; height: number } | undefined>(undefined);
    const { waterflowActive, markers } = useAgentOverlays("desktop");

    useEffect(() => {
        let intersects = true;
        const updateVisibility = () => setSurfaceVisible(intersects && !document.hidden);
        const observer =
            typeof IntersectionObserver === "function"
                ? new IntersectionObserver(([entry]) => {
                      intersects = entry.isIntersecting;
                      updateVisibility();
                  })
                : null;
        if (surfaceRef.current) observer?.observe(surfaceRef.current);
        document.addEventListener("visibilitychange", updateVisibility);
        updateVisibility();
        return () => {
            observer?.disconnect();
            document.removeEventListener("visibilitychange", updateVisibility);
        };
    }, [status, transport]);

    useEffect(() => {
        return subscribeAgentActivityStream((activity) => {
            const activityAppName = activity.appname?.trim().toLowerCase();
            const currentAppName = appName.trim().toLowerCase();
            const targetsView =
                activity.blockid === model.blockId || (currentAppName.length > 0 && activityAppName === currentAppName);
            const previewImageUrl = lastPreviewImageUrlRef.current;
            if (activity.surface !== "desktop" || activity.previewimageurl || !targetsView || !previewImageUrl) {
                return;
            }
            reportDesktopPetActivity(
                { kind: "tool", detail: activity.detail ?? `Controlling ${appName}`, previewImageUrl },
                model.blockId,
                undefined,
                {
                    ...activity,
                    blockid: model.blockId,
                    surface: "desktop",
                    appname: activity.appname ?? appName,
                    previewimageurl: previewImageUrl,
                }
            );
        });
    }, [appName, model.blockId]);

    useEffect(() => {
        model.startStream(nativeSurfaceV2Enabled).catch(console.error);
        return () => {
            model.dispose();
        };
    }, [model, nativeSurfaceV2Enabled]);

    useEffect(() => {
        if (!surfaceVisible || !streamUrl || status !== "streaming" || transport !== "legacy-snapshot") {
            streamingRef.current = false;
            if (transport === "legacy-snapshot") {
                lastPreviewImageUrlRef.current = undefined;
            }
            return;
        }

        streamingRef.current = true;
        let disposed = false;
        let frameTimer: ReturnType<typeof setTimeout>;
        const abortController = new AbortController();
        const scheduleFrame = (delay = Math.max(80, Math.round(1000 / fps))) => {
            if (!disposed) frameTimer = setTimeout(pollFrame, delay);
        };

        const pollFrame = async () => {
            if (!streamingRef.current || disposed) return;
            try {
                const response = await fetch(`${streamUrl}/screenshot?quality=${quality}`, {
                    signal: abortController.signal,
                });
                if (!response.ok) throw new Error("HTTP " + response.status);
                const data = await response.json();
                if (disposed) return;
                if (!data.image) {
                    scheduleFrame(500);
                    return;
                }

                const previewImageUrl = `data:image/png;base64,${data.image}`;
                lastPreviewImageUrlRef.current = previewImageUrl;
                const img = new Image();
                img.onload = () => {
                    if (disposed) return;
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;

                    drawAppStreamFrame(ctx, img);
                    if (
                        frameSizeRef.current?.width !== img.naturalWidth ||
                        frameSizeRef.current?.height !== img.naturalHeight
                    ) {
                        frameSizeRef.current = { width: img.naturalWidth, height: img.naturalHeight };
                        window.dispatchEvent(
                            new CustomEvent<AppStreamFrameSize>(AppStreamFrameSizeEvent, {
                                detail: { blockId: model.blockId, width: img.naturalWidth, height: img.naturalHeight },
                            })
                        );
                    }

                    const cursor = cursorPosRef.current;
                    if (cursor.x >= 0 && cursor.y >= 0) {
                        ctx.beginPath();
                        ctx.arc(cursor.x, cursor.y, 14, 0, Math.PI * 2);
                        ctx.fillStyle = "rgba(30, 144, 255, 0.14)";
                        ctx.fill();
                        ctx.strokeStyle = "rgba(30, 144, 255, 0.9)";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.arc(cursor.x, cursor.y, 3, 0, Math.PI * 2);
                        ctx.fillStyle = "#1E90FF";
                        ctx.fill();
                    }

                    if (!disposed) {
                        scheduleFrame();
                    }
                };
                img.onerror = () => scheduleFrame(500);
                img.src = previewImageUrl;
            } catch {
                if (!disposed) {
                    scheduleFrame(500);
                }
            }
        };

        void pollFrame();

        return () => {
            disposed = true;
            clearTimeout(frameTimer);
            abortController.abort();
            streamingRef.current = false;
        };
    }, [appName, fps, model.blockId, quality, status, streamUrl, surfaceVisible, transport]);

    useEffect(() => {
        if (mediaStream == null) return;
        for (const track of mediaStream.getVideoTracks()) track.enabled = surfaceVisible;
        return () => {
            for (const track of mediaStream.getVideoTracks()) track.enabled = true;
        };
    }, [mediaStream, surfaceVisible]);

    useEffect(() => {
        const video = videoRef.current;
        if (
            !surfaceVisible ||
            video == null ||
            mediaStream == null ||
            transport !== "native-media" ||
            status !== "streaming"
        ) {
            return;
        }
        video.srcObject = mediaStream;
        let disposed = false;
        let previewTimer: number | undefined;

        const publishFrameSize = () => {
            if (disposed || video.videoWidth <= 0 || video.videoHeight <= 0) return;
            if (
                frameSizeRef.current?.width === video.videoWidth &&
                frameSizeRef.current?.height === video.videoHeight
            ) {
                return;
            }
            frameSizeRef.current = { width: video.videoWidth, height: video.videoHeight };
            window.dispatchEvent(
                new CustomEvent<AppStreamFrameSize>(AppStreamFrameSizeEvent, {
                    detail: { blockId: model.blockId, width: video.videoWidth, height: video.videoHeight },
                })
            );
        };

        const previewCanvas = document.createElement("canvas");
        const capturePreview = () => {
            if (disposed || video.videoWidth <= 0 || video.videoHeight <= 0) return;

            const scale = Math.min(1, 960 / video.videoWidth);
            const width = Math.max(1, Math.round(video.videoWidth * scale));
            const height = Math.max(1, Math.round(video.videoHeight * scale));
            if (previewCanvas.width !== width) previewCanvas.width = width;
            if (previewCanvas.height !== height) previewCanvas.height = height;
            const context = previewCanvas.getContext("2d");
            if (context == null) return;
            context.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
            lastPreviewImageUrlRef.current = previewCanvas.toDataURL("image/jpeg", 0.72);
        };

        const handleLoadedMetadata = () => {
            if (previewTimer != null) window.clearInterval(previewTimer);
            publishFrameSize();
            void video.play().catch(() => {});
            capturePreview();
            previewTimer = window.setInterval(capturePreview, 1000);
        };

        video.addEventListener("loadedmetadata", handleLoadedMetadata);
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            handleLoadedMetadata();
        }

        return () => {
            disposed = true;
            video.removeEventListener("loadedmetadata", handleLoadedMetadata);
            if (previewTimer != null) {
                window.clearInterval(previewTimer);
            }
            video.pause();
            video.srcObject = null;
        };
    }, [mediaStream, model.blockId, status, surfaceVisible, transport]);

    const getStreamPoint = useCallback(
        (clientX: number, clientY: number, target: HTMLElement): CanvasPoint => {
            const frameSize = frameSizeRef.current;
            if (frameSize == null) return { x: 0, y: 0 };
            return clientPointToCanvasPoint(
                clientX,
                clientY,
                target.getBoundingClientRect(),
                frameSize.width,
                frameSize.height,
                fitMode
            );
        },
        [fitMode]
    );

    const handleClick = useCallback(
        (clientX: number, clientY: number, target: HTMLElement) => {
            if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
            }
            const point = getStreamPoint(clientX, clientY, target);
            cursorPosRef.current = point;
            void model.sendClick(point.x, point.y);
        },
        [getStreamPoint, model]
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            e.currentTarget.focus();
            dragStartRef.current = getStreamPoint(e.clientX, e.clientY, e.currentTarget);
            e.currentTarget.setPointerCapture(e.pointerId);
        },
        [getStreamPoint]
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent<HTMLElement>) => {
            const start = dragStartRef.current;
            dragStartRef.current = null;
            if (start == null) return;
            const end = getStreamPoint(e.clientX, e.clientY, e.currentTarget);
            if (Math.hypot(end.x - start.x, end.y - start.y) < 6) return;
            suppressClickRef.current = true;
            void model.sendDrag(start.x, start.y, end.x, end.y);
        },
        [getStreamPoint, model]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLElement>) => {
            e.preventDefault();
            const keys = [e.metaKey && "Meta", e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift", e.key]
                .filter(Boolean)
                .join("+");
            void model.sendKeyPress(keys);
        },
        [model]
    );

    const handlePaste = useCallback(
        (e: React.ClipboardEvent<HTMLElement>) => {
            e.preventDefault();
            void model.sendPaste(e.clipboardData.getData("text"));
        },
        [model]
    );

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLElement>) => {
            cursorPosRef.current = getStreamPoint(e.clientX, e.clientY, e.currentTarget);
        },
        [getStreamPoint]
    );

    const handleContextMenu = useCallback(
        (e: React.MouseEvent<HTMLElement>) => {
            e.preventDefault();
            const point = getStreamPoint(e.clientX, e.clientY, e.currentTarget);
            void model.sendClick(point.x, point.y, "right");
        },
        [getStreamPoint, model]
    );

    const handleWheel = useCallback(
        (e: React.WheelEvent<HTMLElement>) => {
            e.preventDefault();
            const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const delta = horizontal ? e.deltaX : e.deltaY;
            const direction = horizontal ? (delta > 0 ? "right" : "left") : delta > 0 ? "down" : "up";
            const scrollCount = Math.min(8, Math.max(1, Math.round(Math.abs(delta) / 80)));
            void model.sendScroll(direction, scrollCount);
        },
        [model]
    );

    if (status === "starting") {
        return (
            <div className="flex h-full w-full items-center justify-center bg-black text-zinc-400 text-sm">
                <div className="w-[320px] rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-center gap-2 text-zinc-200">
                        <i className="fa-solid fa-spinner fa-spin text-accent" />
                        Starting {appName}...
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-accent/60" />
                    </div>
                    <div className="mt-3 text-xs text-zinc-500">Connecting to native app stream</div>
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="flex h-full w-full items-center justify-center bg-black text-red-400 text-sm">
                {error || "Failed to start stream"}
            </div>
        );
    }

    if (status === "idle") {
        return (
            <div className="flex h-full w-full items-center justify-center bg-black text-zinc-500 text-sm">
                App stream closed
            </div>
        );
    }

    return (
        <div ref={surfaceRef} className="relative flex h-full w-full flex-col bg-black overflow-hidden">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                {transport === "native-media" && mediaStream != null ? (
                    <video
                        ref={videoRef}
                        tabIndex={0}
                        muted
                        playsInline
                        autoPlay
                        aria-label={`${appName} live application stream`}
                        className="block max-h-full max-w-full cursor-default object-contain outline-none"
                        onClick={(e) => handleClick(e.clientX, e.clientY, e.currentTarget)}
                        onMouseMove={handleMouseMove}
                        onContextMenu={handleContextMenu}
                        onPointerDown={handlePointerDown}
                        onPointerUp={handlePointerUp}
                        onWheel={handleWheel}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                    />
                ) : (
                    <canvas
                        ref={canvasRef}
                        tabIndex={0}
                        aria-label={`${appName} compatibility application stream`}
                        className="block max-h-full max-w-full cursor-none object-contain outline-none"
                        onClick={(e) => handleClick(e.clientX, e.clientY, e.currentTarget)}
                        onMouseMove={handleMouseMove}
                        onContextMenu={handleContextMenu}
                        onPointerDown={handlePointerDown}
                        onPointerUp={handlePointerUp}
                        onWheel={handleWheel}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                    />
                )}
                {nativeSurfaceV2Enabled && captureFallbackReason ? (
                    <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-md">
                        Compatibility capture
                    </div>
                ) : null}
                <AgentSurfaceCursor surface="desktop" blockId={model.blockId} />
            </div>
        </div>
    );
}
