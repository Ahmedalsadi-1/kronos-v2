import { useEffect, useRef } from "react";
import type { Surface } from "../types";
import { SurfaceIcon } from "./workspace-surface-card";

export function selectDockSurface(
    surfaces: Surface[],
    lastUsedId?: string,
    agentSurfaceId?: string
): string | undefined {
    const usable = surfaces.filter((surface) => surface.kind !== "run" && surface.status !== "closed");
    if (agentSurfaceId && usable.some((surface) => surface.id === agentSurfaceId)) return agentSurfaceId;
    const working = usable
        .filter((surface) => surface.status === "working")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (working) return working.id;
    if (lastUsedId && usable.some((surface) => surface.id === lastUsedId)) return lastUsedId;
    return [...usable].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
}

export function ComposerWidgetDock({
    surfaces,
    lastUsedId,
    agentSurfaceId,
    onOpen,
}: {
    surfaces: Surface[];
    lastUsedId?: string;
    agentSurfaceId?: string;
    onOpen: (surface: Surface) => void;
}) {
    const widgets = surfaces.filter((surface) => surface.kind !== "run" && surface.status !== "closed");
    const active = selectDockSurface(widgets, lastUsedId, agentSurfaceId);
    const dock = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const element = dock.current?.querySelector<HTMLElement>(".composer-widget-slot.is-active");
        if (!element || !dock.current) return;
        dock.current.scrollTo?.({
            left: Math.max(0, element.offsetLeft - (dock.current.clientWidth - element.offsetWidth) / 2),
            behavior: "smooth",
        });
    }, [active]);
    if (!widgets.length) return null;
    return (
        <div className="composer-widget-dock" ref={dock} role="list" aria-label="Open widgets">
            {widgets.map((surface) => (
                <div
                    role="listitem"
                    key={surface.id}
                    className={`composer-widget-slot ${surface.id === active ? "is-active" : ""}`}
                >
                    <button
                        type="button"
                        className={`composer-widget kind-${surface.kind}`}
                        aria-label={`Open ${surface.title}${surface.id === active ? ", active widget" : ""}`}
                        title={surface.title}
                        onClick={() => onOpen(surface)}
                    >
                        {surface.previewUrl ? (
                            <img src={surface.previewUrl} alt="" />
                        ) : surface.localWidget === "browser" && surface.url?.startsWith("https://") ? (
                            <iframe
                                title={`Preview of ${surface.title}`}
                                src={surface.url}
                                sandbox=""
                                tabIndex={-1}
                                aria-hidden="true"
                                referrerPolicy="no-referrer"
                            />
                        ) : surface.previewText ? (
                            <pre aria-hidden="true">{surface.previewText}</pre>
                        ) : (
                            <span className="composer-widget-empty">
                                <SurfaceIcon surface={surface} />
                                <small>{surface.subtitle || surface.title}</small>
                            </span>
                        )}
                        <span className="composer-widget-icon">
                            <SurfaceIcon surface={surface} />
                        </span>
                        <span
                            className={`composer-widget-status status-${surface.status}`}
                            aria-label={surface.status}
                        />
                    </button>
                </div>
            ))}
        </div>
    );
}
