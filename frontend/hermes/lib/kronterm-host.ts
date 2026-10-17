import { createContext, createElement, type ReactNode, useContext } from "react";

const KronTermWidgetFlag = "__KRONTERM_HERMES_WIDGET__";
const KronTermHudFlag = "__KRONTERM_HERMES_HUD__";
const KronTermWebFlag = "__KRONTERM_HERMES_WEB__";

type KronTermHostWindow = Window & {
    [KronTermWidgetFlag]?: boolean;
    [KronTermHudFlag]?: boolean;
    [KronTermWebFlag]?: boolean;
};

export function markKronTermWidgetHost(): void {
    if (typeof window !== "undefined") {
        (window as KronTermHostWindow)[KronTermWidgetFlag] = true;
    }
}

export function isKronTermWidgetHost(): boolean {
    return typeof window !== "undefined" && Boolean((window as KronTermHostWindow)[KronTermWidgetFlag]);
}

export function markKronTermHudHost(enabled: boolean): void {
    if (typeof window !== "undefined") {
        (window as KronTermHostWindow)[KronTermHudFlag] = enabled;
    }
}

export function isKronTermHudHost(): boolean {
    return typeof window !== "undefined" && Boolean((window as KronTermHostWindow)[KronTermHudFlag]);
}

export function markKronTermWebHost(enabled: boolean): void {
    if (typeof window !== "undefined") {
        (window as KronTermHostWindow)[KronTermWebFlag] = enabled;
    }
}

export function isKronTermWebHost(): boolean {
    return typeof window !== "undefined" && Boolean((window as KronTermHostWindow)[KronTermWebFlag]);
}

export type HermesHostMode = "kronterm" | "hud" | "panel" | "web-fullscreen";

export interface HermesShellMode {
    hostMode: HermesHostMode;
    embedded: boolean;
    hudMode: boolean;
    panelMode: boolean;
    webMode: boolean;
}

const HermesShellModeContext = createContext<HermesShellMode | null>(null);

export function HermesShellModeProvider({
    children,
    hostMode,
    hudMode,
    panelMode = false,
    webMode = false,
}: {
    children: ReactNode;
    hostMode?: HermesHostMode;
    hudMode: boolean;
    panelMode?: boolean;
    webMode?: boolean;
}) {
    const resolvedHostMode =
        hostMode ?? (webMode ? "web-fullscreen" : hudMode ? "hud" : panelMode ? "panel" : "kronterm");
    return createElement(HermesShellModeContext.Provider, {
        value: {
            hostMode: resolvedHostMode,
            embedded: resolvedHostMode !== "kronterm",
            hudMode: resolvedHostMode === "hud",
            panelMode: resolvedHostMode === "panel",
            webMode: resolvedHostMode === "web-fullscreen",
        },
        children,
    });
}

export function useHermesShellMode(): HermesShellMode {
    const mode = useContext(HermesShellModeContext);
    return (
        mode ?? {
            hostMode: isKronTermHudHost() ? "hud" : "kronterm",
            embedded: isKronTermHudHost(),
            hudMode: isKronTermHudHost(),
            panelMode: false,
            webMode: false,
        }
    );
}
