import type { HermesKronTermSurface } from "@hermes/global";
import { atom } from "nanostores";

export const $hudSurfaceIslandsExpanded = atom(true);
export const $hudSelectedSurfaceId = atom<string | undefined>(undefined);

export const HudSurfaceIslandsToggleEvent = "kronterm-hud-surface-islands-toggle";
export const HudSurfaceQueryKey = ["plugin:kronterm-surfaces", "surfaces"] as const;

export function selectHudSurface(
    surfaces: readonly HermesKronTermSurface[],
    selectedId?: string
): HermesKronTermSurface {
    return (
        surfaces.find((surface) => surface.id === selectedId) ??
        surfaces.find((surface) => surface.active) ??
        surfaces.find((surface) => surface.focused) ??
        surfaces[0]
    );
}

export function hudSurfaceLabel(surface: HermesKronTermSurface): string {
    const page = surface.browserTabs?.find((tab) => tab.active);
    return page?.title || surface.title;
}

export function hudSurfaceIcon(view: string): string {
    if (view === "web" || view === "webview") return "globe";
    if (view === "term") return "terminal";
    if (view === "sandbox") return "server-environment";
    if (["aifilediff", "diff"].includes(view)) return "diff";
    if (["file", "preview", "codeeditor"].includes(view)) return "files";
    return "multiple-windows";
}
