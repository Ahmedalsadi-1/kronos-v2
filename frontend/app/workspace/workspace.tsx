// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { submitToHermes } from "@/app/view/hermes/hermes-quick-submit";
import { useNativeHudMode } from "./use-native-hud-mode";
import { useNativeNotchPreview } from "./use-native-notch-preview";

import { ErrorBoundary } from "@/app/element/errorboundary";
import { CenteredDiv } from "@/app/element/quickelems";
import { ModalsRenderer } from "@/app/modals/modalsrenderer";
import { globalStore } from "@/app/store/jotaiStore";
import * as WOS from "@/app/store/wos";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { TabBar } from "@/app/tab/tabbar";
import { TabContent } from "@/app/tab/tabcontent";
import { workspaceCanvasComposerContextAtom } from "@/app/tab/workspace-canvas-context";
import { readWorkspacePresentation, subscribeWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { installAgentFollow } from "@/app/view/agent-follow";
import { ComputerUseStreamManager } from "@/app/view/appstream/computer-use-stream-manager";
import { HermesHudHost, HermesPanelHost } from "@/app/view/hermes/hermes-hud-host";
import { consumeHermesHudAutoOpen } from "@/app/view/hermes/hermes-startup";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { WorkspacePaletteShortcuts } from "@/app/workspace/kronarchy-shell";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import { KronTermHudControls } from "@/app/workspace/kronterm-hud-controls";
import { launchKronTermHudIsland, restoreKronTermHudIslands } from "@/app/workspace/kronterm-hud-islands";
import { Widgets } from "@/app/workspace/widgets";
import { clampHermesPanelWidth, getHermesPanelWidthBounds } from "@/app/workspace/workspace-hermes-panel";
import { shouldRenderHermesAuxiliarySurfaces } from "@/app/workspace/workspace-hermes-surfaces";
import { WorkspaceLayoutModel } from "@/app/workspace/workspace-layout-model";
import { hudTargetSessionId } from "@hermes/app/hud/handoff";
import { $sessionsLoading } from "@hermes/store/session";

import { WorkspaceWallpaper } from "@/app/workspace/workspace-wallpaper";
import { atoms, createBlock, getApi, refocusNode } from "@/store/global";
import { isMacOS } from "@/util/platformutil";
import { cn } from "@/util/util";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import "./kronarchy-shell.scss";

const WorkspaceElem = memo(() => {
    const workspaceLayoutModel = WorkspaceLayoutModel.getInstance();
    const tabId = useAtomValue(atoms.staticTabId);
    const ws = useAtomValue(atoms.workspace);
    const canvasComposerContext = useAtomValue(workspaceCanvasComposerContextAtom);
    const widgetsPanelVisible = useAtomValue(workspaceLayoutModel.widgetsPanelVisibleAtom);
    const surface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );
    const hudMode = useSyncExternalStore(
        kronTermHudController.subscribe,
        kronTermHudController.getSnapshot,
        kronTermHudController.getSnapshot
    );
    useEffect(() => kronTermHudController.setOwnerTab(tabId), [tabId]);
    useNativeNotchPreview(hudMode.active);
    useEffect(
        () =>
            getApi().onNativeHudSelectWidget(({ blockId, expanded }) => {
                kronTermHudController.selectWidget(blockId, expanded);
            }),
        []
    );
    useEffect(() => getApi().onNativeHudSummon?.(() => kronTermHudController.toggle()), []);
    useEffect(() => {
        const shortcut = (event: KeyboardEvent) => {
            if (
                event.repeat ||
                event.isComposing ||
                event.altKey ||
                !(event.metaKey || event.ctrlKey) ||
                !event.shiftKey ||
                event.code !== "KeyU"
            )
                return;
            event.preventDefault();
            kronTermHudController.toggle();
        };
        window.addEventListener("keydown", shortcut, { capture: true });
        return () => window.removeEventListener("keydown", shortcut, { capture: true });
    }, []);
    useEffect(() => installAgentFollow(), []);
    useEffect(() => {
        const offContext = getApi().onHermesContext?.((text) => {
            hermesSurfaceController.requestOpenPanel();
            submitToHermes(text, "current");
        });
        const offSelection = getApi().onHermesSelection?.((payload) => {
            hermesSurfaceController.requestOpenPanel();
            submitToHermes(payload.text, payload.target, payload.images);
        });
        return () => {
            offContext?.();
            offSelection?.();
        };
    }, []);
    const [autoOpenHud] = useState(consumeHermesHudAutoOpen);
    const presentation = useSyncExternalStore(
        subscribeWorkspacePresentation,
        readWorkspacePresentation,
        readWorkspacePresentation
    );
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
    const panelBounds = useMemo(
        () => getHermesPanelWidthBounds(presentation, viewportWidth),
        [presentation, viewportWidth]
    );
    const [panelWidth, setPanelWidth] = useState(() => {
        const initialPresentation = readWorkspacePresentation();
        const initialBounds = getHermesPanelWidthBounds(initialPresentation, window.innerWidth);
        const persisted = Number(ws?.meta?.["layout:hermespanelwidth"]);
        return clampHermesPanelWidth(
            Number.isFinite(persisted) ? persisted : initialBounds.defaultWidth,
            initialBounds
        );
    });
    const panelWidthRef = useRef(panelWidth);
    panelWidthRef.current = panelWidth;
    const renderHermesAuxiliarySurfaces = shouldRenderHermesAuxiliarySurfaces(presentation);

    useEffect(() => {
        if (presentation === "os" && surface.presentation === "panel") hermesSurfaceController.requestOpenHud();
    }, [presentation, surface.presentation]);

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    useEffect(() => {
        setPanelWidth((width) => clampHermesPanelWidth(width, panelBounds));
    }, [panelBounds]);

    useNativeHudMode(
        hudMode.active,
        hudMode.keepWorkspaceVisible,
        () => hudTargetSessionId() ?? ($sessionsLoading.get() ? undefined : "")
    );
    useEffect(() => {
        if (hudMode.active)
            void restoreKronTermHudIslands(tabId).catch((error) => console.error("HUD restoration failed", error));
    }, [hudMode.active, tabId]);

    useEffect(() => {
        const launchNativeHudApp = async (
            app: "web" | "files" | "terminal" | "widget" | "apps" | "machines" | "android" | "iphone",
            forceNew = false
        ) => {
            try {
                await launchKronTermHudIsland(app === "android" || app === "iphone" ? "machines" : app, {
                    forceNew,
                    machineKind: app === "android" || app === "iphone" ? app : "desktop",
                    machinePicker: ["machines", "android", "iphone"].includes(app),
                });
            } catch (error) {
                console.error(`[native-hud] could not launch ${app} island`, error);
            }
        };
        const unsubscribeLaunch = getApi().onNativeHudLaunch((app, forceNew) => {
            void launchNativeHudApp(app, forceNew);
        });
        const unsubscribeAppTarget = getApi().onNativeHudAppTarget?.((name) => {
            void (async () => {
                const apps = await RpcApi.ListInstalledAppsCommand(TabRpcClient);
                const matches = apps.filter((app) => app.name.toLocaleLowerCase() === name.toLocaleLowerCase());
                if (matches.length !== 1) throw new Error(`Could not uniquely resolve ${name} for streaming`);
                await launchKronTermHudIsland("appstream", {
                    appId: matches[0].bundleid || matches[0].appid,
                    appName: matches[0].name,
                });
            })().catch((error) => console.error("Could not preview the selected app", error));
        });
        const unsubscribeExit = getApi().onNativeHudExit(() => {
            kronTermHudController.setActive(false);
            hermesSurfaceController.dismiss();
        });
        return () => {
            unsubscribeLaunch();
            unsubscribeAppTarget?.();
            unsubscribeExit();
        };
    }, []);

    const expandHermes = useCallback(async () => {
        if (!tabId) {
            throw new Error("A workspace tab is required to expand KronTerm Agent.");
        }
        const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
        const existingBlockId = tab?.blockids?.find((blockId) => {
            const block = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId)));
            return block?.meta?.view === "hermes";
        });
        if (existingBlockId) {
            refocusNode(existingBlockId);
            return;
        }
        await createBlock({ meta: { view: "hermes" } }, false);
    }, [tabId]);

    useEffect(() => {
        if (!widgetsPanelVisible) {
            return;
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                workspaceLayoutModel.setWidgetsPanelVisible(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [widgetsPanelVisible, workspaceLayoutModel]);

    useEffect(() => getApi().onDesktopPetResume(() => hermesSurfaceController.requestOpenPanel()), []);

    return (
        <div className="flex flex-col w-full flex-grow overflow-hidden">
            <WorkspacePaletteShortcuts />
            {!isMacOS() && presentation !== "os" && <TabBar key={ws.oid} workspace={ws} noTabs />}
            <div
                className={cn(
                    "workspace-surface-row workspace-reference-shell flex flex-row flex-grow overflow-hidden",
                    hudMode.active && !hudMode.keepWorkspaceVisible && "is-kronterm-hud-mode"
                )}
                data-workspace-presentation={presentation}
            >
                <WorkspaceWallpaper />
                <ComputerUseStreamManager />
                <main className="workspace-reference-content min-h-0 min-w-0 flex-1">
                    <ErrorBoundary key={tabId}>
                        <div className="workspace-widget-surface">
                            <div className="workspace-widget-surface-content">
                                {tabId === "" ? (
                                    <CenteredDiv>No Active Tab</CenteredDiv>
                                ) : (
                                    <div className="relative flex h-full flex-row">
                                        <TabContent key={tabId} tabId={tabId} noTopPadding={isMacOS()} />
                                    </div>
                                )}
                            </div>
                        </div>
                        <ModalsRenderer />
                    </ErrorBoundary>
                </main>
                {renderHermesAuxiliarySurfaces && presentation !== "os" && surface.presentation === "panel" && (
                    <aside
                        className="workspace-hermes-dock order-last flex min-w-0 overflow-hidden border-l border-border"
                        style={{ width: panelWidth }}
                        aria-label="KronTerm Agent inspector"
                    >
                        <div
                            className="workspace-hermes-dock-resizer w-1 shrink-0 cursor-col-resize"
                            role="separator"
                            aria-label="Resize KronTerm Agent inspector"
                            aria-orientation="vertical"
                            aria-valuemin={panelBounds.min}
                            aria-valuemax={panelBounds.max}
                            aria-valuenow={panelWidth}
                            tabIndex={0}
                            onKeyDown={(event) => {
                                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                                    return;
                                }
                                event.preventDefault();
                                setPanelWidth((width) =>
                                    clampHermesPanelWidth(width + (event.key === "ArrowLeft" ? 12 : -12), panelBounds)
                                );
                            }}
                            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                            onPointerMove={(event) => {
                                if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                                    return;
                                }
                                const dock = event.currentTarget.parentElement?.getBoundingClientRect();
                                if (dock) {
                                    setPanelWidth(clampHermesPanelWidth(dock.right - event.clientX, panelBounds));
                                }
                            }}
                            onPointerUp={(event) => {
                                event.currentTarget.releasePointerCapture(event.pointerId);
                                void RpcApi.SetMetaCommand(TabRpcClient, {
                                    oref: WOS.makeORef("workspace", ws.oid),
                                    meta: {
                                        "layout:hermespanelwidth": panelWidthRef.current,
                                    } as unknown as MetaType,
                                });
                            }}
                        />
                        <div className="min-w-0 flex-1">
                            <HermesPanelHost tabId={tabId} />
                        </div>
                    </aside>
                )}
                {widgetsPanelVisible && (
                    <div className="workspace-reference-widget-catalog">
                        <Widgets
                            position="left"
                            catalog
                            onDismiss={() => workspaceLayoutModel.setWidgetsPanelVisible(false)}
                        />
                    </div>
                )}
            </div>
            {renderHermesAuxiliarySurfaces && !(hudMode.active && hudMode.keepWorkspaceVisible) && (
                <HermesHudHost
                    autoOpen={autoOpenHud || canvasComposerContext.active}
                    canvasContext={canvasComposerContext}
                    onExpand={expandHermes}
                    tabId={tabId}
                />
            )}
            {hudMode.active && !hudMode.keepWorkspaceVisible && (
                <KronTermHudControls onOpenWidgetCatalog={() => workspaceLayoutModel.setWidgetsPanelVisible(true)} />
            )}
        </div>
    );
});

WorkspaceElem.displayName = "WorkspaceElem";

export { WorkspaceElem as Workspace };
