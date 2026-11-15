import { globalStore } from "@/app/store/jotaiStore";
import { useTabModelMaybe } from "@/app/store/tab-model";
import { requestPenEditor } from "@/app/tab/os-pen-editor-bridge";
import { KronTermSettingsMount } from "@/app/view/hermes/kronterm-settings-mount";
import { KronSettingsViewModel, SETTINGS_SECTIONS } from "@/app/view/kronsettings/kronsettings-model";
import { useReducedAgentMotion } from "@/app/view/use-reduced-agent-motion";
import { WaveEnvContext } from "@/app/waveenv/waveenv";
import { WorkspaceWallpaperSettings } from "@/app/workspace/workspace-wallpaper";
import { getApi } from "@/store/global";
import App from "@hermes/app";
import { setTerminalTakeover } from "@hermes/app/right-sidebar/store";
import { KronTermSettingsHostProvider } from "@hermes/app/settings/kronterm-settings-host";
import { PenCanvasSettings, type PenCanvasSettingsRequest } from "@hermes/app/settings/pen-canvas-settings";
import { RootErrorBoundary } from "@hermes/components/error-boundary";
import { removeTreePane, resetLayoutTree, revealTreePane } from "@hermes/components/pane-shell/tree/store";
import { Button } from "@hermes/components/ui/button";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { I18nProvider } from "@hermes/i18n";
import { HermesShellModeProvider, markKronTermHudHost, type HermesHostMode } from "@hermes/lib/kronterm-host";
import { queryClient } from "@hermes/lib/query-client";
import { ensureWebModeAgentProfile } from "@hermes/lib/web-mode-profile";
import { setEmbeddedHudMode } from "@hermes/store/hud";
import { setFileBrowserOpen, setSidebarOpen } from "@hermes/store/layout";
import { selectProfile } from "@hermes/store/profile";
import { $selectedStoredSessionId } from "@hermes/store/session";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { QueryClientProvider } from "@tanstack/react-query";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HashRouter } from "react-router";

const HermesDesignWidth = 1440;
const HermesDesignHeight = 900;
const HermesMaximumScale = 1;
const HermesMinimumScale = 0.65;

export interface HermesAppProps {
    kronSettingsModel?: KronSettingsViewModel;
    hostMode?: HermesHostMode;
    hudMode?: boolean;
    panelMode?: boolean;
    webMode?: boolean;
    dockedChat?: boolean;
    canvasRuntimeOnly?: boolean;
}

export function HermesApp({
    kronSettingsModel,
    hostMode,
    hudMode = false,
    panelMode = false,
    webMode = false,
    dockedChat = false,
    canvasRuntimeOnly = false,
}: HermesAppProps) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(HermesMaximumScale);
    const [runtimeError, setRuntimeError] = useState("");
    const [retrying, setRetrying] = useState(false);
    useEffect(() => {
        const api = getApi();
        const offFailure = api.onHermesRuntimeFailure(({ message }) => setRuntimeError(message));
        const offConnection = api.onHermesConnection(() => setRuntimeError(""));
        return () => {
            offFailure();
            offConnection();
        };
    }, []);
    const waveEnv = useContext(WaveEnvContext);
    const tabModel = useTabModelMaybe();
    const reducedMotion = useReducedAgentMotion();
    const hudSettingsModel = useMemo(() => {
        if (kronSettingsModel) return kronSettingsModel;
        if (!hudMode || !waveEnv || !tabModel) return null;
        const blockId = globalStore.get(tabModel.tabAtom)?.blockids?.[0];
        if (!blockId) return null;
        return new KronSettingsViewModel({ blockId, nodeModel: null, tabModel, waveEnv });
    }, [kronSettingsModel, hudMode, waveEnv, tabModel]);
    const kronTermSettingsHost = useMemo(() => {
        if (!hudSettingsModel) return null;
        const request: PenCanvasSettingsRequest = (method, params) =>
            requestPenEditor(hudSettingsModel.tabModel.tabId, method, params);
        return {
            appearance: { reducedMotion },
            renderAppearance: () => <WorkspaceWallpaperSettings />,
            sections: [...SETTINGS_SECTIONS.map(({ id, label }) => ({ id, label })), { id: "canvas", label: "Canvas" }],
            renderSection: (sectionId: string) =>
                sectionId === "canvas" ? (
                    <PenCanvasSettings request={request} />
                ) : (
                    <KronTermSettingsMount model={hudSettingsModel} sectionId={sectionId} />
                ),
        } as const;
    }, [hudSettingsModel, reducedMotion]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }

        if (hudMode || panelMode) {
            setScale(HermesMaximumScale);
            return;
        }

        const updateScale = () => {
            const { width, height } = viewport.getBoundingClientRect();
            if (width <= 0 || height <= 0) {
                return;
            }

            const nextScale = Math.max(
                HermesMinimumScale,
                Math.min(HermesMaximumScale, width / HermesDesignWidth, height / HermesDesignHeight)
            );
            setScale((currentScale) => (Math.abs(currentScale - nextScale) < 0.001 ? currentScale : nextScale));
        };

        updateScale();
        const observer = new ResizeObserver(updateScale);
        observer.observe(viewport);

        return () => observer.disconnect();
    }, [hudMode, panelMode]);

    useLayoutEffect(() => {
        markKronTermHudHost(hudMode);
        setEmbeddedHudMode(hudMode && !dockedChat);
        return () => {
            markKronTermHudHost(false);
            setEmbeddedHudMode(false);
        };
    }, [hudMode, dockedChat]);

    useEffect(() => {
        setTerminalTakeover(false);
        if (hudMode || panelMode) {
            return;
        }
        resetLayoutTree();
        removeTreePane("terminal");
        removeTreePane("review");
        setSidebarOpen(true);
        setFileBrowserOpen(true);

        const frame = window.requestAnimationFrame(() => {
            revealTreePane("sessions");

            revealTreePane("surfaces");
        });
        const retry = window.setTimeout(() => revealTreePane("surfaces"), 250);

        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(retry);
        };
    }, [hudMode, panelMode]);

    useEffect(() => {
        if (!webMode) {
            return;
        }
        const preserveSession = Boolean($selectedStoredSessionId.get());
        void ensureWebModeAgentProfile()
            .then((profile) => {
                if (!preserveSession && !$selectedStoredSessionId.get()) {
                    selectProfile(profile);
                }
            })
            .catch((error) => console.warn("Kronos web-agent profile could not be provisioned", error));
    }, [webMode]);

    return (
        <div
            ref={viewportRef}
            data-hud-mode={hudMode ? "" : undefined}
            data-hermes-app=""
            data-kronos-pen-chat={!canvasRuntimeOnly && !webMode ? "" : undefined}
            className="relative h-full w-full overflow-hidden"
        >
            {runtimeError && (
                <div
                    role="alert"
                    className="absolute inset-x-2 top-2 z-50 flex items-center gap-3 rounded border border-[var(--coucou-border)] bg-[var(--coucou-card)] p-3 text-xs text-[var(--coucou-label)]"
                >
                    <span className="flex-1">{runtimeError}</span>
                    <Button
                        aria-busy={retrying || undefined}
                        disabled={retrying}
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={async () => {
                            setRetrying(true);
                            try {
                                await getApi().hermesApi({ path: "/api/status" });
                                setRuntimeError("");
                            } catch (error) {
                                setRuntimeError(`Could not restart Hermes: ${String(error)}`);
                            } finally {
                                setRetrying(false);
                            }
                        }}
                    >
                        {retrying ? "Restarting…" : "Retry"}
                    </Button>
                </div>
            )}
            <div
                className="origin-top-left"
                style={{
                    width: `${100 / scale}%`,
                    height: `${100 / scale}%`,
                    transform: `scale(${scale})`,
                }}
            >
                <RootErrorBoundary>
                    <QueryClientProvider client={queryClient}>
                        <I18nProvider>
                            <ThemeProvider>
                                <RootTooltipProvider>
                                    <KronTermSettingsHostProvider value={kronTermSettingsHost}>
                                        <HermesShellModeProvider
                                            hostMode={hostMode}
                                            hudMode={hudMode}
                                            dockedChat={dockedChat}
                                            panelMode={panelMode}
                                            webMode={webMode}
                                        >
                                            <HashRouter useTransitions={false}>
                                                <App canvasRuntimeOnly={canvasRuntimeOnly} />
                                            </HashRouter>
                                        </HermesShellModeProvider>
                                    </KronTermSettingsHostProvider>
                                </RootTooltipProvider>
                            </ThemeProvider>
                        </I18nProvider>
                    </QueryClientProvider>
                </RootErrorBoundary>
            </div>
        </div>
    );
}
