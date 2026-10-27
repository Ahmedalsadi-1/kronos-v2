import { getApi } from "@/store/global";
import { mountAgentCursor } from "@/util/agent-cursor-feedback";
import { useEffect, useRef, type RefObject } from "react";
import { useAgentOverlays } from "./use-agent-overlays";
import { useBrowserAgentCursor } from "./use-browser-agent-cursor";
import { useReducedAgentMotion } from "./use-reduced-agent-motion";

export function AgentSurfaceCursor({
    blockId,
    surface,
    surfaceId,
    coordinates = "local",
    webviewRef,
}: {
    blockId?: string;
    surface?: string;
    surfaceId?: string;
    coordinates?: "local" | "normalized" | "capture";
    webviewRef?: RefObject<Electron.WebviewTag>;
}) {
    const { cursorPoint, cursorActive, clickFlashCount, cursorLabel } = useAgentOverlays(surface, blockId, surfaceId);
    const cursorOwner = `${surface ?? "surface"}:${blockId ?? "block"}:${surfaceId ?? ""}`;
    const element = useRef<HTMLDivElement>(null);
    const controller = useRef<ReturnType<typeof mountAgentCursor>>(null);
    const lastClick = useRef<number>(undefined);
    useEffect(() => {
        let lastReport = -Infinity;
        controller.current = mountAgentCursor(element.current, undefined, undefined, (point) => {
            const now = performance.now();
            if (now - lastReport < 40) return;
            lastReport = now;
            const host = element.current;
            const rect = host.getBoundingClientRect();
            const scaleX = host.clientWidth ? rect.width / host.clientWidth : 1;
            const scaleY = host.clientHeight ? rect.height / host.clientHeight : 1;
            getApi()?.reportAgentCursor?.(
                { x: rect.left + point.x * scaleX, y: rect.top + point.y * scaleY },
                cursorOwner
            );
        });
        return () => {
            controller.current?.destroy();
            getApi()?.reportAgentCursor?.(null, cursorOwner);
        };
    }, [cursorOwner]);
    const reducedMotion = useReducedAgentMotion();
    useBrowserAgentCursor(webviewRef, cursorPoint, cursorActive, cursorLabel, clickFlashCount, reducedMotion);
    useEffect(() => {
        if (!cursorActive || !cursorPoint || !element.current) {
            controller.current?.clear();
            getApi()?.reportAgentCursor?.(null, cursorOwner);
            lastClick.current = undefined;
            return;
        }
        let target = cursorPoint;
        if (coordinates !== "local") {
            const host = element.current.parentElement;
            const capture = host.querySelector<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement>(
                "img, video, canvas:not([data-agent-cursor])"
            );
            if (!capture) return;
            const rect = capture.getBoundingClientRect(),
                parent = host.getBoundingClientRect();
            const width =
                coordinates === "normalized"
                    ? 1
                    : "naturalWidth" in capture
                      ? capture.naturalWidth
                      : "videoWidth" in capture
                        ? capture.videoWidth
                        : capture.width;
            const height =
                coordinates === "normalized"
                    ? 1
                    : "naturalHeight" in capture
                      ? capture.naturalHeight
                      : "videoHeight" in capture
                        ? capture.videoHeight
                        : capture.height;
            if (!width || !height) return;
            const scale = coordinates === "capture" ? Math.min(rect.width / width, rect.height / height) : 1;
            const renderedWidth = coordinates === "capture" ? width * scale : rect.width;
            const renderedHeight = coordinates === "capture" ? height * scale : rect.height;
            target = {
                x: rect.left - parent.left + (rect.width - renderedWidth) / 2 + (cursorPoint.x / width) * renderedWidth,
                y: rect.top - parent.top + (rect.height - renderedHeight) / 2 + (cursorPoint.y / height) * renderedHeight,
            };
        }
        const click = clickFlashCount != null && clickFlashCount !== lastClick.current;
        lastClick.current = clickFlashCount;
        controller.current?.update(target, cursorLabel, click, reducedMotion);
    }, [cursorActive, cursorPoint, reducedMotion, coordinates, clickFlashCount, cursorLabel, cursorOwner]);
    return (
        <div
            ref={element}
            aria-hidden="true"
            style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                overflow: "hidden",
                zIndex: 50,
                visibility: webviewRef ? "hidden" : "visible",
            }}
        />
    );
}
