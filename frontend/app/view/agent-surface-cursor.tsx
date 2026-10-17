import { getApi } from "@/store/global";
import { mountAgentCursor } from "@/util/agent-cursor-feedback";
import { useEffect, useRef } from "react";
import { useAgentOverlays } from "./use-agent-overlays";
import { useReducedAgentMotion } from "./use-reduced-agent-motion";

export function AgentSurfaceCursor({
    blockId,
    surface,
    surfaceId,
    coordinates = "local",
}: {
    blockId?: string;
    surface?: string;
    surfaceId?: string;
    coordinates?: "local" | "normalized" | "capture";
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
            target = {
                x: rect.left - parent.left + (cursorPoint.x / width) * rect.width,
                y: rect.top - parent.top + (cursorPoint.y / height) * rect.height,
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
            style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 50 }}
        />
    );
}
