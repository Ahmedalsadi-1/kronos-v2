import { Codicon } from "@hermes/components/ui/codicon";
import { host } from "@hermes/sdk";
import { useStore } from "@nanostores/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import {
    $hudSelectedSurfaceId,
    $hudSurfaceIslandsExpanded,
    hudSurfaceIcon,
    HudSurfaceIslandsToggleEvent,
    hudSurfaceLabel,
    HudSurfaceQueryKey,
    selectHudSurface,
} from "./surface-islands-model";

const ActionClass =
    "min-h-8 cursor-pointer rounded-lg px-2 text-xs hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2";

export function HudSurfaceIslands() {
    const expanded = useStore($hudSurfaceIslandsExpanded);
    const selectedId = useStore($hudSelectedSurfaceId);
    const [interactive, setInteractive] = useState(false);
    const [large, setLarge] = useState(false);
    const [error, setError] = useState("");
    const panelId = useId();
    const inputQueue = useRef(Promise.resolve());
    const activeInputId = useRef<string>(undefined);
    const bridge = window.hermesDesktop?.krontermSurfaces;
    const { data: surfaces = [] } = useQuery({
        queryKey: HudSurfaceQueryKey,
        queryFn: host.krontermSurfaces.list,
        enabled: Boolean(bridge),
        refetchInterval: 1000,
        refetchIntervalInBackground: false,
    });
    const surface =
        selectedId == null
            ? (surfaces.find((surface) => surface.focused) ?? selectHudSurface(surfaces))
            : selectHudSurface(surfaces, selectedId);
    activeInputId.current = interactive && expanded ? surface?.id : undefined;
    const {
        data: preview,
        isFetching,
        error: previewError,
        refetch,
    } = useQuery({
        queryKey: [...HudSurfaceQueryKey, "preview", surface?.id ?? "none"],
        queryFn: () => host.krontermSurfaces.preview(surface.id),
        enabled: Boolean(bridge && surface && expanded),
        refetchInterval: expanded && surface ? 1500 : false,
        refetchIntervalInBackground: false,
        retry: false,
    });
    useEffect(() => {
        const toggle = () => $hudSurfaceIslandsExpanded.set(!$hudSurfaceIslandsExpanded.get());
        window.addEventListener(HudSurfaceIslandsToggleEvent, toggle);
        const off = bridge?.onDisplay?.(({ blockId, expanded: next }) => {
            $hudSelectedSurfaceId.set(blockId);
            $hudSurfaceIslandsExpanded.set(next);
        });
        return () => {
            window.removeEventListener(HudSurfaceIslandsToggleEvent, toggle);
            off?.();
        };
    }, [bridge]);
    useEffect(() => {
        setError("");
        setInteractive(false);
    }, [surface?.id, expanded]);
    useEffect(() => {
        if (!surface) return;
        if (selectedId !== surface.id) $hudSelectedSurfaceId.set(surface.id);
        void bridge
            ?.select?.(surface.id, expanded)
            .then((ok) => {
                if (!ok) setError("HUD widget is not ready. Retry shortly.");
            })
            .catch((e) => setError(e.message));
    }, [surface?.id, expanded, bridge]);
    if (!bridge || !surface) return null;
    const label = hudSurfaceLabel(surface);
    const previewUrl = preview || surface.previewImageUrl;
    const control = (input: Parameters<NonNullable<typeof bridge.control>>[1]) => {
        if (!bridge.control) return;
        const id = surface.id;
        inputQueue.current = inputQueue.current
            .then(async () => {
                if (activeInputId.current !== id) return;
                await bridge.control(id, input);
                if (activeInputId.current === id) {
                    setError("");
                    void refetch();
                }
            })
            .catch((e) => {
                if (activeInputId.current === id) setError(e.message);
            });
    };
    const openWidget = async () => {
        try {
            const result = await bridge.focus(surface.id);
            if (!result.ok) throw new Error(result.error || "Could not open widget");
            setError("");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not open widget");
        }
    };
    return (
        <section
            aria-label="Live workspace widgets"
            data-hud-surface-islands=""
            className="relative z-10 mx-2 mb-2 shrink-0 overflow-hidden rounded-2xl bg-[#121416] text-(--ui-text-primary)"
        >
            <div className="flex items-center gap-1 bg-[radial-gradient(ellipse_at_40%_60%,#57294466,transparent_65%)] px-3 py-3">
                <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:outline-2"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => $hudSurfaceIslandsExpanded.set(!expanded)}
                >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10">
                        <Codicon name={hudSurfaceIcon(surface.view)} size="1.25rem" />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{label}</span>
                        {surface.location && (
                            <span
                                className="block truncate text-xs text-(--ui-text-secondary)"
                                title={surface.location}
                            >
                                {surface.location}
                            </span>
                        )}
                    </span>
                </button>
                {surfaces.length > 1 && (
                    <div
                        className="flex max-w-[40%] shrink-0 items-center overflow-x-auto"
                        aria-label="Preview open widgets"
                    >
                        {surfaces.map((candidate, index) => (
                            <button
                                key={candidate.id}
                                type="button"
                                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded focus-visible:outline-2"
                                data-active={candidate.id === surface.id ? "true" : undefined}
                                aria-current={candidate.id === surface.id ? "true" : undefined}
                                aria-label={`Show widget ${index + 1} of ${surfaces.length}: ${hudSurfaceLabel(candidate)}`}
                                onClick={() => {
                                    $hudSelectedSurfaceId.set(candidate.id);
                                    void bridge.select?.(candidate.id, expanded);
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`size-2 rounded-full ${candidate.id === surface.id ? "bg-white" : "bg-white/40"}`}
                                />
                            </button>
                        ))}
                    </div>
                )}
            </div>
            {expanded && (
                <div id={panelId} className="px-2 pb-2">
                    <div
                        tabIndex={interactive ? 0 : -1}
                        data-hud-interactive={interactive ? "true" : undefined}
                        role={interactive ? "application" : undefined}
                        aria-label={interactive ? `${label} interactive widget` : undefined}
                        className={`flex items-center justify-center overflow-hidden rounded-xl bg-black/30 focus-visible:outline-2 ${large ? "h-80 max-h-[50vh]" : "h-44 max-h-[30vh]"}`}
                        onKeyDown={(event) => {
                            if (!interactive || event.nativeEvent.isComposing) return;
                            event.stopPropagation();
                            if (event.key === "Escape") {
                                event.preventDefault();
                                setInteractive(false);
                                return;
                            }
                            event.preventDefault();
                            if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey)
                                control({ action: "type", text: event.key });
                            else
                                control({
                                    action: "press",
                                    keys: [
                                        ...(event.metaKey ? ["Meta"] : []),
                                        ...(event.ctrlKey ? ["Control"] : []),
                                        ...(event.altKey ? ["Alt"] : []),
                                        ...(event.shiftKey ? ["Shift"] : []),
                                        event.key,
                                    ],
                                });
                        }}
                        onCompositionEnd={(event) => {
                            if (interactive && event.data) control({ action: "type", text: event.data });
                        }}
                        onPaste={(event) => {
                            if (interactive) {
                                event.preventDefault();
                                event.stopPropagation();
                                control({ action: "type", text: event.clipboardData.getData("text") });
                            }
                        }}
                    >
                        {previewUrl ? (
                            <img
                                src={previewUrl}
                                alt={`${label} widget preview`}
                                draggable={false}
                                className={`h-full w-full object-contain cursor-pointer`}
                                onClick={(event) => {
                                    if (!interactive) {
                                        void openWidget();
                                        return;
                                    }
                                    event.currentTarget.parentElement.focus();
                                    const image = event.currentTarget;
                                    const bounds = image.getBoundingClientRect();
                                    const scale = Math.min(
                                        bounds.width / image.naturalWidth,
                                        bounds.height / image.naturalHeight
                                    );
                                    const width = image.naturalWidth * scale,
                                        height = image.naturalHeight * scale;
                                    const x = (event.clientX - bounds.x - (bounds.width - width) / 2) / width;
                                    const y = (event.clientY - bounds.y - (bounds.height - height) / 2) / height;
                                    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) control({ action: "click", x, y });
                                }}
                                onWheel={(event) => {
                                    if (interactive) {
                                        event.stopPropagation();
                                        control({ action: "scroll", amount: event.deltaY });
                                    }
                                }}
                            />
                        ) : (
                            <p role="status" className="px-3 text-center text-xs text-(--ui-text-secondary)">
                                {previewError ? "Preview unavailable. Retry to reconnect." : "Loading widget preview…"}
                            </p>
                        )}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-(--ui-text-secondary)">
                        <span>
                            {previewError && previewUrl
                                ? "Last preview · reconnecting"
                                : isFetching
                                  ? "Updating preview…"
                                  : interactive
                                    ? "Interactive · Esc to leave"
                                    : "Live preview"}
                        </span>
                        {previewError && (
                            <button type="button" className={ActionClass} onClick={() => void refetch()}>
                                Retry
                            </button>
                        )}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                        <button
                            type="button"
                            className={ActionClass}
                            aria-pressed={large}
                            onClick={() => setLarge(!large)}
                        >
                            {large ? "Compact preview" : "Enlarge preview"}
                        </button>
                        <button type="button" className={ActionClass} onClick={() => void openWidget()}>
                            Open widget island
                        </button>
                    </div>
                    {bridge.control && (
                        <button
                            type="button"
                            className={`${ActionClass} mt-1 w-full bg-white/5`}
                            aria-pressed={interactive}
                            onClick={() => setInteractive(!interactive)}
                        >
                            {interactive ? "Leave widget controls" : "Control widget"}
                        </button>
                    )}
                </div>
            )}
            {error && (
                <p role="alert" className="px-3 pb-2 text-xs">
                    {error}
                </p>
            )}
        </section>
    );
}
