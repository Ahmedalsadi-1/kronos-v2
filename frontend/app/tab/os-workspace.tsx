import Logo from "@/app/asset/logo.svg?url";
import { WorkspaceService } from "@/app/store/services";
import { DesktopGrabControl } from "@/app/workspace/kronterm-hud-controls";
import { $workflowSidebarMode } from "@hermes/app/workflows/workflow-context";
import { $workflowPickerSource, closeWorkflowPicker } from "@hermes/store/command-palette";
import * as Dialog from "@radix-ui/react-dialog";
import { createPortal } from "react-dom";
import { OSCanvasEntity } from "./os-canvas-entity";
import {
    osMarqueeBounds,
    osMarqueeSelection,
    snapOSCanvasBounds,
    translateOSCanvasRects,
    type OSAlignmentGuide,
    type OSResizeEdge,
} from "./os-canvas-gestures";
import { osCanvasOwnsDelete, osWidgetOwnsWheel } from "./os-canvas-input";
import { ComfyLibraries, OSComfyWorkflow, type ComfyLibrary } from "./os-comfy-workflow";
import { OSOriginalWorkflow } from "./os-original-workflow";
import { OSPenCanvasActions } from "./os-pen-canvas-actions";
import { KronOSV2AgentFollowPauseEvent } from "./os-kronos-v2-agent-pointer-event";
import { KronOSV2AgentPointer } from "./os-kronos-v2-agent-pointer";
import { KronOSV2LayerControls } from "./os-kronos-v2-layer-controls";
import {
    FloatingIslandTitle,
    FloatingIslandView,
    IslandGameControls,
    IslandLauncher,
    IslandModelTools,
    floatingIslandModels,
} from "@/app/view/floatingisland/floating-island";
import { getKronOSV2Widget, keepKronOSV2View, updateKronOSV2Widgets } from "./os-kronos-v2-widgets";
import { samePenCamera, type PenCamera, type PenViewport } from "./os-pen-camera";
import { type PenLiveWidget, type PenWidgetGeometry, type PenWidgetSnapshot } from "./os-pen-widgets";
import { getMobilePreviewPlatform, isPenChatDockApp, PenChatDockMeta } from "./os-pen-chat-dock-model";
import { usePenChatPresentation } from "./os-pen-chat-presentation";
import { OSPenEditor } from "./os-pen-editor";
import { activePenCanvasTabAtom, requestPenEditor, type PenEditorMethod } from "./os-pen-editor-bridge";
import { readPenLayerPatch, type PenDrawingTool } from "./os-pen-import";
import { OSPenPanel } from "./os-pen-panel";
import { type PenProjectDocument } from "./os-pen-project";
import "./os-pen-workspace.css";
import {
    applyOSWorkflowSelection,
    getOSCanvasEntityBounds,
    getOSSceneZIndices,
    getPersistedOSSceneOrder,
    selectOSSceneEntity,
} from "./os-scene-order";
import { resolveWorkflowCameraIntent, workflowEventMatchesTab, workflowOwnsWheel } from "./os-workflow-host";
import { activateOSWorkflowCanvas, keepWorkflowNodeVisible } from "./os-workflow-layout";
import { OSWorkspaceSetup } from "./os-workspace-setup";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { BlockChromeProvider } from "@/app/block/block-chrome-context";
import { blockViewToName, resolveBlockIcon } from "@/app/block/blockutil";
import {
    PersistentBlock as BlockView,
    syncPersistentBlockGeometry,
    type PersistentBlockSurfaceInput,
} from "@/app/block/persistent-block";
import { AppIcon } from "@/app/components/app-icon";
import { KronOSSignInButton } from "@/app/components/ui/kronos-sign-in-button";
import {
    SystemButton,
    SystemMaterial,
    SystemToolbar,
    SystemUIProvider,
    SystemWindowFrame,
    useSystemAppearance,
} from "@/app/components/system-ui";
import {
    ChevronLeft,
    ChevronRight,
    Focus,
    FolderOpen,
    Hand,
    Link2,
    Maximize2,
    Minimize2,
    MousePointer2,
    PanelLeft,
    PanelRight,
    Plus,
    Circle as ShapeCircle,
    Diamond as ShapeDiamond,
    Square as ShapeSquare,
    StickyNote,
    X,
} from "@/app/components/system-ui/os-icons";
import { hasViewIcon, viewIconId } from "@/app/components/view-icons";
import {
    fitSpatialViewportToBounds,
    spatialBoundsForRects,
    zoomSpatialViewportAtPoint,
} from "@/app/spatial/spatial-engine";
import { systemAppIdForBlock, useInstalledAppDescriptors } from "@/app/store/app-registry";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import {
    attachOSResourceToKronos,
    OSResourceDragMimeType,
    readOSResourceDragPayload,
    type OSResourceReference,
} from "@/app/store/os-resource-service";
import { OSSystemModel } from "@/app/store/os-system";
import { waveEventSubscribeSingle } from "@/app/store/wps";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { useAgentPresences } from "@/app/view/agent-control-indicator";
import { AppStreamFrameSizeEvent, type AppStreamFrameSize } from "@/app/view/appstream/appstream-events";
import { CompactDeviceBlocksAtom, getSingleDeviceWorkspaceWidth } from "@/app/view/computers/device-workspace-layout";
import { submitToHermes } from "@/app/view/hermes/hermes-quick-submit";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { classifyMedia } from "@/app/view/medialibrary/media-library-utils";
import { openRenderComparison } from "@/app/view/rendercomparison/render-comparison";
import {
    comfyWorkflowOpenAtom,
    OSSessionFocusEvent,
    SystemCenterOpenEvent,
    toggleCommandCenter,
    type SystemCenterTarget,
} from "@/app/workspace/command-center-events";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import { WorkspaceWallpaper } from "@/app/workspace/workspace-wallpaper";
import type { NodeModel } from "@/layout/lib/types";
import { atoms, getApi, getBlockComponentModel, getSettingsKeyAtom } from "@/store/global";
import { WebViewModel } from "@/view/webview/webview";
import * as services from "@/store/services";
import * as WOS from "@/store/wos";
import { getModelPreviewFormat } from "@/util/model-preview";
import { isMacOS } from "@/util/platformutil";
import { cn } from "@/util/util";
import {
    $comfyControlsOpen,
    $comfyLibraryTarget,
    $comfyPropertiesAvailable,
    $comfyPropertiesTarget,
    $krontermInspectorCompact,
    $krontermInspectorExpanded,
    $krontermInspectorOpen,
    $krontermInspectorSection,
    $krontermInspectorTarget,
    $krontermInspectorWidth,
    $krontermSidebarOwner,
    $krontermSidebarTarget,
    $penDesignTarget,
    $workspaceCanvasPanels,
    openKrontermFile,
} from "@hermes/lib/kronterm-sidebar";
import { $sidebarOpen, setSidebarOpen, toggleSidebarOpen } from "@hermes/store/layout";
import { useStore } from "@nanostores/react";
import { atom, useAtom, useAtomValue } from "jotai";
import { LayoutGrid, PanelBottom, PanelRight as SidebarRight, Search, SlidersHorizontal } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
    memo,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type PointerEvent as ReactPointerEvent,
    type WheelEvent as ReactWheelEvent,
} from "react";
import { subscribeAgentActivityStream } from "../../types/agent-activity";
import { assignAgentPresencesToWindows, describeAgentPresence, type OSAgentPresence } from "./os-agent-presence";
import { OSAppDragMimeType, readOSAppDragPayload, type OSAppDragPayload } from "./os-app-stream";
import { osDesktopInsetsForWidth, OSDesktopLayer } from "./os-desktop";
import { OSDesktopWidgetsStorageKey, readOSDockPins, writeOSDockPins, type OSDockPin } from "./os-desktop-model";
import { OSHermesSettings } from "./os-hermes-settings";
import { getOSSpaceSnapshot, OSSpaceOverview, useOSSpaceSnapshot } from "./os-space-overview";
import { getOSNavigationTarget, placeOSCanvasObject, validateOSSurfaceControl } from "./os-surface-control";
import { OSSystemCenterPanel } from "./os-system-centers";
import { getOSTabGroup } from "./os-tab-groups";
import { OSWidgetsFileView } from "./os-widgets-file";
import {
    computeOSArrangement,
    computeOSPlacementBounds,
    computeOSWorkArea,
    isOSWindowArrangement,
    isOSWindowPlacement,
    screenRectToWorld,
    type OSWindowArrangement,
    type OSWindowPlacement,
} from "./os-window-arrange";
import {
    arrangeOSLaunchedWindows,
    computeOSWindowLayout,
    findOSDockHitTarget,
    fitOSWindowToContentAspect,
    getOSAdjacentPanes,
    getOSCarouselNeighbor,
    getOSPaneNeighbor,
    getOSCarouselOrder,
    getOSPaneTakeover,
    getOSPaneWeight,
    getOSSurfaceCamera,
    makeInitialOSModeState,
    OSMinimumPaneWidth,
    reconcileOSModeState,
    recoverOSWindowBounds,
    reduceOSModeState,
    resolveOSControlAction,
    type KronTermOSView,
    type OSCanvasColor,
    type OSCanvasObject,
    type OSCanvasObjectKind,
    type OSModeState,
    type OSSpatialAction,
    type OSWindowGroup,
    type OSWindowLayout,
} from "./os-workspace-model";
import "./os-workspace.scss";
import {
    acceptsCanvasTransfer,
    allowCanvasDrop,
    canvasFileResource,
    canvasMediaUrl,
    canvasResourceCardSize,
    importCanvasTransfer,
    isCanvasPasteTarget,
    isLocalCanvasFilePath,
} from "./workspace-canvas-files";
import { findNonOverlappingCanvasRect } from "./workspace-canvas-utils";

// The shell refinements must follow the legacy compact-chrome rules.
import "./os-shell-polish.css";
import { registerWorkspaceSurfaceModeProvider, type WorkspaceSurfaceControlInput } from "./workspace-surface-runtime";

const OSResizeEdges: OSResizeEdge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const OSWindowMinWidth = 320;
const OSWindowMinHeight = 220;

function resizeBoundsFromEdge(bounds: DragBounds, edge: OSResizeEdge, dx: number, dy: number): DragBounds {
    let { x, y, width, height } = bounds;
    if (edge.includes("e")) width = Math.max(OSWindowMinWidth, bounds.width + dx);
    if (edge.includes("s")) height = Math.max(OSWindowMinHeight, bounds.height + dy);
    if (edge.includes("w")) {
        width = Math.max(OSWindowMinWidth, bounds.width - dx);
        x = bounds.x + bounds.width - width;
    }
    if (edge.includes("n")) {
        height = Math.max(OSWindowMinHeight, bounds.height - dy);
        y = bounds.y + bounds.height - height;
    }
    return { x, y, width, height };
}

const OSSaveDelayMs = 180;
// The connected shell plus its breathing room; arranged windows start below it.
const OSShellReservedHeight = 64;

function readDesktopWidgetsEnabled(): boolean {
    try {
        return window.localStorage.getItem(OSDesktopWidgetsStorageKey) !== "false";
    } catch {
        return true;
    }
}

function writeDesktopWidgetsEnabled(enabled: boolean): void {
    try {
        window.localStorage.setItem(OSDesktopWidgetsStorageKey, String(enabled));
    } catch {
        // Preference just won't persist.
    }
}
const OSCanvasColors: OSCanvasColor[] = ["amber", "blue", "green", "rose", "slate"];

type OSCanvasTool = "select" | "hand" | "note" | "rectangle" | "ellipse" | "diamond" | "connector";

type BlockDescriptor = {
    blockId: string;
    view: string;
    resolved: boolean;
    title: string;
    subtitle: string;
    icon?: string;
    appStreamAppId?: string;
};

type DragBounds = { x: number; y: number; width: number; height: number };
type CanvasPoint = Pick<DragBounds, "x" | "y">;

function isOSCanvasBackground(target: EventTarget, viewport: HTMLElement): boolean {
    return target === viewport ||
        (target instanceof HTMLElement && target.matches(".os-mode-world, .os-desktop-layer, .os-desktop-column"));
}

type DockPreview = {
    blockId: string;
    targetBlockId: string;
    targetTitle: string;
    targetBounds: DragBounds;
    side: "left" | "right";
};

function makeOSRecoverySnapshot(state: OSModeState) {
    return {
        version: state.version,
        camera: state.camera,
        windows: state.windows,
        zOrder: state.zOrder,
        sceneOrder: getPersistedOSSceneOrder(state),
        groups: state.groups,
        carouselWeights: state.carouselWeights,
        tabGroups: state.tabGroups,
        objects: state.objects
            .filter((object) => object.kind !== "workflow-node")
            .map((object) => ({
                id: object.id,
                kind: object.kind,
                x: object.x,
                y: object.y,
                width: object.width,
                height: object.height,
                fromObjectId: object.fromObjectId,
                toObjectId: object.toObjectId,
                appId: object.appId,
                artifactId: object.artifactId,
            })),
        scene: state.scene,
        desktopLayout: state.desktopLayout,
        previousScene: state.previousScene,
        selectedEntityId: state.selectedEntityId,
        view: state.view,
    };
}

function toScreenWindowLayout(state: OSModeState, layout: OSWindowLayout): OSWindowLayout {
    if (state.scene.kind !== "freeform") return layout;
    return {
        ...layout,
        bounds: {
            x: state.camera.x + layout.bounds.x * state.camera.zoom,
            y: state.camera.y + layout.bounds.y * state.camera.zoom,
            width: layout.bounds.width * state.camera.zoom,
            height: layout.bounds.height * state.camera.zoom,
        },
    };
}

function makeOSNodeModel(blockId: string, onFocus: () => void, onClose: () => void): NodeModel {
    return {
        additionalProps: atom({}),
        innerRect: atom({}),
        blockNum: atom(1),
        numLeafs: atom(1),
        nodeId: `os-${blockId}`,
        blockId,
        addEphemeralNodeToLayout: () => {},
        animationTimeS: atom(0),
        isResizing: atom(false),
        isFocused: atom(false),
        isMagnified: atom(false),
        isFolded: atom(false),
        anyMagnified: atom(false),
        isEphemeral: atom(false),
        ready: atom(true),
        disablePointerEvents: atom(false),
        toggleMagnify: () => {},
        toggleFold: () => {},
        focusNode: onFocus,
        onClose,
        dragHandleRef: undefined,
        displayContainerRef: undefined,
    } as unknown as NodeModel;
}

function describeBlockContext(view: string, meta: MetaType | undefined): string {
    if (view === "term" && typeof meta?.["cmd:cwd"] === "string") {
        return String(meta["cmd:cwd"]).replace(/^\/Users\/[^/]+/, "~");
    }
    if (view === "web" && typeof meta?.url === "string") {
        try {
            return new URL(meta.url).hostname.replace(/^www\./, "");
        } catch {
            return meta.url;
        }
    }
    if (view === "preview" && typeof meta?.file === "string") {
        return meta.file.split("/").filter(Boolean).at(-1) ?? meta.file;
    }
    if (view === "appstream" && meta?.["appstream:appname"] != null) {
        return String(meta["appstream:appname"]);
    }
    return blockViewToName(view);
}

function makeBlockDescriptor(blockId: string, block: Block | undefined): BlockDescriptor {
    const view = String(block?.meta?.view ?? "term");
    return {
        blockId,
        view,
        resolved: block != null,
        title: String(block?.meta?.["frame:title"] ?? "").trim() || blockViewToName(view),
        subtitle: describeBlockContext(view, block?.meta),
        icon: hasViewIcon(view) ? viewIconId(view) : resolveBlockIcon(view, block?.meta),
        appStreamAppId: block?.meta?.["appstream:appid"] != null ? String(block.meta["appstream:appid"]) : undefined,
    };
}

function resolvedViewsByBlockId(descriptors: BlockDescriptor[]): Record<string, string> {
    return Object.fromEntries(
        descriptors
            .filter((descriptor) => descriptor.resolved)
            .map((descriptor) => [descriptor.blockId, descriptor.view])
    );
}

function readBlockDescriptor(blockId: string): BlockDescriptor {
    const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId));
    return makeBlockDescriptor(blockId, globalStore.get(blockAtom));
}

// Block objects resolve asynchronously; descriptors must track them so late-loading blocks
// do not stay pinned to the "term" fallback (wrong titles, icons, and default bounds).
function useBlockDescriptors(blockIds: string[], blockIdsKey: string): BlockDescriptor[] {
    const descriptorsAtom = useMemo(
        () =>
            atom((get) =>
                blockIds.map((blockId) =>
                    makeBlockDescriptor(blockId, get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId))))
                )
            ),
        [blockIdsKey]
    );
    return useAtomValue(descriptorsAtom);
}

const PassivePenWidgetInput: PersistentBlockSurfaceInput = { passThrough: true };
const ActivePenWidgetInput: PersistentBlockSurfaceInput = {};

const OSBlockWindow = memo(
    ({
        descriptor,
        layout,
        canvasWidget,
        multiSelected,
        selected,
        docked,
        maximized,
        agentPresence,
        reducedMotion,
        interacting,
        onFocus,
        onTitlePointerDown,
        onResizePointerDown,
        onClose,
        onCollapse,
        onToggleFocus,
        onExitFocus,
        onTitleContextMenu,
        surfaceInput,
        penPassive,
        penWidget,
    }: {
        descriptor: BlockDescriptor;
        layout: OSWindowLayout;
        canvasWidget: boolean;
        multiSelected: boolean;
        selected: boolean;
        docked: boolean;
        maximized?: boolean;
        agentPresence?: OSAgentPresence;
        reducedMotion: boolean;
        interacting: boolean;
        onFocus: (blockId: string) => void;
        onTitlePointerDown: (event: ReactPointerEvent, blockId: string, layout: OSWindowLayout) => void;
        onResizePointerDown: (
            event: ReactPointerEvent,
            blockId: string,
            layout: OSWindowLayout,
            edge: OSResizeEdge
        ) => void;
        onClose: (blockId: string) => void;
        onCollapse: (blockId: string) => void;
        onToggleFocus: (blockId: string) => void;
        onExitFocus?: () => void;
        onTitleContextMenu?: (event: React.MouseEvent, blockId: string, sizeAction?: ContextMenuItem) => void;
        surfaceInput: PersistentBlockSurfaceInput;
        penPassive?: boolean;
        penWidget?: boolean;
    }) => {
        const blockAtom = useMemo(
            () => WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", descriptor.blockId)),
            [descriptor.blockId]
        );
        const block = useAtomValue(blockAtom);
        const phoneWindow =
            descriptor.view === "computers" ||
            (descriptor.view === "linux-vms" &&
                ["android", "iphone"].includes(String(block?.meta?.["machine:kind"])) &&
                !block?.meta?.["machine:settings"] &&
                !block?.meta?.["machine:picker"]);
        const [toolbarHost, setToolbarHost] = useState<HTMLDivElement>(null);
        const nodeModel = useMemo(
            () =>
                makeOSNodeModel(
                    descriptor.blockId,
                    () => onFocus(descriptor.blockId),
                    () => onClose(descriptor.blockId)
                ),
            [descriptor.blockId, onClose, onFocus]
        );

        useEffect(() => {
            globalStore.set(nodeModel.isFocused as any, selected);
        }, [nodeModel, selected]);

        const windowElement = useRef<HTMLElement>(null);
        useEffect(() => {
            const element = windowElement.current;
            if (!element || !phoneWindow) return;
            const drag = (event: PointerEvent) => {
                const target = event.target as HTMLElement;
                if (
                    target.closest("[data-live-blockid]")?.getAttribute("data-live-blockid") !== descriptor.blockId ||
                    !target.closest("[data-os-window-drag]") ||
                    target.closest("button,input,select,a,textarea")
                )
                    return;
                onTitlePointerDown(
                    {
                        button: event.button,
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        target: event.target,
                        currentTarget: element,
                        preventDefault: () => event.preventDefault(),
                        stopPropagation: () => event.stopPropagation(),
                    } as unknown as ReactPointerEvent,
                    descriptor.blockId,
                    layout
                );
            };
            const windowControl = (event: MouseEvent) => {
                const target = event.target as HTMLElement;
                if (target.closest("[data-live-blockid]")?.getAttribute("data-live-blockid") !== descriptor.blockId)
                    return;
                const close = target.closest("[data-device-window-close]");
                const menu = target.closest("[data-device-window-menu]");
                if (!close && (!menu || !onTitleContextMenu)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                if (close) {
                    onClose(descriptor.blockId);
                } else {
                    onFocus(descriptor.blockId);
                    onTitleContextMenu(event as unknown as React.MouseEvent, descriptor.blockId, {
                        label: maximized ? "Restore Window Size" : "Maximize Window",
                        click: () => onToggleFocus(descriptor.blockId),
                    });
                }
            };
            document.addEventListener("pointerdown", drag, true);
            document.addEventListener("click", windowControl, true);
            return () => {
                document.removeEventListener("pointerdown", drag, true);
                document.removeEventListener("click", windowControl, true);
            };
        }, [
            phoneWindow,
            descriptor.blockId,
            layout,
            maximized,
            onTitlePointerDown,
            onClose,
            onFocus,
            onTitleContextMenu,
            onToggleFocus,
        ]);
        const { bounds } = layout;
        const agentWorking = agentPresence != null;
        const transitionDuration = reducedMotion || interacting ? "0ms" : "240ms";
        const showWindowMenu = useCallback(
            (event: React.MouseEvent) => {
                if (!onTitleContextMenu) return;
                event.preventDefault();
                event.stopPropagation();
                onFocus(descriptor.blockId);
                onTitleContextMenu(event, descriptor.blockId, {
                    label: maximized ? "Restore Window Size" : "Maximize Window",
                    click: () => onToggleFocus(descriptor.blockId),
                });
            },
            [descriptor.blockId, maximized, onFocus, onTitleContextMenu, onToggleFocus]
        );
        useEffect(() => {
            if (!toolbarHost || !canvasWidget || descriptor.view !== "web") return;
            // The live navigation bar is portaled from the block, so its React menu bubbles outside the window.
            const onContextMenu = (event: MouseEvent) => {
                if (event.target instanceof Node && toolbarHost.contains(event.target)) {
                    showWindowMenu(event as unknown as React.MouseEvent);
                }
            };
            document.addEventListener("contextmenu", onContextMenu, true);
            return () => document.removeEventListener("contextmenu", onContextMenu, true);
        }, [canvasWidget, descriptor.view, showWindowMenu, toolbarHost]);
        const framelessIsland = penWidget && descriptor.view === FloatingIslandView;
        const windowButtons = phoneWindow || framelessIsland ? null : (
            <div
                className={cn(
                    "os-window-lights",
                    descriptor.view !== "web" && "os-window-floating-lights",
                    !isMacOS() && "is-platform-controls"
                )}
                role="group"
                aria-label="Window controls"
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
            >
                <button type="button" className="is-close" onClick={() => onClose(descriptor.blockId)} aria-label="Close">
                    <X />
                </button>
                <button type="button" className="is-minimize" onClick={() => onCollapse(descriptor.blockId)} aria-label="Minimize">
                    <Minimize2 />
                </button>
                <button
                    type="button"
                    className="is-zoom"
                    autoFocus={maximized && !penWidget}
                    onClick={() => onToggleFocus(descriptor.blockId)}
                    aria-label={maximized ? "Restore window" : "Maximize window"}
                >
                    <Maximize2 />
                </button>
            </div>
        );
        return (
            <section
                ref={windowElement}
                className={cn(
                    "os-window",
                    canvasWidget && "is-canvas-widget",
                    phoneWindow && "is-phone-window",
                    "kt-system-material",
                    "is-window",
                    `is-${layout.presentation}`,
                    (selected || multiSelected) && "is-selected",
                    multiSelected && "is-multi-selected",
                    docked && "is-docked",
                    agentWorking && "is-agent-working",
                    kronTermHudController.isIsland(descriptor.blockId) && "is-hud-island",
                    interacting && "is-interacting"
                )}
                inert={penPassive}
                data-kronos-v2-passive={penPassive ? "" : undefined}
                data-kronos-v2-frame={penWidget && !maximized ? "" : undefined}
                data-block-id={descriptor.blockId}
                data-phone-platform={phoneWindow ? String(block?.meta?.["machine:kind"]) : undefined}
                data-view={descriptor.view}
                data-presentation={layout.presentation}
                aria-label={descriptor.title}
                style={{
                    left: bounds.x,
                    top: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                    opacity: layout.opacity,
                    zIndex: layout.zIndex,
                    transition: `left ${transitionDuration} cubic-bezier(0.2, 0.82, 0.2, 1), top ${transitionDuration} cubic-bezier(0.2, 0.82, 0.2, 1), width ${transitionDuration} cubic-bezier(0.2, 0.82, 0.2, 1), height ${transitionDuration} cubic-bezier(0.2, 0.82, 0.2, 1), opacity ${transitionDuration} ease`,
                    transformOrigin: layout.presentation === "edge-left" ? "left" : "right",
                }}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    onFocus(descriptor.blockId);
                    const target = event.target as HTMLElement;
                    if (
                        phoneWindow &&
                        target.closest(".kt-phone-frame") &&
                        !target.closest(".kt-phone-screen, button")
                    ) {
                        onTitlePointerDown(event, descriptor.blockId, layout);
                    }
                }}
            >
                {canvasWidget && !penWidget && (
                    <button
                        type="button"
                        className="os-canvas-widget-label"
                        data-os-window-label=""
                        aria-label={`Expand ${descriptor.title}`}
                        onPointerDown={(event) => onTitlePointerDown(event, descriptor.blockId, layout)}
                        onClick={(event) => {
                            if (event.detail === 0) onToggleFocus(descriptor.blockId);
                        }}
                        onDoubleClick={() => onToggleFocus(descriptor.blockId)}
                        onContextMenu={showWindowMenu}
                        title={descriptor.title}
                    >
                        {descriptor.title}
                    </button>
                )}
                {agentWorking && ["web", "sandbox", "appstream", "phone", "devices"].includes(descriptor.view) && (
                    <div
                        className="os-agent-control-edge"
                        data-awaiting-approval={agentPresence.awaitingApproval ? "true" : undefined}
                        role="status"
                        aria-label={
                            agentPresence.awaitingApproval
                                ? "Agent waiting for approval"
                                : "EGO-LITE: agent controlling this surface"
                        }
                    />
                )}
                {onExitFocus && (
                    <button
                        type="button"
                        className="os-window-focus-exit"
                        aria-label="Exit focus mode"
                        title="Return to canvas"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={onExitFocus}
                    >
                        {penWidget && <Minimize2 size={15} aria-hidden="true" />}
                    </button>
                )}
                {descriptor.view !== "web" && windowButtons}
                <SystemWindowFrame
                    titlebar={
                        descriptor.view === "web" && (
                            <div
                                className="os-browser-navigation"
                                onPointerDown={(event) => onTitlePointerDown(event, descriptor.blockId, layout)}
                                onDoubleClick={() => onToggleFocus(descriptor.blockId)}
                                onContextMenu={showWindowMenu}
                            >
                                <div
                                    ref={setToolbarHost}
                                    className="os-window-context"
                                    onPointerDown={(event) => {
                                        if ((event.target as HTMLElement).closest(
                                            "button, input, textarea, select, a, [contenteditable='true'], [role='button']"
                                        )) event.stopPropagation();
                                    }}
                                    onDoubleClick={(event) => event.stopPropagation()}
                                />
                                {windowButtons}
                            </div>
                        )
                    }
                >
                    <div
                        className="os-window-content"
                        onPointerDown={(event) => {
                            event.stopPropagation();
                            onFocus(descriptor.blockId);
                        }}
                    >
                        <div className="os-window-surface relative">
                            <BlockChromeProvider mode="integrated" toolbarHost={toolbarHost}>
                                {!descriptor.resolved && (
                                    <div className="os-window-opening" role="status">
                                        <span className="os-restore-status-spinner" aria-hidden="true" />
                                        Opening {descriptor.title}…
                                    </div>
                                )}
                                <BlockView
                                    nodeModel={nodeModel}
                                    preview={false}
                                    surfaceInput={surfaceInput}
                                />
                            </BlockChromeProvider>
                        </div>
                    </div>
                </SystemWindowFrame>
                {canvasWidget && !framelessIsland && (selected || multiSelected) && (
                    <>
                        <span className="os-canvas-widget-selection" aria-hidden="true" />
                        <span
                            className="os-canvas-widget-drag-strip"
                            data-os-free-drag=""
                            role="presentation"
                            onPointerDown={(event) => onTitlePointerDown(event, descriptor.blockId, layout)}
                            onDoubleClick={() => onToggleFocus(descriptor.blockId)}
                            onContextMenu={showWindowMenu}
                        />
                    </>
                )}
                {!penWidget && layout.presentation === "freeform" &&
                    OSResizeEdges.map((edge) => (
                        <span
                            key={edge}
                            className={`os-window-edge is-${edge}`}
                            role="presentation"
                            onPointerDown={(event) => onResizePointerDown(event, descriptor.blockId, layout, edge)}
                        >
                            {canvasWidget && selected && !multiSelected && (
                                <span className="os-canvas-widget-resize-handle" aria-hidden="true" />
                            )}
                        </span>
                    ))}
            </section>
        );
    }
);
OSBlockWindow.displayName = "OSBlockWindow";

export function OSModeShell({
    hasComfyPanels,
    systemControlsSlot,
    workspaces,
    currentWorkspaceId,
    blocks,
    collapsedIds,
    showCollapsedDock,
    osView,
    onFocusApp,
    onWorkspace,
    onCreateWorkspace,
    onRestore,
    onPinResource,
    onShowApps,
}: {
    hasComfyPanels?: boolean;
    systemControlsSlot?: HTMLElement | null;
    workspaces: Array<{ id: string; name: string }>;
    currentWorkspaceId: string;
    blocks: BlockDescriptor[];
    collapsedIds: string[];
    showCollapsedDock: boolean;
    osView: KronTermOSView;
    onFocusApp: (blockId: string) => void;
    onWorkspace: (id: string) => void;
    onCreateWorkspace: () => void;
    onRestore: (blockId: string) => void;
    onPinResource: (resource: OSResourceReference) => void;
    onShowApps: () => void;
}) {
    const designView = osView === "design" || osView === "kronos-v2";
    const shellTabId = useAtomValue(atoms.staticTabId);
    const isFullScreen = useAtomValue(atoms.isFullScreen);
    const shellRef = useRef<HTMLDivElement>(null);
    const [activeSystemCenter, setActiveSystemCenter] = useState<SystemCenterTarget>();
    const [settingsSection, setSettingsSection] = useState<string>();
    const sidebarOpen = useStore($sidebarOpen);
    const inspectorOpen = useStore($krontermInspectorOpen);
    const hudMode = useSyncExternalStore(
        kronTermHudController.subscribe,
        kronTermHudController.getSnapshot,
        kronTermHudController.getSnapshot
    );
    const penCanvasTab = useAtomValue(activePenCanvasTabAtom);
    const penChat = !!shellTabId && penCanvasTab === shellTabId;
    const showPenChat = useCallback(() => {
        void requestPenEditor(shellTabId, "show_chat").catch(() => {});
    }, [shellTabId]);
    const toggleHudMode = useCallback(() => {
        if (penChat) return showPenChat();
        const current = kronTermHudController.getSnapshot();
        if (current.active && current.keepWorkspaceVisible) {
            kronTermHudController.openExclusiveHud();
            hermesSurfaceController.requestOpenHud();
            return;
        }
        const active = kronTermHudController.toggle();
        if (active) {
            hermesSurfaceController.requestOpenHud();
        } else {
            hermesSurfaceController.dismiss();
        }
    }, [penChat, showPenChat]);
    useEffect(() => {
        const handleSystemCenterOpen = (event: Event) => {
            const center = (event as CustomEvent<{ center?: SystemCenterTarget }>).detail?.center;
            if (center !== "activity" && center !== "control") return;
            setSettingsSection((event as CustomEvent<{ section?: string }>).detail?.section);
            setActiveSystemCenter(center);
        };
        window.addEventListener(SystemCenterOpenEvent, handleSystemCenterOpen);
        return () => window.removeEventListener(SystemCenterOpenEvent, handleSystemCenterOpen);
    }, []);

    return (
        <Dialog.Root
            open={activeSystemCenter === "control"}
            onOpenChange={(open) => setActiveSystemCenter(open ? "control" : undefined)}
        >
            <SystemMaterial
                ref={shellRef}
                material="bar"
                data-live-block-occluder={systemControlsSlot ? undefined : ""}
                data-pen-system-controls-mounted={systemControlsSlot ? "" : undefined}
                className={cn("os-shell", isMacOS() && !isFullScreen && "has-window-controls")}
            >
                {!designView && (
                    <div className="os-shell-left">
                        <SystemButton
                            type="button"
                            size="small"
                            className="os-shell-icon os-sidebar-toggle"
                            selected={sidebarOpen}
                            aria-label={sidebarOpen ? "Hide left workspace panel" : "Show left workspace panel"}
                            aria-expanded={sidebarOpen}
                            aria-controls="kronterm-left-sidebar"
                            title={sidebarOpen ? "Hide left workspace panel" : "Show left workspace panel"}
                            onClick={() => {
                                toggleSidebarOpen();
                                if (!penChat && $sidebarOpen.get() && !$krontermSidebarOwner.get() && !hasComfyPanels) {
                                    hermesSurfaceController.requestOpenHud();
                                }
                            }}
                        >
                            <img src={Logo} alt="" className="size-5" draggable={false} />
                        </SystemButton>
                        <nav
                            className="os-workspaces"
                            aria-label="Workspaces"
                            onKeyDown={(event) => {
                                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                                const buttons = Array.from(
                                    event.currentTarget.querySelectorAll<HTMLButtonElement>("button")
                                );
                                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                                if (index < 0) return;
                                event.preventDefault();
                                const next =
                                    event.key === "Home"
                                        ? 0
                                        : event.key === "End"
                                          ? buttons.length - 1
                                          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                                            buttons.length;
                                buttons[next]?.focus();
                            }}
                        >
                            {workspaces.map((workspace, index) => (
                                <button
                                    type="button"
                                    key={workspace.id}
                                    className={cn(workspace.id === currentWorkspaceId && "is-active")}
                                    onClick={() => onWorkspace(workspace.id)}
                                    aria-label={`Workspace ${index + 1}: ${workspace.name}`}
                                    title={`Workspace ${index + 1}: ${workspace.name}`}
                                    aria-current={workspace.id === currentWorkspaceId ? "page" : undefined}
                                >
                                    {index + 1}
                                </button>
                            ))}
                            <button type="button" onClick={onCreateWorkspace} aria-label="Create workspace">
                                <Plus />
                            </button>
                        </nav>
                        <div id={`workflow-shell-controls-${shellTabId}`} className="flex shrink-0 items-center gap-1" />
                        <div id={`hermes-hud-shell-${shellTabId}`} className="os-shell-chat" />
                    </div>
                )}
                {(osView !== "kronos-v2" || systemControlsSlot) && (
                <CanvasToolsPortal target={systemControlsSlot}>
                    <SystemToolbar
                        className={systemControlsSlot ? undefined : "os-shell-right"}
                        aria-label={osView === "kronos-v2" ? "Workspace controls" : "System controls"}
                    >
                        <KronOSSignInButton showName />
                        <SystemButton
                            type="button"
                            size="small"
                            className="os-system-entry"
                            onClick={() => {
                                setActiveSystemCenter(undefined);
                                toggleCommandCenter();
                            }}
                            data-pen-chat-hide=""
                            aria-label="Open Command Center"
                            title="Command Center (Command+Shift+Space)"
                        >
                            <Search />
                            <span className="os-command-label">Search</span>
                            <kbd className="os-command-shortcut">{isMacOS() ? "⌘⇧Space" : "Ctrl⇧Space"}</kbd>
                        </SystemButton>
                        <Dialog.Trigger asChild>
                            <SystemButton
                                type="button"
                                size="small"
                                className="os-shell-icon"
                                selected={activeSystemCenter === "control"}
                                data-pen-chat-hide=""
                                aria-label="Open Hermes Settings"
                                title="Hermes Settings"
                            >
                                <SlidersHorizontal aria-hidden="true" />
                            </SystemButton>
                        </Dialog.Trigger>
                        <SystemButton
                            type="button"
                            size="small"
                            selected={hudMode.active && !hudMode.keepWorkspaceVisible}
                            className="os-shell-icon"
                            onClick={toggleHudMode}
                            aria-label={
                                hudMode.active && !hudMode.keepWorkspaceVisible
                                    ? "Exit KronOS HUD mode"
                                    : "Enter KronOS HUD mode"
                            }
                            aria-pressed={hudMode.active && !hudMode.keepWorkspaceVisible}
                            data-pen-chat-hide=""
                            title="KronOS HUD mode"
                        >
                            <PanelBottom />
                        </SystemButton>
                        <SystemButton
                            type="button"
                            size="small"
                            className="os-shell-icon os-all-apps-button"
                            onClick={onShowApps}
                            data-pen-chat-hide=""
                            aria-label="Show all apps"
                        >
                            <LayoutGrid />
                        </SystemButton>
                        <SystemButton
                            type="button"
                            size="small"
                            className="os-shell-icon"
                            aria-label={
                                (penChat || hasComfyPanels)
                                    ? inspectorOpen
                                        ? "Hide inspector"
                                        : "Show inspector"
                                    : inspectorOpen
                                      ? "Hide files and changes"
                                      : "Show files and changes"
                            }
                            aria-expanded={inspectorOpen}
                            data-pen-chat-hide=""
                            aria-controls={penChat ? "kronos-pen-workspace-inspector" : "kronterm-right-inspector"}
                            selected={inspectorOpen}
                            title={penChat || hasComfyPanels ? "Workspace inspector" : "Files and changes"}
                            onClick={() => {
                                if (!$krontermInspectorOpen.get() && !hasComfyPanels)
                                    $krontermInspectorSection.set("files");
                                $krontermInspectorOpen.set(!$krontermInspectorOpen.get());
                            }}
                        >
                            <SidebarRight />
                        </SystemButton>
                    </SystemToolbar>
                </CanvasToolsPortal>
                )}
                {activeSystemCenter === "activity" && (
                    <OSSystemCenterPanel
                        onClose={() => setActiveSystemCenter(undefined)}
                        onPinResource={onPinResource}
                        onFocusBlock={(blockId) => {
                            onFocusApp(blockId);
                            setActiveSystemCenter(undefined);
                        }}
                    />
                )}
                {showCollapsedDock && collapsedIds.length > 0 && (
                    <div className="os-collapsed-dock" aria-label="Minimized applications">
                        {collapsedIds.map((blockId) => {
                            const block = blocks.find((item) => item.blockId === blockId);
                            return (
                                <button
                                    type="button"
                                    className="os-collapsed-tile"
                                    key={blockId}
                                    onClick={() => onRestore(blockId)}
                                    aria-label={`Restore ${block?.title ?? "application"}`}
                                >
                                    <AppIcon icon={block?.icon} />
                                    <span>{block?.title ?? "App"}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </SystemMaterial>
            {activeSystemCenter === "control" && (
                <OSHermesSettings
                    tabId={shellTabId}
                    initialSection={settingsSection}
                    onClose={() => setActiveSystemCenter(undefined)}
                />
            )}
        </Dialog.Root>
    );
}

function OSPaneDivider({
    left,
    top,
    height,
    span,
    ratio,
    onRatio,
    onResize,
}: {
    left: number;
    top: number;
    height: number;
    span: number;
    ratio: number;
    onRatio: (ratio: number) => void;
    onResize: (resizing: boolean) => void;
}) {
    const drag = useRef<{ x: number; ratio: number }>(null);
    return (
        <div
            className="os-group-divider"
            role="separator"
            aria-label="Resize adjacent widgets"
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={80}
            aria-valuenow={Math.round(ratio * 100)}
            tabIndex={0}
            style={{ left, top, height }}
            onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.stopPropagation();
                drag.current = { x: event.clientX, ratio };
                onResize(true);
                event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
                if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                onRatio(drag.current.ratio + (event.clientX - drag.current.x) / span);
            }}
            onLostPointerCapture={() => {
                drag.current = null;
                onResize(false);
            }}
            onKeyDown={(event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                onRatio(ratio + (event.key === "ArrowLeft" ? -0.02 : 0.02));
            }}
        />
    );
}

function OSGroupFrame({ group, layouts }: { group: OSWindowGroup; layouts: Record<string, OSWindowLayout> }) {
    const panes = group.blockIds.map((id) => ({ id, bounds: layouts[id]?.bounds })).filter((pane) => pane.bounds);
    if (panes.length < 2) return null;
    const x = Math.min(...panes.map(({ bounds }) => bounds.x)) - 6;
    const y = Math.min(...panes.map(({ bounds }) => bounds.y)) - 6;
    const rightEdge = Math.max(...panes.map(({ bounds }) => bounds.x + bounds.width)) + 6;
    const bottomEdge = Math.max(...panes.map(({ bounds }) => bounds.y + bounds.height)) + 6;
    return <div className="os-group-frame" style={{ left: x, top: y, width: rightEdge - x, height: bottomEdge - y }} />;
}

function OSModeView({ tabId, tabData }: { tabId: string; tabData: Tab }) {
    const sidebarOpen = useStore($sidebarOpen);
    const inspectorOpen = useStore($krontermInspectorOpen);
    const inspectorExpanded = useStore($krontermInspectorExpanded);
    const inspectorCompact = useStore($krontermInspectorCompact);
    const inspectorWidth = useStore($krontermInspectorWidth);
    const attachInspector = useCallback((target: HTMLDivElement) => $krontermInspectorTarget.set(target), []);
    const [sessionSidebarWidth, setSessionSidebarWidth] = useState(260);
    const sessionSidebarDrag = useRef<{ x: number; width: number }>(null);
    const resizeSessionSidebar = (width: number) => setSessionSidebarWidth(Math.max(200, Math.min(680, width)));
    const attachSidebar = useCallback((target: HTMLDivElement) => $krontermSidebarTarget.set(target), []);
    const hudMode = useSyncExternalStore(
        kronTermHudController.subscribe,
        kronTermHudController.getSnapshot,
        kronTermHudController.getSnapshot
    );
    const allBlockIds = tabData.blockids ?? [];
    const chatDockTabsAtom = useMemo(() => atom((get) => allBlockIds.flatMap((id) => {
        const block = get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", id)));
        const app = block?.meta?.[PenChatDockMeta];
        if (!isPenChatDockApp(app)) return [];
        const meta = block.meta as MetaType & { "web:title"?: string };
        const title = app === "browser"
            ? meta["web:title"]?.trim() || meta.url
            : app === "files" ? meta.file?.split("/").filter(Boolean).at(-1) : undefined;
        return [{ id, app, title, url: app === "browser" ? meta.url : undefined, partition: app === "browser" ? meta["web:partition"] as string : undefined, path: app === "files" ? meta.file : undefined, mobilePreview: app === "browser" ? getMobilePreviewPlatform(meta.url) : undefined }];
    })), [allBlockIds]);
    const dedicatedChatDockTabs = useAtomValue(chatDockTabsAtom);
    const blockIds = allBlockIds.filter((blockId) =>
        (!hudMode.active || !kronTermHudController.isIsland(blockId))
    );
    const blockIdsKey = blockIds.join(":");
    const [state, setState] = useState<OSModeState>(() =>
        makeInitialOSModeState(tabData, blockIds, resolvedViewsByBlockId(blockIds.map(readBlockDescriptor)))
    );
    const stateRef = useRef(state);
    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [workflowPanelLayout, setWorkflowPanelLayout] = useState({ top: 0, right: 0, bottom: 0 });
    const [canvasToolsOpen, setCanvasToolsOpen] = useState(false);
    const [workflowFocusTarget, setWorkflowFocusTarget] = useState<HTMLDivElement>(null);
    const [workflowFocusVisible, setWorkflowFocusVisible] = useState(false);
    const [workflowConfigOpen, setWorkflowConfigOpen] = useState(false);
    const onWorkflowFocusVisibility = useCallback((visible: boolean, editing: boolean) => {
        setWorkflowFocusVisible(visible);
        setWorkflowConfigOpen(editing);
    }, []);
    const [workflowToolsTarget, setWorkflowToolsTarget] = useState<HTMLDivElement>(null);
    const [penToolsSlot, setPenToolsSlot] = useState<HTMLElement>(null);
    const [workflowWorldTarget, setWorkflowWorldTarget] = useState<HTMLDivElement>(null);
    const [comfyWorldTarget, setComfyWorldTarget] = useState<HTMLDivElement>(null);
    const [comfyWorkflowOpen, setComfyWorkflowOpen] = useAtom(comfyWorkflowOpenAtom);
    const workflowCanvasVisible = state.view === "kronos-v2" ||
        (state.view === "canvas" && state.scene.kind === "freeform");
    const comfyWorkflowVisible = comfyWorkflowOpen && workflowCanvasVisible;
    const [comfyReady, setComfyReady] = useState(false);
    const comfyLibrarySlot = useStore($comfyLibraryTarget);
    const comfyPropertiesTarget = useStore($comfyPropertiesTarget);
    const sidebarMode = useStore($workflowSidebarMode);
    const penDesignTarget = useStore($penDesignTarget);
    const designSelected = sidebarMode === "design";
    const kronosV2 = state.view === "kronos-v2";
    const penCanvasVisible = state.view === "design" || kronosV2;
    const [penRequestedCamera, setPenRequestedCamera] = useState<PenCamera>(() => state.camera);
    const penCameraRef = useRef(penRequestedCamera);
    const requestedPenCameraRef = useRef(penRequestedCamera);
    requestedPenCameraRef.current = penRequestedCamera;
    const penAgentFollowPaused = useRef(false);
    const [penWorkflowCamera, setPenWorkflowCamera] = useState(penRequestedCamera);
    const penLivePlaneRef = useRef<HTMLDivElement>(null);
    const penDidFit = useRef(false);
    const [penViewport, setPenViewport] = useState<PenViewport>();
    const updatePenViewport = useCallback((next: PenViewport) => {
        setPenViewport((current) =>
            current?.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height
                ? current
                : next
        );
    }, []);
    const updatePenCamera = useCallback((camera: PenCamera) => {
        if (camera.zoom < penCameraRef.current.zoom - 0.001 &&
            Math.abs(camera.zoom - requestedPenCameraRef.current.zoom) > 0.001) {
            penAgentFollowPaused.current = true;
        }
        penCameraRef.current = camera;
        setPenWorkflowCamera((current) => (samePenCamera(current, camera) ? current : camera));
        const plane = penLivePlaneRef.current;
        if (!plane) return;
        plane.style.setProperty("--pen-camera-x", `${camera.x}px`);
        plane.style.setProperty("--pen-camera-y", `${camera.y}px`);
        plane.style.setProperty("--pen-camera-zoom", String(camera.zoom));
        syncPersistentBlockGeometry(viewportRef.current);
    }, []);
    const {
        fullChat: penFullChat,
        setFullChat: setPenFullChat,
        widgetsReady: penWidgetsReady,
        updateWidgetsReady: setPenWidgetsReady,
    } = usePenChatPresentation();
    const [penOverlayOpen, setPenOverlayOpen] = useState(false);
    const [penChatDockActive, setPenChatDockActive] = useState<string>();
    const [penChatDockFocus, setPenChatDockFocus] = useState<{ id: string; background?: boolean }>();
    const [penPresentation, setPenPresentation] = useState<{ active: boolean; blockId?: string }>({ active: false });
    const updatePenPresentation = useCallback((active: boolean, blockId?: string) => {
        setPenPresentation((current) =>
            current.active === active && current.blockId === blockId ? current : { active, blockId }
        );
    }, []);
    const [penActiveWidget, setPenActiveWidget] = useState<string>();
    const penActiveWidgetRef = useRef(penActiveWidget);
    penActiveWidgetRef.current = penActiveWidget;
    const [penInputWidget, setPenInputWidget] = useState<string>();
    const penInputWidgetRef = useRef(penInputWidget);
    penInputWidgetRef.current = penInputWidget;
    const [penLayerWidget, setPenLayerWidget] = useState<string>();
    const [penWidgetControlsSlot, setPenWidgetControlsSlot] = useState<HTMLElement>();
    const leavePenWidget = useCallback(() => {
        setPenInputWidget(undefined);
        setPenActiveWidget(undefined);
    }, []);
    const returnToPenCanvas = useCallback(() => {
        penAgentFollowPaused.current = true;
        leavePenWidget();
        void requestPenEditor(tabId, "focus_canvas").catch(() => {});
    }, [leavePenWidget, tabId]);
    const interactWithPenWidget = useCallback((blockId: string | null) => {
        if (blockId == null) {
            penAgentFollowPaused.current = true;
            leavePenWidget();
        } else setPenActiveWidget(blockId);
    }, [leavePenWidget]);

    useLayoutEffect(() => {
        if (kronosV2) return;
        penAgentFollowPaused.current = false;
        leavePenWidget();
        setPenLayerWidget(undefined);
        setPenRequestedCamera(penCameraRef.current);
    }, [kronosV2, leavePenWidget]);

    useEffect(() => {
        if (!kronosV2) return;
        const exit = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            penAgentFollowPaused.current = true;
            if (!penActiveWidget || event.defaultPrevented) return;
            if (!(event.target instanceof Element) || !event.target.closest(
                `[data-live-blockid="${CSS.escape(penActiveWidget)}"], [data-block-id="${CSS.escape(penActiveWidget)}"]`
            )) return;
            event.preventDefault();
            event.stopPropagation();
            returnToPenCanvas();
        };
        const stopFollow = () => {
            penAgentFollowPaused.current = true;
        };
        const pauseFollow = (event: KeyboardEvent) => {
            if (event.key === "Escape") stopFollow();
        };
        window.addEventListener(KronOSV2AgentFollowPauseEvent, stopFollow);
        window.addEventListener("keydown", pauseFollow, true);
        window.addEventListener("keydown", exit);
        return () => {
            window.removeEventListener(KronOSV2AgentFollowPauseEvent, stopFollow);
            window.removeEventListener("keydown", pauseFollow, true);
            window.removeEventListener("keydown", exit);
        };
    }, [kronosV2, penActiveWidget, returnToPenCanvas]);
    const kronOSCanvasVisible = state.view === "canvas" && state.scene.kind === "freeform";
    const [penVisited, setPenVisited] = useState(penCanvasVisible);
    useEffect(() => {
        if (!penCanvasVisible) return;
        setPenVisited(true);
        globalStore.set(activePenCanvasTabAtom, tabId);
        return () => {
            if (globalStore.get(activePenCanvasTabAtom) === tabId) globalStore.set(activePenCanvasTabAtom, "");
        };
    }, [penCanvasVisible, tabId]);
    useLayoutEffect(() => {
        if (penCanvasVisible) closeWorkflowPicker();
        syncPersistentBlockGeometry(viewportRef.current);
    }, [penCanvasVisible]);
    const focusedCanvasWidget =
        state.view === "canvas" &&
        state.desktopLayout === "freeform" &&
        state.scene.kind === "focused" &&
        state.windows[state.scene.blockId]?.maximized
            ? state.scene.blockId
            : undefined;
    const [comfyLibraryTarget, setComfyLibraryTarget] = useState<HTMLDivElement>(null);
    const [comfyLogsTarget, setComfyLogsTarget] = useState<HTMLDivElement>(null);
    const [comfyLibrary, setComfyLibrary] = useState<ComfyLibrary>("assets");
    const [showComfyLogs, setShowComfyLogs] = useState(false);
    const inspectorSection = useStore($krontermInspectorSection);
    const hasComfyPanels = comfyWorkflowVisible && comfyReady;
    useEffect(() => {
        $workspaceCanvasPanels.set(true);
        return () => $workspaceCanvasPanels.set(false);
    }, []);
    useEffect(() => {
        $comfyPropertiesAvailable.set(hasComfyPanels);
        return () => $comfyPropertiesAvailable.set(false);
    }, [hasComfyPanels]);
    const comfyPanels = useMemo(
        () => ({
            library: hasComfyPanels && sidebarOpen && sidebarMode === "comfy" ? comfyLibrary : null,
            properties: hasComfyPanels && inspectorOpen && inspectorSection === "comfy-properties",
            logs: hasComfyPanels && showComfyLogs,
        }),
        [comfyLibrary, hasComfyPanels, inspectorOpen, inspectorSection, showComfyLogs, sidebarMode, sidebarOpen]
    );
    const openComfyProperties = () => {
        $krontermInspectorSection.set("comfy-properties");
        $krontermInspectorCompact.set(false);
        $krontermInspectorOpen.set(true);
    };
    const sceneZIndices = useMemo(
        () => getOSSceneZIndices(state),
        [state.sceneOrder, state.zOrder, state.objects, state.windows]
    );
    const persistTimerRef = useRef<number | undefined>(undefined);
    const checkpointTimerRef = useRef<number | undefined>(undefined);
    const [measuredViewport, setViewport] = useState({ width: 1440, height: 900 });
    const [desktopWidgetsEnabled, setDesktopWidgetsEnabled] = useState(() => readDesktopWidgetsEnabled());
    const reserveMinimizedApps =
        desktopWidgetsEnabled && Object.values(state.windows).some((window) => window.collapsed);
    const viewport = useMemo(
        () => ({
            ...measuredViewport,
            rightInset: osDesktopInsetsForWidth(measuredViewport.width, reserveMinimizedApps).right,
        }),
        [measuredViewport, reserveMinimizedApps]
    );
    const [workspaceSetupOpen, setWorkspaceSetupOpen] = useState(false);
    const [editingWorkspaceSetup, setEditingWorkspaceSetup] = useState(false);
    const pendingWorkspaceId = useRef<string>(undefined);
    const pendingSessionFocus = useRef<{ tabId: string; blockId: string }>(undefined);
    const [tool, setTool] = useState<OSCanvasTool>("select");
    const [connectorStartId, setConnectorStartId] = useState<string | undefined>(undefined);
    const [canvasHint, setCanvasHint] = useState("");
    const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string; tabId?: string }>>([]);
    const [dragBounds, setDragBounds] = useState<Record<string, DragBounds>>({});
    const [alignmentGuides, setAlignmentGuides] = useState<OSAlignmentGuide[]>([]);
    const [marquee, setMarquee] = useState<DragBounds>();
    const [marqueeSelection, setMarqueeSelection] = useState<string[]>([]);
    const [canvasPointerCaptured, setCanvasPointerCaptured] = useState(false);
    const marqueeRef = useRef<{
        pointerId: number;
        start: CanvasPoint;
        last?: DragBounds;
    }>(undefined);
    const [dockPreview, setDockPreview] = useState<DockPreview | undefined>(undefined);
    const [paneTakeover, setPaneTakeover] = useState<ReturnType<typeof getOSPaneTakeover>>();
    const [resizingPane, setResizingPane] = useState(false);
    const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | undefined>(
        undefined
    );
    const interactionRef = useRef<
        | {
              kind: "move" | "resize" | "add";
              freeDrag: boolean;
              edge: OSResizeEdge;
              blockId: string;
              pointerId: number;
              clientX: number;
              clientY: number;
              bounds: DragBounds;
              group?: Record<string, DragBounds>;
              snapTargets?: DragBounds[];
              latestBounds?: DragBounds;
              dockTarget?: DockPreview;
              takeover?: ReturnType<typeof getOSPaneTakeover>;
              scale: number;
          }
        | undefined
    >(undefined);
    const reducedMotion = useReducedMotion() ?? false;
    const currentWorkspace = useAtomValue(atoms.workspace);
    useOSSpaceSnapshot(currentWorkspace?.oid, state, viewportRef);
    const systemModel = OSSystemModel.getInstance();
    const systemLoadState = useAtomValue(systemModel.loadStateAtom);
    const systemLayerEnabled = useAtomValue(getSettingsKeyAtom("feature:systemlayer" as never)) ?? true;
    stateRef.current = state;

    const descriptors = useBlockDescriptors(blockIds, blockIdsKey);
    const compactDeviceBlocks = useAtomValue(CompactDeviceBlocksAtom);
    const viewsKey = descriptors.map((descriptor) => (descriptor.resolved ? descriptor.view : "?")).join(":");

    const installedAppDescriptors = useInstalledAppDescriptors();

    useEffect(() => {
        if (!currentWorkspace?.oid) return;
        systemModel.reconcileAppInstances(
            currentWorkspace.oid,
            descriptors
                .filter((descriptor) => descriptor.resolved)
                .map((descriptor) => ({
                    blockId: descriptor.blockId,
                    appId: systemAppIdForBlock(descriptor),
                    collapsed: state.windows[descriptor.blockId]?.collapsed,
                }))
        );
    }, [currentWorkspace?.oid, descriptors, state.windows, systemModel]);

    useEffect(() => hermesSurfaceController.clampToViewport(), []);

    useEffect(() => {
        if (!currentWorkspace?.oid) return;
        void systemModel.loadSpace(currentWorkspace.oid);
    }, [currentWorkspace?.oid, systemModel]);

    useEffect(() => {
        const root = viewportRef.current;
        if (!root) return;
        const observer = new ResizeObserver(([entry]) => {
            setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
        });
        observer.observe(root);
        return () => observer.disconnect();
    }, []);

    useEffect(
        () =>
            subscribeAgentActivityStream((activity) => {
                if (currentWorkspace?.oid) {
                    void systemModel.recordAgentActivity(currentWorkspace.oid, activity);
                }
            }),
        [currentWorkspace?.oid, systemModel]
    );

    useEffect(() => {
        let cancelled = false;
        const refresh = () =>
            void RpcApi.WorkspaceListCommand(TabRpcClient, {})
                .then((items) => {
                    if (cancelled) return;
                    setWorkspaces(
                        (items ?? []).map((item, index) => ({
                            id: item.workspacedata.oid,
                            tabId: item.workspacedata.activetabid || item.workspacedata.tabids?.[0],
                            name: item.workspacedata.name || `Workspace ${index + 1}`,
                        }))
                    );
                })
                .catch(() => {
                    if (!cancelled) setWorkspaces([]);
                });
        refresh();
        const unsubscribe = waveEventSubscribeSingle({ eventType: "workspace:update", handler: refresh });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [state.scene.kind, currentWorkspace?.oid]);

    const persist = useCallback(
        (nextState: OSModeState, immediate = false) => {
            if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
            const write = () => {
                persistTimerRef.current = undefined;
                void RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("tab", tabId),
                    meta: {
                        "layout:mode": "os",
                        "layout:os": {
                            ...nextState,
                            sceneOrder: getPersistedOSSceneOrder(nextState),
                            objects: nextState.objects.filter((object) => object.kind !== "workflow-node"),
                        },
                    } as unknown as MetaType,
                });
                if (currentWorkspace?.oid) {
                    if (checkpointTimerRef.current != null) window.clearTimeout(checkpointTimerRef.current);
                    checkpointTimerRef.current = window.setTimeout(() => {
                        checkpointTimerRef.current = undefined;
                        void systemModel.saveCheckpoint(currentWorkspace.oid, tabId, makeOSRecoverySnapshot(nextState));
                    }, 1_500);
                }
            };
            if (immediate) write();
            else persistTimerRef.current = window.setTimeout(write, OSSaveDelayMs);
        },
        [currentWorkspace?.oid, systemModel, tabId]
    );

    useEffect(
        () => () => {
            if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
            if (checkpointTimerRef.current != null) window.clearTimeout(checkpointTimerRef.current);
        },
        []
    );

    const setAndPersist = useCallback(
        (updater: (current: OSModeState) => OSModeState, immediate = false, fromViewSelector = false) => {
            const current = stateRef.current;
            const next = keepKronOSV2View(current, updater(current), fromViewSelector);
            if (next === current) return;
            stateRef.current = next;
            setState(next);
            persist(next, immediate);
        },
        [persist]
    );

    const onPenWidgets = useCallback(({ widgets, selectedBlockIds }: PenWidgetSnapshot) => {
        setPenLayerWidget(selectedBlockIds.length === 1 ? selectedBlockIds[0] : undefined);
        const focusedWidget = widgets.find((widget) => widget.blockId === penActiveWidget);
        if (focusedWidget && !focusedWidget.visible) leavePenWidget();
        setAndPersist((current) => {
            if (current.view !== "kronos-v2" || widgets.length === 0) return current;
            const kronosV2Widgets = updateKronOSV2Widgets(current.kronosV2Widgets, widgets);
            return kronosV2Widgets === current.kronosV2Widgets ? current : { ...current, kronosV2Widgets };
        });
    }, [leavePenWidget, penActiveWidget, setAndPersist]);

    const updatePenWidget = useCallback((blockId: string, patch: Partial<PenWidgetGeometry>) => {
        setAndPersist((current) => {
            const widget = getKronOSV2Widget(current, blockId);
            if (current.view !== "kronos-v2" || !widget) return current;
            const kronosV2Widgets = updateKronOSV2Widgets(current.kronosV2Widgets, [{ ...widget, ...patch }]);
            return kronosV2Widgets === current.kronosV2Widgets ? current : { ...current, kronosV2Widgets };
        });
    }, [setAndPersist]);

    const setPenWidgetVisible = useCallback((blockId: string, visible: boolean) => {
        updatePenWidget(blockId, { visible });
        if (!visible && (penActiveWidgetRef.current === blockId || penInputWidgetRef.current === blockId)) returnToPenCanvas();
    }, [returnToPenCanvas, updatePenWidget]);

    const togglePenWidgetExpansion = useCallback((blockId: string) => {
        if (penActiveWidget === blockId) returnToPenCanvas();
        else setPenActiveWidget(blockId);
    }, [penActiveWidget, returnToPenCanvas]);

    useEffect(() => {
        if (!designSelected) {
            return;
        }
        setTool("select");
        setAndPersist((current) =>
            current.view === "kronos-v2" ? current : reduceOSModeState(current, { type: "os.view.set", view: "design" })
        );
    }, [designSelected, setAndPersist]);

    const hasSelectedWorkflowNode = state.objects.some(
        (object) => object.id === state.selectedEntityId && object.kind === "workflow-node"
    );
    useEffect(() => {
        if (!hasSelectedWorkflowNode) return;
        const current = stateRef.current;
        const node = current.objects.find((object) => object.id === current.selectedEntityId);
        if (!node) return;
        const camera = keepWorkflowNodeVisible(current.camera, node, measuredViewport);
        if (camera !== current.camera) setAndPersist((next) => ({ ...next, camera }));
    }, [hasSelectedWorkflowNode, state.selectedEntityId, measuredViewport, setAndPersist]);

    const selectCanvasObject = useCallback(
        (id: string) => {
            setMarqueeSelection([]);
            setCanvasHint("");
            if (tool !== "connector") {
                setAndPersist((current) => selectOSSceneEntity(current, id));
                return;
            }
            if (!connectorStartId) {
                setConnectorStartId(id);
                setAndPersist((current) => selectOSSceneEntity(current, id));
                return;
            }
            if (connectorStartId !== id) {
                const objects = stateRef.current.objects;
                if (
                    [connectorStartId, id].every((key) =>
                        objects.some((object) => object.id === key && object.kind === "workflow-node")
                    )
                ) {
                    setCanvasHint("Connect workflow nodes using their input and output ports.");
                } else {
                    setAndPersist((current) =>
                        selectOSSceneEntity(
                            {
                                ...current,
                                objects: [
                                    ...current.objects,
                                    {
                                        id: `connector-${crypto.randomUUID()}`,
                                        kind: "connector",
                                        x: 0,
                                        y: 0,
                                        width: 1,
                                        height: 1,
                                        fromObjectId: connectorStartId,
                                        toObjectId: id,
                                    },
                                ],
                            },
                            id
                        )
                    );
                }
            }
            setConnectorStartId(undefined);
            setTool("select");
        },
        [tool, connectorStartId, setAndPersist]
    );

    useEffect(() => {
        if (comfyWorkflowOpen) setAndPersist(activateOSWorkflowCanvas);
    }, [comfyWorkflowOpen, setAndPersist]);

    useEffect(() => {
        setAndPersist((current) =>
            arrangeOSLaunchedWindows(
                current,
                reconcileOSModeState(current, blockIds, resolvedViewsByBlockId(descriptors)),
                viewport
            )
        );
    }, [blockIdsKey, viewsKey]);

    useEffect(() => {
        const selectWorkflowObject = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (!workflowEventMatchesTab(detail, tabId)) return;
            if (detail?.id) {
                if (
                    stateRef.current.objects.some(
                        (object) => object.id === detail.id && object.kind === "workflow-node"
                    )
                )
                    selectCanvasObject(detail.id);
                return;
            }
            setAndPersist((current) => applyOSWorkflowSelection(current, detail?.id));
        };
        window.addEventListener("kronterm:workflow-selection", selectWorkflowObject);
        return () => window.removeEventListener("kronterm:workflow-selection", selectWorkflowObject);
    }, [tabId, selectCanvasObject, setAndPersist]);
    const dispatch = useCallback(
        (action: OSSpatialAction) => {
            if (stateRef.current.view === "kronos-v2") {
                switch (action.type) {
                    case "os.view.set":
                    case "spatial.setWidgetPresentation":
                        return;
                    case "spatial.focus":
                    case "os.window.focus":
                    case "os.window.maximize":
                        if (!stateRef.current.windows[action.blockId]) return;
                        updatePenWidget(action.blockId, { visible: true });
                        setPenActiveWidget(action.blockId);
                        return;
                    case "spatial.collapse":
                    case "os.window.minimize":
                        setPenWidgetVisible(action.blockId, false);
                        return;
                    case "spatial.restore":
                    case "os.window.restore":
                        setPenWidgetVisible(action.blockId, true);
                        if (penActiveWidgetRef.current === action.blockId) returnToPenCanvas();
                        return;
                    case "spatial.move":
                    case "os.window.move":
                        updatePenWidget(action.blockId, { x: action.x, y: action.y });
                        return;
                    case "spatial.resize":
                    case "os.window.resize":
                        updatePenWidget(action.blockId, { width: action.width, height: action.height });
                        return;
                    case "spatial.dock":
                    case "os.window.snap": {
                        const target = getKronOSV2Widget(stateRef.current, action.targetBlockId);
                        if (!target || target.blockId === action.blockId) return;
                        const width = target.width / 2;
                        const sourceX = action.side === "left" ? target.x : target.x + width;
                        const targetX = action.side === "left" ? target.x + width : target.x;
                        updatePenWidget(action.blockId, { x: sourceX, y: target.y, width, height: target.height, visible: true });
                        updatePenWidget(target.blockId, { x: targetX, width });
                        leavePenWidget();
                        return;
                    }
                    case "os.window.setBounds":
                        updatePenWidget(action.blockId, { ...action.bounds, visible: true });
                        return;
                    case "os.window.arrangeBounds":
                        for (const [id, bounds] of Object.entries(action.bounds)) updatePenWidget(id, bounds);
                        return;
                    case "spatial.showOverview":
                    case "os.window.overview":
                    case "spatial.restoreScene":
                    case "spatial.freeform":
                        returnToPenCanvas();
                        return;
                }
            }
            setAndPersist((current) => reduceOSModeState(current, action));
        },
        [leavePenWidget, returnToPenCanvas, setAndPersist, setPenWidgetVisible, updatePenWidget]
    );

    useEffect(() => {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (rect == null || rect.width < 1 || rect.height < 1) return;
        setAndPersist((current) => {
            const windows = Object.fromEntries(
                Object.entries(current.windows).map(([blockId, window]) => [
                    blockId,
                    {
                        ...window,
                        bounds: recoverOSWindowBounds(window.bounds, { width: rect.width, height: rect.height }),
                    },
                ])
            );
            return { ...current, windows };
        });
    }, [setAndPersist, viewport.height, viewport.width]);

    const addObject = useCallback(
        (kind: OSCanvasObjectKind, text?: string, input?: Partial<WorkspaceSurfaceControlInput>) => {
            const camera = stateRef.current.camera;
            const width = kind === "note" ? 260 : 220;
            const height = kind === "note" ? 180 : 160;
            const object: OSCanvasObject = {
                id: `${kind}-${crypto.randomUUID()}`,
                kind,
                x: (viewport.width / 2 - camera.x) / camera.zoom - width / 2,
                y: (viewport.height / 2 - camera.y) / camera.zoom - height / 2,
                width,
                height,
                text: text ?? (kind === "note" ? "New note" : undefined),
                color: OSCanvasColors[stateRef.current.objects.length % OSCanvasColors.length],
            };
            setAndPersist((current) => ({
                ...current,
                objects: [...current.objects, placeOSCanvasObject(current, object, input)],
                selectedEntityId: object.id,
            }));
            setTool("select");
        },
        [setAndPersist, viewport]
    );

    const pinResource = useCallback(
        (resource: OSResourceReference, position?: { x?: number; y?: number }, keepPlacement = false) => {
            const camera = stateRef.current.view === "kronos-v2" ? penCameraRef.current : stateRef.current.camera;
            const isFile = resource.kind === "file" || resource.kind === "generated-artifact";
            const isFolder = resource.kind === "folder";
            const { width, height } = canvasResourceCardSize(resource);
            const object: OSCanvasObject = {
                id: `resource-${crypto.randomUUID()}`,
                kind: resource.kind,
                x: position?.x ?? (viewport.width / 2 - camera.x) / camera.zoom - width / 2,
                y: position?.y ?? (viewport.height / 2 - camera.y) / camera.zoom - height / 2,
                width,
                height,
                text: resource.name,
                resource: resource.resource,
                color: "slate",
                render: resource.render,
            };
            setAndPersist((current) => ({
                ...current,
                view: current.view === "kronos-v2" ? "kronos-v2" : "canvas",
                scene: { kind: "freeform" },
                objects: [
                    ...current.objects,
                    !keepPlacement && (isFile || isFolder) ? placeOSCanvasObject(current, object) : object,
                ],
                selectedEntityId: object.id,
            }), true);
            return object.id;
        },
        [setAndPersist, viewport]
    );

    const importResources = useCallback((resources: OSResourceReference[], clientPoint?: CanvasPoint) => {
        const viewportBounds = viewportRef.current?.getBoundingClientRect();
        if (!viewportBounds) return;
        const v2 = stateRef.current.view === "kronos-v2";
        const bounds = (v2 && penLivePlaneRef.current?.getBoundingClientRect()) || viewportBounds;
        const penCamera = penCameraRef.current;
        const camera = v2 ? {
            ...penCamera,
            x: penCamera.x - (bounds.left - viewportBounds.left),
            y: penCamera.y - (bounds.top - viewportBounds.top),
        } : stateRef.current.camera;
        const center = clientPoint
            ? { x: clientPoint.x - bounds.left, y: clientPoint.y - bounds.top }
            : { x: bounds.width / 2, y: bounds.height / 2 };
        for (const [index, resource] of resources.entries()) {
            const { width, height } = canvasResourceCardSize(resource);
            const inset = 12;
            const x = Math.max(inset, Math.min(
                center.x - width * camera.zoom / 2 + index * 22,
                bounds.width - width * camera.zoom - inset
            ));
            const y = Math.max(inset, Math.min(
                center.y - height * camera.zoom / 2 + index * 22,
                bounds.height - height * camera.zoom - inset
            ));
            const point = screenRectToWorld({ x, y, width: 0, height: 0 }, camera);
            pinResource(resource, point, true);
        }
    }, [pinResource]);

    const openCanvasFolderEntry = useCallback(
        (folder: OSCanvasObject, path: string, name: string) => {
            const current = stateRef.current;
            const existing = current.objects.find((object) => object.kind === "file" && object.resource === path);
            if (existing) {
                setAndPersist((state) => selectOSSceneEntity(state, existing.id));
                return;
            }
            const bounds = viewportRef.current?.getBoundingClientRect();
            const resource = canvasFileResource(path, name);
            if (!bounds) {
                pinResource(resource);
                return;
            }
            const { width, height } = canvasResourceCardSize(resource);
            const camera = current.view === "kronos-v2" ? penCameraRef.current : current.camera;
            const folderRight = (folder.x + folder.width) * camera.zoom + camera.x;
            const folderLeft = folder.x * camera.zoom + camera.x;
            const right = folderRight + width * camera.zoom + 24 <= bounds.width;
            importResources([resource], {
                x: bounds.left + (right ? folderRight + 24 + width * camera.zoom / 2 : folderLeft - 24 - width * camera.zoom / 2),
                y: bounds.top + (folder.y + height / 2) * camera.zoom + camera.y,
            });
        },
        [importResources, pinResource, setAndPersist]
    );

    useEffect(() => {
        const onPaste = (event: ClipboardEvent) => {
            const canvas = viewportRef.current;
            if (!canvas || !event.clipboardData || event.defaultPrevented || !["canvas", "kronos-v2"].includes(stateRef.current.view)) return;
            const target = event.target;
            if (!(target instanceof Node) || !isCanvasPasteTarget(target)) return;
            if (!canvas.contains(target) && target !== document.body && target !== document.documentElement) return;
            if (importCanvasTransfer(
                event.clipboardData,
                getApi(),
                importResources,
                setCanvasHint,
                true
            )) {
                event.preventDefault();
            }
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, [importResources]);

    const addPenDocument = useCallback(
        ({ path, layers }: PenProjectDocument) => {
            if (stateRef.current.loadedPenPaths?.includes(path)) return;
            const bounds = spatialBoundsForRects(layers);
            setAndPersist((current) => {
                const next = { ...current, loadedPenPaths: [...(current.loadedPenPaths ?? []), path] };
                if (!bounds) return next;
                const existing = spatialBoundsForRects(current.objects.filter((object) => object.pen));
                const x = existing ? existing.x + existing.width + 96 - bounds.x : 0;
                const y = existing ? existing.y - bounds.y : 0;
                return {
                    ...next,
                    objects: [
                        ...current.objects,
                        ...layers.map((layer) => ({ ...layer, x: layer.x + x, y: layer.y + y })),
                    ],
                    selectedEntityId: current.selectedEntityId ?? layers[0].id,
                    camera: existing
                        ? current.camera
                        : fitSpatialViewportToBounds(
                              bounds,
                              viewportRef.current?.getBoundingClientRect() ?? { width: 1440, height: 900 },
                              96,
                              1
                          ),
                };
            });
        },
        [setAndPersist]
    );

    const createPenLayer = useCallback(
        (type: PenDrawingTool, patch: Partial<OSCanvasObject> = {}, fill?: string, geometry?: string) => {
            const id = crypto.randomUUID();
            const { camera } = stateRef.current;
            const width = patch.width ?? (type === "frame" ? 480 : 160);
            const height = patch.height ?? (type === "frame" ? 320 : type === "text" ? 32 : 96);
            const layer: OSCanvasObject = {
                id,
                kind: "pen-layer",
                name: type[0].toUpperCase() + type.slice(1),
                width,
                height,
                x: (viewport.width / 2 - camera.x) / camera.zoom - width / 2,
                y: (viewport.height / 2 - camera.y) / camera.zoom - height / 2,
                text: type === "text" || type === "note" ? "Text" : undefined,
                ...patch,
                pen: {
                    documentId: id,
                    type,
                    fill:
                        fill ??
                        (type === "note"
                            ? "#fee484"
                            : type === "path"
                              ? undefined
                              : type === "text"
                                ? "#ffffff"
                                : "#6466ed"),
                    geometry: type === "path" ? (geometry ?? "M0 24 L12 0 L24 24") : undefined,
                    viewBox: type === "path" ? (geometry ? `0 0 ${width} ${height}` : "0 0 24 24") : undefined,
                    stroke: type === "path" ? "#6466ed" : undefined,
                    strokeWidth: type === "path" ? 2 : undefined,
                    fontSize: type === "text" || type === "note" ? 16 : undefined,
                },
            };
            setAndPersist((current) => ({
                ...activateOSWorkflowCanvas(current),
                objects: [...current.objects, layer],
                selectedEntityId: id,
            }));
            return id;
        },
        [setAndPersist, viewport]
    );

    const openResource = useCallback(
        (resource: OSResourceReference | OSCanvasObject) => {
            if (!resource.resource) return;
            if (resource.kind === "url") {
                getApi().openExternal(resource.resource);
                return;
            }
            if (resource.kind === "file") {
                const path = resource.resource;
                if (canvasMediaUrl(path)) {
                    getApi().openExternal(path);
                    return;
                }
                const media = classifyMedia({ path, mimetype: undefined, isdir: false });
                if (
                    !["image", "video", "audio"].includes(media) &&
                    !getModelPreviewFormat(path) &&
                    !/\.pdf$/i.test(path)
                ) {
                    openKrontermFile(path);
                    return;
                }
            }
            void RpcApi.CreateBlockCommand(TabRpcClient, {
                tabid: tabId,
                blockdef: { meta: { view: "preview", file: resource.resource } },
            }).then((oref) => {
                const blockId = WOS.splitORef(oref)[1];
                dispatch({ type: "os.view.set", view: "canvas" });
                dispatch({ type: "os.window.focus", blockId });
            });
        },
        [dispatch, tabId]
    );

    const updateObject = useCallback(
        (objectId: string, patch: Partial<OSCanvasObject>) => {
            if (stateRef.current.objects.some((object) => object.id === objectId && object.kind === "workflow-node")) {
                const detail = { tabId, objectId, patch, result: undefined as { success: boolean; message: string } };
                window.dispatchEvent(new CustomEvent("kronterm:workflow-object-command", { detail }));
                return detail.result ?? { success: false, message: "Workflow editor is not ready." };
            }
            const definedPatch = Object.fromEntries(
                Object.entries(patch).filter(([, value]) => value != null)
            ) as Partial<OSCanvasObject>;
            setAndPersist((current) => {
                const layer = current.objects.find((object) => object.id === objectId && object.pen);
                const descendants = new Set([objectId]);
                const dx = layer && patch.x != null ? patch.x - layer.x : 0;
                const dy = layer && patch.y != null ? patch.y - layer.y : 0;
                return {
                    ...current,
                    objects: current.objects.map((object) => {
                        if (object.id === objectId) return { ...object, ...definedPatch };
                        if (!(dx || dy) || !descendants.has(object.pen?.parentId)) return object;
                        descendants.add(object.id);
                        return { ...object, x: object.x + dx, y: object.y + dy };
                    }),
                    selectedEntityId: objectId,
                };
            });
            return { success: true, message: "Updated OS object." };
        },
        [setAndPersist, tabId]
    );

    const deleteObject = useCallback(
        (objectId: string) => {
            if (stateRef.current.objects.some((object) => object.id === objectId && object.kind === "workflow-node")) {
                const detail = {
                    tabId,
                    objectId,
                    remove: true,
                    result: undefined as { success: boolean; message: string },
                };
                window.dispatchEvent(new CustomEvent("kronterm:workflow-object-command", { detail }));
                return detail.result ?? { success: false, message: "Workflow editor is not ready." };
            }
            setAndPersist((current) => {
                const removed = new Set([objectId]);
                for (const object of current.objects) {
                    if (removed.has(object.pen?.parentId)) removed.add(object.id);
                }
                return {
                    ...current,
                    objects: current.objects.filter(
                        (object) => ![object.id, object.fromObjectId, object.toObjectId].some((id) => removed.has(id))
                    ),
                    selectedEntityId: removed.has(current.selectedEntityId) ? undefined : current.selectedEntityId,
                };
            });
        },
        [setAndPersist, tabId]
    );

    const fitAll = useCallback(() => {
        const rects = [
            ...Object.values(stateRef.current.windows)
                .filter((window) => !window.collapsed)
                .map((window) => window.bounds),
            ...stateRef.current.objects.filter((object) => object.kind !== "connector"),
        ];
        const bounds = spatialBoundsForRects(rects);
        if (!bounds) return;
        const visibleViewport = viewport;
        const padding = Math.min(120, visibleViewport.width / 4, visibleViewport.height / 4);
        setAndPersist((current) => ({
            ...current,
            camera: fitSpatialViewportToBounds(bounds, visibleViewport, padding, 1),
        }));
    }, [setAndPersist, viewport]);

    useEffect(() => {
        const action = (event: Event) => {
            const current = stateRef.current;
            const rect = rootRef.current?.getBoundingClientRect();
            if (current.view !== "canvas" || current.scene.kind !== "freeform" || !rect?.width || !rect.height) return;
            const name = (event as CustomEvent).detail?.action;
            if (name === "select" || name === "pan" || name === "connector") {
                setConnectorStartId(undefined);
                setCanvasHint(name === "connector" ? "Select two objects to connect." : "");
                setTool(name === "pan" ? "hand" : name);
                return;
            }
            if (["note", "rectangle", "ellipse", "diamond"].includes(name)) {
                addObject(name);
                return;
            }
            if (name === "fit-all") {
                fitAll();
                return;
            }
            if (name === "workflow-nodes") {
                window.dispatchEvent(
                    new CustomEvent("kronterm:workflow-inspector", {
                        detail: { tabId, section: "workflow-nodes" },
                    })
                );
                return;
            }
            const nativeSelectors: Record<string, string> = {
                "workflow-fit": '[data-test-id="zoom-to-fit"]',
                "zoom-in": '[data-test-id="zoom-in-button"]',
                "zoom-out": '[data-test-id="zoom-out-button"]',
                tidy: '[data-test-id="tidy-up-button"]',
                "workflow-note": '[data-test-id="add-sticky-button"]',
                "workflow-focus": '[data-test-id="toggle-focus-panel-button"]',
                "workflow-assistant":
                    '[data-test-id="instance-ai-canvas-action-button"], [data-test-id="ask-assistant-canvas-action-button"]',
            };
            const selector = nativeSelectors[name];
            if (!selector) return;
            const button = workflowToolsTarget?.shadowRoot?.querySelector<HTMLButtonElement>(selector);
            if (button) button.click();
            else setCanvasHint("Open a workflow to use this control.");
        };
        window.addEventListener("kronterm:canvas-toolbar-action", action);
        return () => {
            window.removeEventListener("kronterm:canvas-toolbar-action", action);
        };
    }, [addObject, fitAll, tabId, workflowToolsTarget]);

    const focusBlock = useCallback(
        (blockId: string) => {
            setMarqueeSelection([]);
            if (tool === "connector") {
                selectCanvasObject(blockId);
                return;
            }
            setAndPersist((current) =>
                current.scene.kind === "focused" && current.scene.blockId !== blockId
                    ? reduceOSModeState(current, { type: "os.window.focus", blockId })
                    : {
                          ...selectOSSceneEntity(current, blockId),
                          zOrder: [...current.zOrder.filter((id) => id !== blockId), blockId],
                      }
            );
        },
        [setAndPersist, tool, selectCanvasObject]
    );

    const primaryBlockId =
        state.scene.kind === "focused"
            ? state.scene.blockId
            : state.scene.kind === "grouped"
              ? state.groups[state.scene.groupId]?.primaryBlockId
              : undefined;

    const dockBlock = useCallback(
        (blockId: string, side: "left" | "right") => {
            const current = stateRef.current;
            const group = current.scene.kind === "grouped" ? current.groups[current.scene.groupId] : undefined;
            const targetBlockId =
                (primaryBlockId === blockId ? group?.blockIds.find((id) => id !== blockId) : primaryBlockId) ??
                current.zOrder.filter((id) => id !== blockId).at(-1);
            if (!targetBlockId) return;
            dispatch({ type: "spatial.dock", blockId, targetBlockId, side });
        },
        [dispatch, primaryBlockId]
    );

    const handleClose = useCallback((blockId: string) => {
        return services.ObjectService.DeleteBlock(blockId);
    }, []);

    const handleCreateBlock = useCallback(
        (view: string) => {
            if (view === "hermes") {
                hermesSurfaceController.requestOpenPanel();
                return;
            }
            if (view === "bots") {
                window.dispatchEvent(new CustomEvent("kronterm:open-plugin-widget", { detail: { view: "bots" } }));
                return;
            }
            dispatch({ type: "os.view.set", view: "canvas" });
            const existing = descriptors.find((block) => block.view === view);
            if (existing) {
                dispatch({ type: "spatial.focus", blockId: existing.blockId });
                return;
            }
            return RpcApi.CreateBlockCommand(TabRpcClient, {
                tabid: tabId,
                blockdef: { meta: { view, ...(view === "preview" ? { file: "~" } : {}) } },
            });
        },
        [descriptors, dispatch, tabId]
    );

    useEffect(() => {
        const fitToFrame = (event: Event) => {
            const frame = (event as CustomEvent<AppStreamFrameSize>).detail;
            if (!frame || frame.width <= 0 || frame.height <= 0) return;
            const current = stateRef.current;
            const window = current.windows[frame.blockId];
            if (!window || window.collapsed || current.scene.kind !== "freeform") return;
            const next = fitOSWindowToContentAspect(window.bounds, frame.width / frame.height, {
                width: viewport.width / current.camera.zoom,
                height: viewport.height / current.camera.zoom,
            });
            if (!next) return;
            setAndPersist((state) => {
                const resized = reduceOSModeState(state, {
                    type: "spatial.resize",
                    blockId: frame.blockId,
                    width: next.width,
                    height: next.height,
                });
                return reduceOSModeState(resized, {
                    type: "spatial.move",
                    blockId: frame.blockId,
                    x: next.x,
                    y: next.y,
                });
            });
        };
        window.addEventListener(AppStreamFrameSizeEvent, fitToFrame);
        return () => window.removeEventListener(AppStreamFrameSizeEvent, fitToFrame);
    }, [setAndPersist, viewport]);

    useEffect(() => {
        const reveal = (blockId: string) => {
            const descriptor = descriptors.find((block) => block.blockId === blockId);
            if (!descriptor || !stateRef.current.windows[blockId]) return false;
            if (descriptor.view === "hermes") {
                hermesSurfaceController.requestOpenPanel();
                return true;
            }
            dispatch({ type: "os.view.set", view: "canvas" });
            dispatch({ type: "spatial.focus", blockId: descriptor.blockId });
            return true;
        };
        const pending = pendingSessionFocus.current;
        if (pending && (pending.tabId !== tabId || reveal(pending.blockId))) pendingSessionFocus.current = undefined;
        const focusSession = (event: Event) => {
            const detail = (event as CustomEvent<{ blockId?: string; tabId?: string }>).detail;
            if (!detail?.blockId || (detail.tabId && detail.tabId !== tabId)) return;
            pendingSessionFocus.current = undefined;
            // CreateBlock can return before the new block has an OS window.
            if (!reveal(detail.blockId) && detail.tabId)
                pendingSessionFocus.current = { tabId, blockId: detail.blockId };
        };
        window.addEventListener(OSSessionFocusEvent, focusSession);
        return () => window.removeEventListener(OSSessionFocusEvent, focusSession);
    }, [descriptors, dispatch, tabId]);

    const handleCreateAppStream = useCallback(
        (appid: string, appname: string) => {
            dispatch({ type: "os.view.set", view: "canvas" });
            return RpcApi.CreateBlockCommand(TabRpcClient, {
                tabid: tabId,
                blockdef: {
                    meta: {
                        view: "appstream",
                        "appstream:appid": appid,
                        "appstream:appname": appname,
                    } as unknown as MetaType,
                },
            });
        },
        [dispatch, tabId]
    );

    const [dockPins, setDockPins] = useState<OSDockPin[]>(() => readOSDockPins(window.localStorage));
    const updateDockPins = useCallback((pins: OSDockPin[]) => {
        setDockPins(pins);
        writeOSDockPins(window.localStorage, pins);
    }, []);
    const toggleDesktopWidgets = useCallback(() => {
        setDesktopWidgetsEnabled((enabled) => {
            writeDesktopWidgetsEnabled(!enabled);
            return !enabled;
        });
    }, []);

    const osWorkArea = useCallback(() => {
        return computeOSWorkArea(viewport, {
            top: workflowPanelLayout.top > 0 ? 0 : OSShellReservedHeight,
            bottom: 0,
            left: 0,
            right: viewport.rightInset,
        });
    }, [viewport, workflowPanelLayout.top]);

    const placeWindow = useCallback(
        (blockId: string, placement: OSWindowPlacement) => {
            const current = stateRef.current;
            const window = current.windows[blockId];
            if (!window) return false;
            const usePen = current.view === "kronos-v2" && penViewport != null;
            const camera = usePen ? penCameraRef.current : current.camera;
            const bounds = usePen ? getKronOSV2Widget(current, blockId) : window.bounds;
            const currentScreen = {
                x: bounds.x * camera.zoom + camera.x,
                y: bounds.y * camera.zoom + camera.y,
                width: bounds.width * camera.zoom,
                height: bounds.height * camera.zoom,
            };
            const screen = computeOSPlacementBounds(placement, usePen ? penViewport : osWorkArea(), currentScreen);
            dispatch({ type: "os.view.set", view: "canvas" });
            dispatch({ type: "os.window.setBounds", blockId, bounds: screenRectToWorld(screen, camera) });
            if (usePen) leavePenWidget();
            return true;
        },
        [dispatch, leavePenWidget, osWorkArea, penViewport]
    );

    const arrangeWindows = useCallback(
        (arrangement: OSWindowArrangement) => {
            const current = stateRef.current;
            const usePen = current.view === "kronos-v2" && penViewport != null;
            const camera = usePen ? penCameraRef.current : current.camera;
            const visible = current.zOrder.filter((id) => usePen
                ? getKronOSV2Widget(current, id)?.visible
                : current.windows[id] && !current.windows[id].collapsed);
            if (visible.length === 0) return 0;
            const rects = computeOSArrangement(arrangement, visible.length, usePen ? penViewport : osWorkArea());
            dispatch({ type: "os.view.set", view: "canvas" });
            dispatch({
                type: "os.window.arrangeBounds",
                bounds: Object.fromEntries(
                    visible.map((id, index) => [id, screenRectToWorld(rects[index], camera)])
                ),
            });
            if (usePen) leavePenWidget();
            return visible.length;
        },
        [dispatch, leavePenWidget, osWorkArea, penViewport]
    );

    const launchDockPin = useCallback(
        (pin: OSDockPin) => {
            if (pin.kind === "app") {
                const running = descriptors.find((block) => block.appStreamAppId === pin.appId);
                if (running) {
                    dispatch({ type: "os.view.set", view: "canvas" });
                    dispatch({ type: "spatial.restore", blockId: running.blockId });
                    dispatch({ type: "spatial.focus", blockId: running.blockId });
                    return;
                }
                void handleCreateAppStream(pin.appId, pin.name);
                return;
            }
            const running = descriptors.find((block) => {
                if (block.view !== "web") return false;
                const url = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", block.blockId)))?.meta
                    ?.url;
                return typeof url === "string" && url.startsWith(pin.url);
            });
            dispatch({ type: "os.view.set", view: "canvas" });
            if (running) {
                dispatch({ type: "spatial.restore", blockId: running.blockId });
                dispatch({ type: "spatial.focus", blockId: running.blockId });
                return;
            }
            void RpcApi.CreateBlockCommand(TabRpcClient, {
                tabid: tabId,
                blockdef: { meta: { view: "web", url: pin.url, "frame:title": pin.name } as MetaType },
            });
        },
        [descriptors, dispatch, handleCreateAppStream, tabId]
    );

    const askKronos = useCallback((text: string) => {
        hermesSurfaceController.requestOpenChat();
        submitToHermes(text, "new");
    }, []);

    const expandCanvasWidget = useCallback(
        (blockId: string) => {
            setTool("select");
            dispatch({ type: "os.window.maximize", blockId });
        },
        [dispatch]
    );

    const getWidgetMenuItems = useCallback(
        (blockId: string, sizeAction?: ContextMenuItem): ContextMenuItem[] => {
            const model = getBlockComponentModel(blockId)?.viewModel;
            const current = stateRef.current;
            const otherWidgets = descriptors.filter((item) => item.blockId !== blockId);
            const browser = model instanceof WebViewModel ? model : null;
            const items: ContextMenuItem[] = [];
            if (browser) {
                const grabIntent = globalStore.get(browser.grabIntentAtom);
                items.push({
                    label: "Browser Tools",
                    submenu: [
                        {
                            label: "Back",
                            enabled: globalStore.get(browser.canGoBack),
                            click: () => browser.handleBack(),
                        },
                        {
                            label: "Forward",
                            enabled: globalStore.get(browser.canGoForward),
                            click: () => browser.handleForward(),
                        },
                        { label: "Reload Page", click: () => browser.handleRefresh() },
                        { label: "Find in Page…", click: () => browser.openFind() },
                        { label: "Copy Page URL", click: () => browser.copyUrlToClipboard() },
                        { type: "separator" },
                        {
                            label: "Inspect Element",
                            type: "checkbox",
                            checked: grabIntent === "grab",
                            click: () => browser.setGrabIntent(grabIntent === "grab" ? null : "grab"),
                        },
                        {
                            label: "Annotate Page",
                            type: "checkbox",
                            checked: grabIntent === "annotate",
                            click: () => browser.setGrabIntent(grabIntent === "annotate" ? null : "annotate"),
                        },
                    ],
                });
            }
            if (current.view === "kronos-v2") {
                items.push({
                    label: "Widget Tools",
                    submenu: [
                        sizeAction ?? { label: "Expand Widget", click: () => togglePenWidgetExpansion(blockId) },
                        { label: "Return to Canvas", click: returnToPenCanvas },
                        { label: "Copy Widget ID", click: () => void navigator.clipboard.writeText(blockId) },
                        { type: "separator" },
                        { label: "Minimize Widget", click: () => setPenWidgetVisible(blockId, false) },
                        { label: "Close Widget", click: () => handleClose(blockId) },
                    ],
                });
                return items;
            }
            items.push(
                {
                    label: "Widget Tools",
                    submenu: [
                        sizeAction ?? { label: "Expand Widget", click: () => expandCanvasWidget(blockId) },
                        {
                            label: "Group as Tabs With",
                            enabled: otherWidgets.length > 0,
                            submenu: otherWidgets.map((item) => ({
                                label: item.title,
                                click: () => dispatch({ type: "os.tabs.group", blockId, targetBlockId: item.blockId }),
                            })),
                        },
                        {
                            label: "Detach Tab",
                            enabled: !!getOSTabGroup(current, blockId),
                            click: () => dispatch({ type: "os.tabs.detach", blockId }),
                        },
                        {
                            label: "Dock Left",
                            enabled: otherWidgets.length > 0,
                            click: () => dockBlock(blockId, "left"),
                        },
                        {
                            label: "Dock Right",
                            enabled: otherWidgets.length > 0,
                            click: () => dockBlock(blockId, "right"),
                        },
                        { label: "Copy Widget ID", click: () => void navigator.clipboard.writeText(blockId) },
                        { type: "separator" },
                        { label: "Minimize Widget", click: () => dispatch({ type: "spatial.collapse", blockId }) },
                        { label: "Close Widget", click: () => handleClose(blockId) },
                    ],
                },
                {
                    label: "Move & Resize",
                    submenu: [
                        { label: "Left Half", sublabel: "⌃⌥←", click: () => placeWindow(blockId, "left") },
                        { label: "Right Half", sublabel: "⌃⌥→", click: () => placeWindow(blockId, "right") },
                        { label: "Top Half", click: () => placeWindow(blockId, "top") },
                        { label: "Bottom Half", click: () => placeWindow(blockId, "bottom") },
                        { type: "separator" },
                        { label: "Fill Canvas", sublabel: "⌃⌥↑", click: () => placeWindow(blockId, "fill") },
                        { label: "Center Widget", sublabel: "⌃⌥C", click: () => placeWindow(blockId, "center") },
                        { label: "Tile All Widgets", click: () => arrangeWindows("tile") },
                    ],
                }
            );
            return items;
        },
        [
            arrangeWindows, descriptors, dispatch, dockBlock, expandCanvasWidget, handleClose, placeWindow,
            returnToPenCanvas, setPenWidgetVisible, togglePenWidgetExpansion,
        ]
    );

    const showWindowContextMenu = useCallback(
        (event: React.MouseEvent, blockId: string, sizeAction?: ContextMenuItem) => {
            ContextMenuModel.getInstance().showContextMenu(getWidgetMenuItems(blockId, sizeAction), event);
        },
        [getWidgetMenuItems]
    );

    const showDesktopContextMenu = useCallback(
        (event: React.MouseEvent) => {
            const current = stateRef.current;
            const openCount = current.zOrder.filter((id) => !current.windows[id]?.collapsed).length;
            const onCanvas = current.view === "canvas" && current.scene.kind === "freeform";
            const selected = current.windows[current.selectedEntityId];
            ContextMenuModel.getInstance().showContextMenu(
                [
                    {
                        label: "New Window",
                        submenu: [
                            { label: "Terminal", click: () => handleCreateBlock("term") },
                            { label: "Browser", click: () => handleCreateBlock("web") },
                            { label: "Files", click: () => handleCreateBlock("preview") },
                            { label: "KronOS Agent", click: () => hermesSurfaceController.requestOpenChat() },
                        ],
                    },
                    ...(onCanvas && selected && !selected.collapsed
                        ? [{ type: "separator" as const }, ...getWidgetMenuItems(current.selectedEntityId)]
                        : []),
                    { type: "separator" },
                    { label: "Tile Windows", enabled: openCount > 0, click: () => arrangeWindows("tile") },
                    { label: "Cascade Windows", enabled: openCount > 0, click: () => arrangeWindows("cascade") },
                    {
                        label: "Show All Windows",
                        enabled: openCount > 0,
                        click: () => dispatch({ type: "spatial.showOverview" }),
                    },
                    { type: "separator" },
                    {
                        label: "Show Desktop Widgets",
                        type: "checkbox",
                        checked: desktopWidgetsEnabled,
                        click: toggleDesktopWidgets,
                    },
                    { label: "Fit All on Canvas", visible: onCanvas, click: fitAll },
                    {
                        label: "Show Canvas Tools",
                        type: "checkbox",
                        visible: onCanvas && systemLayerEnabled,
                        checked: canvasToolsOpen,
                        click: () => setCanvasToolsOpen((open) => !open),
                    },
                    {
                        label: "Grab Element",
                        visible: onCanvas,
                        click: () => window.dispatchEvent(new Event("kronterm:workspace-picker-activate")),
                    },
                    { label: "Search…", click: () => toggleCommandCenter() },
                ],
                event
            );
        },
        [
            arrangeWindows,
            canvasToolsOpen,
            desktopWidgetsEnabled,
            dispatch,
            fitAll,
            getWidgetMenuItems,
            handleCreateBlock,
            systemLayerEnabled,
            toggleDesktopWidgets,
        ]
    );

    useEffect(() => {
        return getApi().onOSOverviewGesture?.((direction) => {
            if (direction === "up") dispatch({ type: "os.window.overview" });
            else if (stateRef.current.scene.kind === "overview") dispatch({ type: "spatial.restoreScene" });
        });
    }, [dispatch]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (workflowOwnsWheel(event.composedPath())) return;
            if (
                event
                    .composedPath()
                    .some((target) => target instanceof HTMLElement && target.hasAttribute("data-workflow-native-host"))
            )
                return;
            // ⌃⌥ + arrow is the common desktop tiling chord and rarely bound by terminals or pages.
            if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey) return;
            const current = stateRef.current;
            if (current.view === "kronos-v2") return;
            const target = current.selectedEntityId;
            if (!target || !current.windows[target]) return;
            const placement: OSWindowPlacement | undefined =
                event.key === "ArrowLeft"
                    ? "left"
                    : event.key === "ArrowRight"
                      ? "right"
                      : event.key === "ArrowUp" || event.key === "Enter"
                        ? "fill"
                        : event.key === "ArrowDown"
                          ? "center"
                          : event.code === "KeyC"
                            ? "center"
                            : undefined;
            if (placement == null) return;
            event.preventDefault();
            event.stopPropagation();
            placeWindow(target, placement);
        };
        window.addEventListener("keydown", onKeyDown, true);
        return () => window.removeEventListener("keydown", onKeyDown, true);
    }, [placeWindow]);

    const handleDropApp = useCallback(
        (payload: OSAppDragPayload, worldX: number, worldY: number) => {
            if (payload.blockId != null) {
                dispatch({ type: "spatial.focus", blockId: payload.blockId });
                dispatch({ type: "spatial.move", blockId: payload.blockId, x: worldX, y: worldY });
                return;
            }
            const meta: Record<string, string> =
                payload.appid != null
                    ? {
                          view: "appstream",
                          "appstream:appid": payload.appid,
                          "appstream:appname": payload.appname ?? payload.appid,
                      }
                    : { view: payload.view ?? "term" };
            void RpcApi.CreateBlockCommand(TabRpcClient, {
                tabid: tabId,
                blockdef: { meta: meta as unknown as MetaType },
            }).then((oref) => {
                const blockId = WOS.splitORef(oref)[1];
                dispatch({ type: "spatial.focus", blockId });
                dispatch({ type: "spatial.move", blockId, x: worldX, y: worldY });
            });
        },
        [dispatch, tabId]
    );

    const windowLayouts = useMemo(() => {
        const layoutState = paneTakeover ? reduceOSModeState(state, paneTakeover) : state;
        return Object.fromEntries(
            descriptors.map((block) => {
                const computed = computeOSWindowLayout(
                    layoutState,
                    block.blockId,
                    block.view,
                    viewport,
                    compactDeviceBlocks
                );
                const dragged = dragBounds[block.blockId];
                if (!dragged) return [block.blockId, computed];
                const bounds = paneTakeover
                    ? computed.bounds
                    : compactDeviceBlocks.has(block.blockId)
                      ? { ...dragged, width: getSingleDeviceWorkspaceWidth(dragged.width, dragged.height) }
                      : dragged;
                return [block.blockId, { ...computed, bounds, rotateY: 0, scale: 1, opacity: 1, zIndex: 900 }];
            })
        );
    }, [compactDeviceBlocks, descriptors, dragBounds, paneTakeover, state, viewport]);

    const penWidgets = useMemo<PenLiveWidget[]>(() => {
        if (!kronosV2) return undefined;
        return descriptors.flatMap(({ blockId, title, resolved }) => {
            const widget = getKronOSV2Widget(state, blockId);
            return resolved && widget ? [{ ...widget, title }] : [];
        });
    }, [kronosV2, descriptors, state.windows, state.kronosV2Widgets]);
    const chatDockTabs = useMemo(() => [
        ...dedicatedChatDockTabs.map((tab) => ({ ...tab, canvas: kronosV2 })),
        ...(kronosV2 ? descriptors.filter(({ blockId, resolved }) =>
            resolved && !dedicatedChatDockTabs.some((tab) => tab.id === blockId) &&
            getKronOSV2Widget(state, blockId)?.visible
        ).map(({ blockId, title, view }) => ({
            id: blockId,
            app: view === "web" ? "browser" as const : view === "term" ? "terminal" as const : "widget" as const,
            title,
            canvas: true,
        })) : []),
    ], [dedicatedChatDockTabs, kronosV2, descriptors, state.windows, state.kronosV2Widgets]);
    const penWidgetsById = useMemo(() => new Map(penWidgets?.map((widget) => [widget.blockId, widget])), [penWidgets]);
    const penFocusedWidget = !penPresentation.active && penWidgetsById.get(penActiveWidget)?.visible
        ? penActiveWidget
        : undefined;
    const followPenAgentPointer = (point: { x: number; y: number }) => {
        if (penAgentFollowPaused.current || !penViewport || penFocusedWidget || penPresentation.active || penOverlayOpen || penFullChat) return;
        const canvas = viewportRef.current?.getBoundingClientRect();
        if (!canvas) return;
        const centerX = penViewport.x + penViewport.width / 2;
        const centerY = penViewport.y + penViewport.height / 2;
        const dx = centerX - (point.x - canvas.x);
        const dy = centerY - (point.y - canvas.y);
        if (Math.abs(dx) < penViewport.width * 0.15 && Math.abs(dy) < penViewport.height * 0.15) return;
        const camera = penCameraRef.current;
        setPenRequestedCamera({ x: camera.x + dx, y: camera.y + dy, zoom: camera.zoom });
    };
    const penSlideWidget = penPresentation.active && penWidgetsById.get(penPresentation.blockId)?.visible
        ? penPresentation.blockId
        : undefined;
    const penLivePlaneVisible = !!penViewport && penWidgetsReady && !penOverlayOpen && !penFullChat &&
        (!penPresentation.active || !!penSlideWidget);
    const workflowGraphVisible = workflowCanvasVisible && (!kronosV2 || (penLivePlaneVisible && !penFocusedWidget && !penPresentation.active));
    const renderCamera = useMemo(() => {
        if (!kronosV2 || !penViewport) return state.camera;
        return {
            ...penWorkflowCamera,
            x: penWorkflowCamera.x - penViewport.x,
            y: penWorkflowCamera.y - penViewport.y,
        };
    }, [kronosV2, penViewport, penWorkflowCamera, state.camera]);
    const moveWorkflowCamera = (intent: Parameters<typeof resolveWorkflowCameraIntent>[0]) => {
        if (kronosV2 && penViewport) {
            const current = penCameraRef.current;
            if (intent.fitBounds) {
                const localCamera = { ...current, x: current.x - penViewport.x, y: current.y - penViewport.y };
                const fitted = resolveWorkflowCameraIntent(intent, localCamera, penViewport);
                if (fitted !== localCamera) {
                    setPenRequestedCamera({ ...fitted, x: fitted.x + penViewport.x, y: fitted.y + penViewport.y });
                }
            } else {
                setPenRequestedCamera(resolveWorkflowCameraIntent(intent, current, penViewport));
            }
            return;
        }
        setAndPersist((current) => ({
            ...current,
            camera: resolveWorkflowCameraIntent(intent, current.camera, viewport),
        }));
    };

    useLayoutEffect(() => {
        if (kronosV2) syncPersistentBlockGeometry(viewportRef.current);
    }, [kronosV2, penViewport, penWidgets, penLivePlaneVisible, penFocusedWidget, penSlideWidget, state.objects, state.sceneOrder]);

    useEffect(() => {
        if (!kronosV2 || !penLivePlaneVisible || penDidFit.current) return;
        const visibleWidgets = penWidgets.filter((widget) => widget.visible);
        if (!visibleWidgets.length) return;
        penDidFit.current = true;
        setPenRequestedCamera(fitSpatialViewportToBounds(spatialBoundsForRects(visibleWidgets), penViewport, 48, 1));
    }, [kronosV2, penLivePlaneVisible, penViewport, penWidgets]);

    const canvasRects = useMemo(
        () =>
            Object.fromEntries([
                ...Object.entries(windowLayouts)
                    .filter(([, layout]) => layout.presentation === "freeform" && layout.opacity > 0)
                    .map(([id, layout]) => [id, layout.bounds] as const),
                ...state.objects
                    .filter(({ kind }) => kind !== "connector" && kind !== "workflow-node")
                    .map((object) => [object.id, object] as const),
            ]),
        [state.objects, windowLayouts]
    );
    const multiSelection = kronOSCanvasVisible && marqueeSelection.includes(state.selectedEntityId)
        ? marqueeSelection.filter((id) => canvasRects[id] != null)
        : [];
    const highlightedSelection = marquee
        ? osMarqueeSelection(screenRectToWorld(marquee, state.camera), canvasRects)
        : multiSelection.length > 1
          ? multiSelection
          : [];

    useEffect(() => {
        if (kronOSCanvasVisible && tool === "select") return;
        if (marqueeRef.current) setCanvasPointerCaptured(false);
        marqueeRef.current = undefined;
        setMarquee(undefined);
        setMarqueeSelection([]);
    }, [kronOSCanvasVisible, tool]);

    const [penSystemControlsSlot, setPenSystemControlsSlot] = useState<HTMLElement | null>(null);
    const [penRenderControlsSlot, setPenRenderControlsSlot] = useState<HTMLElement | null>(null);
    const [penIslandControlsSlot, setPenIslandControlsSlot] = useState<HTMLElement | null>(null);
    const [launchingIsland, setLaunchingIsland] = useState(false);
    const [islandFitId, setIslandFitId] = useState<string>();
    const islandId = descriptors.find(({ view }) => view === FloatingIslandView)?.blockId;
    const islandModels = useAtomValue(floatingIslandModels);
    const islandModel = penLivePlaneVisible && penWidgetsById.get(islandId)?.visible &&
        (!penFocusedWidget || penFocusedWidget === islandId) && !penPresentation.active
        ? islandModels.get(islandId)
        : undefined;
    const openFloatingIsland = async () => {
        if (launchingIsland) return;
        setLaunchingIsland(true);
        try {
            const blockId = islandId ?? WOS.splitORef(await RpcApi.CreateBlockCommand(TabRpcClient, {
                tabid: tabId,
                blockdef: { meta: { view: FloatingIslandView, "frame:title": FloatingIslandTitle } },
            }))[1];
            if (stateRef.current.view !== "kronos-v2") return;
            setAndPersist((current) => {
                const existing = islandId && getKronOSV2Widget(current, blockId);
                const camera = penCameraRef.current;
                const width = 960;
                const height = 480;
                const widget = existing || findNonOverlappingCanvasRect(
                    {
                        width,
                        height,
                        x: ((penViewport ? penViewport.x + penViewport.width / 2 : viewport.width / 2) - camera.x)
                            / camera.zoom - width / 2,
                        y: ((penViewport ? penViewport.y + penViewport.height / 2 : viewport.height / 2) - camera.y)
                            / camera.zoom - height / 2,
                    },
                    [
                        ...penWidgets.filter((widget) => widget.visible && widget.blockId !== blockId),
                        ...current.objects,
                    ]
                );
                const kronosV2Widgets = updateKronOSV2Widgets(current.kronosV2Widgets, [
                    { ...widget, blockId, visible: true },
                ]);
                return { ...current, kronosV2Widgets };
            }, true);
            returnToPenCanvas();
            $krontermInspectorOpen.set(true);
            setIslandFitId(blockId);
        } catch (error) {
            setCanvasHint(error instanceof Error ? error.message : "Could not open Floating Island.");
        } finally {
            setLaunchingIsland(false);
        }
    };
    useEffect(() => {
        if (!kronosV2 || !penLivePlaneVisible || !penIslandControlsSlot?.isConnected || !islandFitId) return;
        const widget = penWidgetsById.get(islandFitId);
        if (!widget?.visible) return;
        setPenRequestedCamera(fitSpatialViewportToBounds(widget, penViewport, 28, 1));
        setIslandFitId(undefined);
    }, [islandFitId, kronosV2, penIslandControlsSlot, penLivePlaneVisible, penViewport, penWidgetsById]);
    const attachPenRenderControls = useCallback((slot: HTMLElement | null) => {
        setPenRenderControlsSlot(slot);
        if (slot) setComfyWorkflowOpen(true);
    }, [setComfyWorkflowOpen]);
    const penContext = useMemo(
        () => ({
            workspaceId: tabId,
            workspaceName: currentWorkspace?.name ?? "Workspace",
            spaces: workspaces.map((workspace) => ({
                id: workspace.tabId || workspace.id,
                title: workspace.name,
                previewUrl: getOSSpaceSnapshot(workspace.id),
            })),
        }),
        [tabId, currentWorkspace?.name, workspaces]
    );

    useEffect(() => {
        if (!focusedCanvasWidget) return;
        const escape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (document.documentElement.hasAttribute("data-kronterm-selector-active")) return;
            const target = event.target instanceof Element ? event.target : null;
            const liveHost = target?.closest<HTMLElement>("[data-live-blockid]");
            if (
                target !== document.body &&
                !rootRef.current?.contains(target) &&
                liveHost?.dataset.liveBlockid !== focusedCanvasWidget &&
                liveHost?.style.display !== "none"
            )
                return;
            event.preventDefault();
            event.stopPropagation();
            dispatch({ type: "os.window.restore", blockId: focusedCanvasWidget });
        };
        window.addEventListener("keydown", escape);
        return () => window.removeEventListener("keydown", escape);
    }, [dispatch, focusedCanvasWidget]);

    const beginWindowInteraction = useCallback(
        (
            event: ReactPointerEvent,
            blockId: string,
            layout: Pick<OSWindowLayout, "bounds" | "presentation">,
            kind: "move" | "resize" | "add",
            edge: OSResizeEdge = "se"
        ) => {
            if (
                event.button !== 0 ||
                (kind !== "add" &&
                    !(event.target as HTMLElement).closest("[data-os-window-label]") &&
                    (event.target as HTMLElement).closest(
                        "button, input, textarea, select, a, [contenteditable='true'], [role='button']"
                    ))
            )
                return;
            if (tool === "connector") {
                event.stopPropagation();
                selectCanvasObject(blockId);
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            const current = stateRef.current;
            const onCanvas = current.view === "canvas" && current.scene.kind === "freeform";
            const group = onCanvas && kind === "move" && multiSelection.length > 1 && multiSelection.includes(blockId)
                ? Object.fromEntries(multiSelection.map((id) => [id, canvasRects[id]]))
                : undefined;
            if (!group && (kind === "resize" || (kind === "move" && layout.presentation === "freeform"))) {
                focusBlock(blockId);
            }
            const canSnap = onCanvas && kind !== "add" && !(kind === "resize" && compactDeviceBlocks.has(blockId));
            interactionRef.current = {
                kind,
                freeDrag: !!group || (event.currentTarget as HTMLElement).hasAttribute("data-os-free-drag"),
                edge,
                blockId,
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                bounds: group ? spatialBoundsForRects(Object.values(group)) : layout.bounds,
                group,
                snapTargets: canSnap
                    ? Object.entries(canvasRects)
                          .filter(([id]) => id !== blockId && !group?.[id])
                          .map(([, rect]) => rect)
                    : undefined,
                scale: current.scene.kind === "freeform" ? current.camera.zoom : 1,
            };
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            if (onCanvas) setCanvasPointerCaptured(true);
        },
        [canvasRects, compactDeviceBlocks, focusBlock, multiSelection, tool, selectCanvasObject]
    );

    const handleRootPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const interaction = interactionRef.current;
            if (interaction?.pointerId === event.pointerId) {
                const dx = (event.clientX - interaction.clientX) / interaction.scale;
                const dy = (event.clientY - interaction.clientY) / interaction.scale;
                if (!interaction.latestBounds && Math.hypot(dx, dy) * interaction.scale < 4) return;
                const proposed =
                    interaction.kind !== "resize"
                        ? { ...interaction.bounds, x: interaction.bounds.x + dx, y: interaction.bounds.y + dy }
                        : resizeBoundsFromEdge(interaction.bounds, interaction.edge, dx, dy);
                const { bounds, guides } = interaction.snapTargets && !event.altKey
                    ? snapOSCanvasBounds(
                          proposed,
                          interaction.snapTargets,
                          interaction.scale,
                          { width: OSWindowMinWidth, height: OSWindowMinHeight },
                          interaction.kind === "resize" ? interaction.edge : undefined
                      )
                    : { bounds: proposed, guides: [] };
                interaction.latestBounds = bounds;
                const moved = interaction.group
                    ? translateOSCanvasRects(interaction.group, bounds.x - interaction.bounds.x, bounds.y - interaction.bounds.y)
                    : { [interaction.blockId]: bounds };
                setDragBounds((current) => ({ ...current, ...moved }));
                if (interaction.kind !== "resize" && !interaction.freeDrag) {
                    const rootBounds = viewportRef.current?.getBoundingClientRect();
                    const pointer = {
                        x: event.clientX - (rootBounds?.left ?? 0),
                        y: event.clientY - (rootBounds?.top ?? 0),
                    };
                    const current = stateRef.current;
                    const layouts = Object.fromEntries(
                        descriptors.map((descriptor) => {
                            const layout = computeOSWindowLayout(
                                current,
                                descriptor.blockId,
                                descriptor.view,
                                viewport,
                                compactDeviceBlocks
                            );
                            return [descriptor.blockId, toScreenWindowLayout(current, layout)];
                        })
                    );
                    interaction.takeover =
                        interaction.kind === "move" && !event.shiftKey
                            ? getOSPaneTakeover(
                                  current,
                                  interaction.blockId,
                                  bounds,
                                  getOSAdjacentPanes(layouts, compactDeviceBlocks)
                              )
                            : undefined;
                    setPaneTakeover(interaction.takeover);
                    const hit = interaction.takeover
                        ? undefined
                        : findOSDockHitTarget(interaction.blockId, pointer, layouts);
                    const target = hit && descriptors.find((descriptor) => descriptor.blockId === hit.targetBlockId);
                    interaction.dockTarget =
                        hit && target
                            ? {
                                  blockId: interaction.blockId,
                                  targetBlockId: hit.targetBlockId,
                                  targetTitle: target.title,
                                  targetBounds: hit.bounds,
                                  side: hit.side,
                              }
                            : undefined;
                    setDockPreview(interaction.dockTarget);
                }
                setAlignmentGuides(interaction.takeover || interaction.dockTarget ? [] : guides);
                return;
            }
            const selecting = marqueeRef.current;
            if (selecting?.pointerId === event.pointerId) {
                const rect = viewportRef.current.getBoundingClientRect();
                const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
                const selection = osMarqueeBounds(selecting.start, cursor);
                if (!selecting.last && Math.hypot(selection.width, selection.height) < 4) return;
                selecting.last = selection;
                setMarquee(selection);
                return;
            }
            const pan = panRef.current;
            if (pan?.pointerId === event.pointerId) {
                setState((current) => ({
                    ...current,
                    camera: {
                        ...current.camera,
                        x: pan.x + event.clientX - pan.clientX,
                        y: pan.y + event.clientY - pan.clientY,
                    },
                }));
            }
        },
        [compactDeviceBlocks, descriptors, viewport]
    );

    const handleRootPointerUp = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const interaction = interactionRef.current;
            if (interaction?.pointerId === event.pointerId) {
                const finalBounds = event.type === "pointerup" ? interaction.latestBounds : undefined;
                const dock = interaction.dockTarget;
                if (finalBounds && interaction.takeover) {
                    dispatch(interaction.takeover);
                } else if (finalBounds && dock) {
                    dispatch({
                        type: "spatial.dock",
                        blockId: interaction.blockId,
                        targetBlockId: dock.targetBlockId,
                        side: dock.side,
                    });
                } else if (finalBounds && interaction.group) {
                    const moved = translateOSCanvasRects(
                        interaction.group,
                        finalBounds.x - interaction.bounds.x,
                        finalBounds.y - interaction.bounds.y
                    );
                    setAndPersist((current) => ({
                        ...current,
                        windows: Object.fromEntries(
                            Object.entries(current.windows).map(([id, widget]) => [
                                id,
                                moved[id] ? {
                                    ...widget,
                                    provisional: undefined,
                                    bounds: { ...widget.bounds, x: moved[id].x, y: moved[id].y },
                                } : widget,
                            ])
                        ),
                        objects: current.objects.map((object) =>
                            moved[object.id] ? { ...object, x: moved[object.id].x, y: moved[object.id].y } : object
                        ),
                    }));
                } else if (finalBounds && interaction.kind === "move") {
                    setAndPersist((current) => {
                        const detached = reduceOSModeState(current, {
                            type: "spatial.detach",
                            blockId: interaction.blockId,
                        });
                        const keepSplit = detached !== current && detached.scene.kind === "grouped";
                        const next = keepSplit
                            ? detached
                            : {
                                  ...selectOSSceneEntity(detached, interaction.blockId),
                                  scene: { kind: "freeform" } as const,
                                  zOrder: [
                                      ...detached.zOrder.filter((id) => id !== interaction.blockId),
                                      interaction.blockId,
                                  ],
                              };
                        return reduceOSModeState(next, {
                            type: "spatial.move",
                            blockId: interaction.blockId,
                            x: finalBounds.x,
                            y: finalBounds.y,
                        });
                    });
                } else if (finalBounds && interaction.kind === "resize") {
                    setAndPersist((current) => {
                        const resized = reduceOSModeState(current, {
                            type: "spatial.resize",
                            blockId: interaction.blockId,
                            width: finalBounds.width,
                            height: finalBounds.height,
                        });
                        return reduceOSModeState(resized, {
                            type: "spatial.move",
                            blockId: interaction.blockId,
                            x: finalBounds.x,
                            y: finalBounds.y,
                        });
                    });
                } else if (!finalBounds && event.type === "pointerup") {
                    if (interaction.kind === "add") {
                        const current = stateRef.current;
                        const targetBlockId =
                            current.scene.kind === "grouped"
                                ? current.groups[current.scene.groupId]?.blockIds.at(-1)
                                : undefined;
                        if (targetBlockId) {
                            dispatch({
                                type: "spatial.dock",
                                blockId: interaction.blockId,
                                targetBlockId,
                                side: "right",
                            });
                        }
                    } else if (
                        interaction.kind === "move" &&
                        stateRef.current.selectedEntityId !== interaction.blockId
                    ) {
                        focusBlock(interaction.blockId);
                    }
                }
                interactionRef.current = undefined;
                setCanvasPointerCaptured(false);
                setAlignmentGuides([]);
                setDockPreview(undefined);
                setPaneTakeover(undefined);
                setDragBounds((current) => {
                    const next = { ...current };
                    for (const id of interaction.group ? Object.keys(interaction.group) : [interaction.blockId]) {
                        delete next[id];
                    }
                    return next;
                });
            }
            const selecting = marqueeRef.current;
            if (selecting?.pointerId === event.pointerId) {
                marqueeRef.current = undefined;
                setCanvasPointerCaptured(false);
                setMarquee(undefined);
                if (event.type === "pointerup") {
                    const viewportBounds = viewportRef.current.getBoundingClientRect();
                    const end = { x: event.clientX - viewportBounds.left, y: event.clientY - viewportBounds.top };
                    const bounds = selecting.last && osMarqueeBounds(selecting.start, end);
                    const ids = bounds
                        ? osMarqueeSelection(screenRectToWorld(bounds, stateRef.current.camera), canvasRects)
                        : [];
                    const ranks = getOSSceneZIndices(stateRef.current);
                    const primary = ids.reduce<string>(
                        (front, id) => (front == null || ranks[id] > ranks[front] ? id : front),
                        undefined
                    );
                    setMarqueeSelection(ids);
                    setAndPersist((current) => ({ ...current, selectedEntityId: primary }));
                }
            }
            if (panRef.current?.pointerId === event.pointerId) {
                panRef.current = undefined;
                persist(stateRef.current);
            }
        },
        [canvasRects, dispatch, focusBlock, persist, setAndPersist]
    );

    const handleWheel = useCallback(
        (event: ReactWheelEvent<HTMLDivElement>) => {
            const path = event.nativeEvent.composedPath();
            if (
                event.defaultPrevented ||
                workflowOwnsWheel(path) ||
                path.some(
                    (node) =>
                        node instanceof Element &&
                        node.matches(
                            '[data-os-hermes-settings], [role="dialog"], [role="menu"], .os-files-inspector, .os-agent-sidebar, .os-space-overview'
                        )
                )
            )
                return;
            if (osWidgetOwnsWheel(event.nativeEvent.composedPath(), event.ctrlKey || event.metaKey, tool === "hand"))
                return;
            if (stateRef.current.scene.kind === "overview") {
                event.preventDefault();
                const visible = stateRef.current.zOrder.filter((id) => !stateRef.current.windows[id]?.collapsed);
                if (!visible.length) return;
                const current = visible.indexOf(stateRef.current.scene.selectedBlockId ?? visible[0]);
                const next = visible[(current + (event.deltaY > 0 ? 1 : -1) + visible.length) % visible.length];
                dispatch({ type: "spatial.showOverview", selectedBlockId: next });
                return;
            }
            if (stateRef.current.view !== "canvas" || stateRef.current.scene.kind !== "freeform") return;
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                const rect = viewportRef.current?.getBoundingClientRect();
                const point = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
                setAndPersist((current) => ({
                    ...current,
                    camera: zoomSpatialViewportAtPoint(
                        current.camera,
                        current.camera.zoom * Math.exp(-event.deltaY * 0.002),
                        point
                    ),
                }));
            } else {
                setAndPersist((current) => ({
                    ...current,
                    camera: {
                        ...current.camera,
                        x: current.camera.x - event.deltaX,
                        y: current.camera.y - event.deltaY,
                    },
                }));
            }
        },
        [dispatch, setAndPersist, tool]
    );

    const captureCanvasPan = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const current = stateRef.current;
            const viewportElement = viewportRef.current;
            if (
                !viewportElement ||
                current.view !== "canvas" ||
                current.scene.kind !== "freeform" ||
                (event.button !== 1 && (tool !== "hand" || event.button !== 0))
            )
                return;
            if (workflowOwnsWheel(event.nativeEvent.composedPath())) return;
            event.preventDefault();
            event.stopPropagation();
            panRef.current = {
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                x: current.camera.x,
                y: current.camera.y,
            };
            viewportElement.setPointerCapture(event.pointerId);
        },
        [tool]
    );
    const surfaceInput = useMemo(
        () => ({
            passThrough: canvasPointerCaptured,
            capturePointer: tool === "hand",
            onPointerDownCapture: captureCanvasPan,
            onWheel: handleWheel,
        }),
        [canvasPointerCaptured, captureCanvasPan, handleWheel, tool]
    );

    const navigatePane = useCallback(
        (id: string) => {
            const current = stateRef.current;
            if (current.scene.kind === "freeform") {
                const bounds = current.windows[id]?.bounds;
                if (!bounds) return;
                setMarqueeSelection([]);
                setAndPersist((state) => ({
                    ...selectOSSceneEntity(state, id),
                    camera: keepWorkflowNodeVisible(state.camera, bounds, measuredViewport),
                }));
            } else if (current.scene.kind === "grouped") {
                setAndPersist((state) => selectOSSceneEntity(state, id));
            } else if (current.scene.kind === "overview") {
                dispatch({ type: "spatial.showOverview", selectedBlockId: id });
            } else {
                dispatch({ type: "os.window.focus", blockId: id });
            }
        },
        [dispatch, measuredViewport, setAndPersist]
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || (event.target as HTMLElement)?.closest?.("[data-os-hermes-settings]")) return;
            if (event.key === "Escape" && connectorStartId) {
                setConnectorStartId(undefined);
                setCanvasHint("");
                setTool("select");
                return;
            }
            if (
                ["Backspace", "Delete"].includes(event.key) &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                osCanvasOwnsDelete(event.composedPath(), rootRef.current, event.defaultPrevented)
            ) {
                const current = stateRef.current;
                const v2 = current.view === "kronos-v2";
                const freeform = current.view === "canvas" && current.scene.kind === "freeform";
                if ((v2 || freeform) && current.selectedEntityId) {
                    const boxSelected = freeform && marqueeSelection.includes(current.selectedEntityId);
                    const ids = boxSelected ? marqueeSelection : [current.selectedEntityId];
                    const objects = ids.filter((id) =>
                        current.objects.some((object) =>
                            object.id === id &&
                            (v2 ? ["folder", "file", "generated-artifact"].includes(object.kind) : object.kind !== "workflow-node")
                        )
                    );
                    const widgets = boxSelected ? ids.filter((id) => current.windows[id] != null) : [];
                    if (objects.length || widgets.length) {
                        event.preventDefault();
                        setMarqueeSelection([]);
                        for (const id of objects) deleteObject(id);
                        if (widgets.length) {
                            void Promise.allSettled(widgets.map((id) => handleClose(id))).then((results) => {
                                if (results.some((result) => result.status === "rejected")) {
                                    setCanvasHint("Could not close all selected widgets.");
                                }
                            });
                        }
                        return;
                    }
                }
            }
            if (workflowOwnsWheel(event.composedPath())) return;
            if (
                event
                    .composedPath()
                    .some((target) => target instanceof HTMLElement && target.hasAttribute("data-workflow-native-host"))
            )
                return;
            const target = event.target as HTMLElement;
            if (target.closest("input, textarea, select, [contenteditable='true'], [role='application']")) return;
            const current = stateRef.current;
            if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "<" || event.key === ">")) {
                const next = getOSPaneNeighbor(current, event.key === ">" ? 1 : -1);
                if (next) {
                    event.preventDefault();
                    navigatePane(next);
                }
                return;
            }
            if (current.scene.kind === "focused" && event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
                const next = getOSCarouselNeighbor(current, event.key === "ArrowRight" ? 1 : -1);
                if (next) {
                    event.preventDefault();
                    dispatch({ type: "os.window.focus", blockId: next });
                }
                return;
            }
            if (event.key === "Escape") {
                if (current.scene.kind === "overview") dispatch({ type: "spatial.restoreScene" });
                else if (current.scene.kind === "grouped")
                    dispatch({
                        type: "os.window.focus",
                        blockId: current.groups[current.scene.groupId]?.primaryBlockId,
                    });
                return;
            }
            if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "o") {
                event.preventDefault();
                dispatch({ type: "spatial.showOverview" });
                return;
            }
            if (current.scene.kind !== "overview") return;
            if (target.closest("button, a, [role='button']")) return;
            const visible = current.zOrder;
            if (!visible.length) return;
            const selected = current.scene.selectedBlockId ?? visible[0];
            if (event.key === "Enter") {
                event.preventDefault();
                dispatch({ type: "spatial.focus", blockId: selected });
            } else if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                event.preventDefault();
                const index = visible.indexOf(selected);
                const delta = event.key === "ArrowRight" ? 1 : -1;
                dispatch({
                    type: "spatial.showOverview",
                    selectedBlockId: visible[(index + delta + visible.length) % visible.length],
                });
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [dispatch, connectorStartId, deleteObject, handleClose, marqueeSelection, navigatePane]);

    useEffect(
        () =>
            registerWorkspaceSurfaceModeProvider(tabId, {
                snapshot: () => ({
                    presentation: "os",
                    osview: stateRef.current.view,
                    penchatmode: stateRef.current.view === "kronos-v2" ? (penFullChat ? "tabs" : "canvas") : undefined,
                    selectedblockid: stateRef.current.view === "kronos-v2"
                        ? penFullChat ? penChatDockActive ?? penChatDockFocus?.id : penActiveWidgetRef.current ?? penInputWidgetRef.current
                        : stateRef.current.windows[stateRef.current.selectedEntityId ?? ""]
                          ? stateRef.current.selectedEntityId
                          : undefined,
                    selectedobjectid: stateRef.current.objects.some(
                        (object) => object.id === stateRef.current.selectedEntityId
                    )
                        ? stateRef.current.selectedEntityId
                        : undefined,
                    camera: stateRef.current.view === "kronos-v2" ? penCameraRef.current : getOSSurfaceCamera(stateRef.current),
                    rects: Object.fromEntries(
                        descriptors.map((block) => [
                            block.blockId,
                            stateRef.current.view === "kronos-v2"
                                ? getKronOSV2Widget(stateRef.current, block.blockId)
                                : computeOSWindowLayout(
                                      stateRef.current,
                                      block.blockId,
                                      block.view,
                                      viewport,
                                      compactDeviceBlocks
                                  ).bounds,
                        ])
                    ),
                    objects: stateRef.current.objects,
                    scene: stateRef.current.scene,
                    groups: stateRef.current.groups,
                    tabgroups: stateRef.current.tabGroups,
                    presentations: Object.fromEntries(
                        descriptors.map((block) => [
                            block.blockId,
                            stateRef.current.view === "kronos-v2"
                                ? penActiveWidgetRef.current === block.blockId
                                    ? "focused"
                                    : !penActiveWidgetRef.current && getKronOSV2Widget(stateRef.current, block.blockId)?.visible
                                      ? "freeform"
                                      : "collapsed"
                                : computeOSWindowLayout(
                                      stateRef.current,
                                      block.blockId,
                                      block.view,
                                      viewport,
                                      compactDeviceBlocks
                                  ).presentation,
                        ])
                    ),
                }),
                control: async (rawInput) => {
                    const input = resolveOSControlAction(rawInput);
                    const inKronOSV2 = stateRef.current.view === "kronos-v2";
                    if (inKronOSV2 && penFullChat && ["focus", "spatial.focus", "os.widget.input"].includes(input.action) &&
                        chatDockTabs.some(({ id }) => id === input.blockid)) {
                        const background = input.presentation !== "foreground";
                        setPenChatDockFocus({ id: input.blockid, background });
                        return { success: true, message: background ? "Selected chat tab in the background." : "Focused right-side chat tab." };
                    }
                    if (inKronOSV2 && penFullChat &&
                        ["focus", "spatial.focus", "os.widget.input"].includes(input.action) &&
                        allBlockIds.includes(input.blockid)) {
                        const ref = WOS.makeORef("block", input.blockid);
                        const block = globalStore.get(WOS.getWaveObjectAtom<Block>(ref));
                        const app = block?.meta?.view === "web" ? "browser" :
                            block?.meta?.view === "term" ? "terminal" :
                            block?.meta?.view === "preview" ? "files" : undefined;
                        if (app) {
                            await RpcApi.SetMetaCommand(TabRpcClient, {
                                oref: ref, meta: { [PenChatDockMeta]: app } as MetaType,
                            });
                            const background = input.presentation !== "foreground";
                            setPenChatDockFocus({ id: input.blockid, background });
                            return { success: true, message: background ? "Prepared the widget in the chat dock." : "Opened the widget in the chat side panel." };
                        }
                    }
                    if (inKronOSV2 && penFullChat && input.action === "spatial.open" && input.view === "web" && input.text) {
                        let url: URL;
                        try {
                            url = new URL(input.text);
                        } catch {
                            return { success: false, message: "A browser URL is required." };
                        }
                        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
                            return { success: false, message: "An HTTP or HTTPS browser URL is required." };
                        }
                        const existing = chatDockTabs.find(({ id, app }) =>
                            app === "browser" &&
                            globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", id)))?.meta?.url === url.href
                        );
                        const id = existing?.id ?? WOS.splitORef(await RpcApi.CreateBlockCommand(TabRpcClient, {
                            tabid: tabId,
                            blockdef: { meta: { view: "web", url: url.href, [PenChatDockMeta]: "browser" } as MetaType },
                        }))[1];
                        setPenChatDockFocus({ id, background: input.presentation !== "foreground" });
                        return { success: true, message: `block:${id}` };
                    }
                    if (inKronOSV2 && penFullChat && input.action === "spatial.openFile") {
                        if (!input.file?.startsWith("/")) return { success: false, message: "An absolute file path is required." };
                        const existing = chatDockTabs.find(({ id, app }) =>
                            app === "files" &&
                            globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", id)))?.meta?.file === input.file
                        );
                        const id = existing?.id ?? WOS.splitORef(await RpcApi.CreateBlockCommand(TabRpcClient, {
                            tabid: tabId,
                            blockdef: { meta: { view: "preview", file: input.file, [PenChatDockMeta]: "files" } as MetaType },
                        }))[1];
                        if (existing) {
                            const model = getBlockComponentModel(id)?.viewModel as import("@/app/view/preview/preview-model").PreviewModel;
                            if (model?.refreshVersion) globalStore.set(model.refreshVersion, (version) => version + 1);
                        }
                        const background = input.presentation !== "foreground";
                        setPenChatDockFocus({ id, background });
                        return { success: true, message: background ? `Prepared a preview of ${input.file} in the background (block:${id}).` : `Showing ${input.file} in the right panel (block:${id}).` };
                    }
                    const validationError = validateOSSurfaceControl(stateRef.current, rawInput);
                    if (validationError) return { success: false, message: validationError };
                    if (inKronOSV2 && input.action === "os.widget.input") {
                        if (penFullChat) return { success: false, message: "Return to Canvas to interact with this widget." };
                        const widget = getKronOSV2Widget(stateRef.current, input.blockid);
                        if (!widget) return { success: false, message: "OS window not found." };
                        setPenWidgetVisible(input.blockid, true);
                        setPenInputWidget(input.blockid);
                        const camera = penCameraRef.current;
                        const x = widget.x * camera.zoom + camera.x;
                        const y = widget.y * camera.zoom + camera.y;
                        const outsideViewport = penViewport && (
                            x >= penViewport.x + penViewport.width ||
                            y >= penViewport.y + penViewport.height ||
                            x + widget.width * camera.zoom <= penViewport.x ||
                            y + widget.height * camera.zoom <= penViewport.y
                        );
                        if (penActiveWidgetRef.current || outsideViewport) setPenActiveWidget(input.blockid);
                        return { success: true, message: "Widget ready for input on the Pen canvas." };
                    }
                    if (inKronOSV2 && (input.action.startsWith("os.tabs.") || input.action === "spatial.detach"))
                        return { success: false, message: "KronOS v2 widgets are individual Pen frames. Use Pen’s layer and layout tools to organize them." };
                    if (input.action === "os.design.editor") {
                        try {
                            const { method, params = {} } = JSON.parse(input.text ?? "{}");
                            if (!inKronOSV2) dispatch({ type: "os.view.set", view: "design" });
                            else if (["execute", "undo", "redo", "fit", "focus_canvas"].includes(method)) leavePenWidget();
                            const result = await requestPenEditor(tabId, method as PenEditorMethod, params);
                            return { success: true, message: JSON.stringify(result) ?? "null" };
                        } catch (error) {
                            return {
                                success: false,
                                message: error instanceof Error ? error.message : "Design operation failed.",
                            };
                        }
                    }
                    if (input.action === "os.design.create" || input.action === "os.design.update") {
                        const creating = input.action === "os.design.create";
                        try {
                            const { type, patch, fill, geometry } = readPenLayerPatch(input.text ?? "", creating);
                            if (inKronOSV2) {
                                const { text, ...boundsAndName } = patch;
                                const properties = JSON.stringify({
                                    ...boundsAndName,
                                    content: text,
                                    geometry,
                                });
                                const color = JSON.stringify(fill ?? null);
                                const operation = creating
                                    ? `const type = ${JSON.stringify(type)};
                                       const props = ${properties};
                                       const origin = FindEmptySpace({width: props.width ?? 240, height: props.height ?? 160});
                                       const color = ${color};
                                       const paint = color == null ? {} : type === "note" ? {color} : {fill: color};
                                       const path = type === "path" ? {geometry: "M0 24 L12 0 L24 24"} : {};
                                       Print(Insert(document, {type, x: origin.x, y: origin.y, ...path, ...props, ...paint}));`
                                    : `const id = ${JSON.stringify(input.objectid ?? "")};
                                       const node = Get(id, {depth: 0});
                                       if (!node) throw new Error("Pen layer not found.");
                                       if (node.metadata?.type === "kronos-live-widget") throw new Error("Use widget tools to edit a live widget frame.");
                                       const props = ${properties};
                                       if (props.geometry != null && node.type !== "path") throw new Error("Only path layers accept SVG path data.");
                                       const color = ${color};
                                       const paint = color == null ? {} : node.type === "note" ? {color} : {fill: color};
                                       Update(id, {...props, ...paint});
                                       Print(id);`;
                                leavePenWidget();
                                const result = await requestPenEditor(tabId, "execute", { code: operation }) as { isError?: boolean };
                                return { success: result?.isError !== true, message: JSON.stringify(result) ?? "null" };
                            }
                            if (creating) {
                                const id = createPenLayer(type, patch, fill, geometry);
                                return { success: true, message: `Created design layer ${id}.` };
                            }
                            const layer = stateRef.current.objects.find(
                                (object) => object.id === input.objectid && object.pen
                            );
                            if (!layer)
                                return { success: false, message: "Design layer not found in this OS workspace." };
                            if (geometry != null && layer.pen.type !== "path")
                                return { success: false, message: "Only path layers accept SVG path data." };
                            return updateObject(layer.id, {
                                ...patch,
                                pen: {
                                    ...layer.pen,
                                    fill: fill ?? layer.pen.fill,
                                    geometry: geometry ?? layer.pen.geometry,
                                },
                            });
                        } catch (error) {
                            return {
                                success: false,
                                message: error instanceof Error ? error.message : "Invalid design properties.",
                            };
                        }
                    }
                    if (input.action === "add_file") {
                        if (!input.file || !isLocalCanvasFilePath(input.file)) {
                            return { success: false, message: "An absolute local file path is required." };
                        }
                        if (
                            [input.x, input.y].some((coordinate) => coordinate != null && !Number.isFinite(coordinate))
                        ) {
                            return { success: false, message: "File card coordinates must be finite." };
                        }
                        const id = pinResource(
                            { ...canvasFileResource(input.file, input.text), render: input.render },
                            { x: input.x, y: input.y }
                        );
                        return { success: true, message: `Pinned canvas file ${id}.` };
                    }
                    if (input.action === "os.tabs.group") {
                        dispatch({ type: "os.tabs.group", blockId: input.blockid, targetBlockId: input.targetblockid });
                        return { success: true, message: "Grouped existing widgets as tabs." };
                    }
                    if (input.action === "os.tabs.detach" || input.action === "os.tabs.reorder") {
                        dispatch(
                            input.action === "os.tabs.detach"
                                ? { type: "os.tabs.detach", blockId: input.blockid }
                                : { type: "os.tabs.reorder", blockId: input.blockid, index: input.index }
                        );
                        return { success: true, message: "Updated widget tabs." };
                    }
                    if (input.action === "os.window.maximize") {
                        if (!input.blockid || !stateRef.current.windows[input.blockid])
                            return { success: false, message: "OS window not found." };
                        dispatch({ type: "os.view.set", view: "canvas" });
                        dispatch({ type: "os.window.maximize", blockId: input.blockid });
                        return { success: true, message: "Maximized OS window." };
                    }
                    if (input.action === "os.window.place") {
                        if (!input.blockid || !stateRef.current.windows[input.blockid])
                            return { success: false, message: "OS window not found." };
                        if (!isOSWindowPlacement(input.position))
                            return {
                                success: false,
                                message: "Position must be left, right, top, bottom, fill, or center.",
                            };
                        placeWindow(input.blockid, input.position);
                        return { success: true, message: `Placed window ${input.position}.` };
                    }
                    if (input.action === "os.window.arrange" || input.action === "arrange") {
                        const arrangement = input.position ?? "tile";
                        if (!isOSWindowArrangement(arrangement))
                            return { success: false, message: "Position must be tile or cascade." };
                        const count = arrangeWindows(arrangement);
                        return count > 0
                            ? { success: true, message: `Arranged ${count} windows (${arrangement}).` }
                            : { success: false, message: "No open windows to arrange." };
                    }
                    if (input.action === "os.window.close") {
                        if (!input.blockid || !stateRef.current.windows[input.blockid])
                            return { success: false, message: "OS window not found." };
                        await handleClose(input.blockid);
                        return { success: true, message: "Closed OS window." };
                    }
                    if (input.action === "spatial.open") {
                        if (!input.view) return { success: false, message: "View is required." };
                        await handleCreateBlock(input.view);
                        return { success: true, message: `Opening ${input.view}.` };
                    }
                    if (input.action === "spatial.switchWorkspace") {
                        if (!input.workspaceid) return { success: false, message: "Workspace is required." };
                        await getApi().switchWorkspace(input.workspaceid);
                        return { success: true, message: "Switching workspace." };
                    }
                    if (input.action === "spatial.openApp") {
                        if (!input.appid) return { success: false, message: "App id is required." };
                        await handleCreateAppStream(input.appid, input.appname ?? input.appid);
                        return { success: true, message: `Opening ${input.appname ?? input.appid}.` };
                    }
                    if (input.action === "os.view.set" || input.action === "spatial.setWidgetPresentation") {
                        return input.presentation === "kronos-v2"
                            ? { success: true, message: "KronOS v2 is active." }
                            : { success: false, message: "KronOS v2 is the only workspace view." };
                    }
                    if (input.action === "spatial.openFile") {
                        if (!input.file) return { success: false, message: "File path is required." };
                        if (input.view === "preview") {
                            if (!isLocalCanvasFilePath(input.file))
                                return { success: false, message: "An absolute local image path is required." };
                            const ref = await RpcApi.CreateBlockCommand(TabRpcClient, {
                                tabid: tabId,
                                blockdef: { meta: { view: "preview", file: input.file } },
                            });
                            const [, blockId] = WOS.splitORef(ref);
                            if (stateRef.current.view === "kronos-v2") setPenActiveWidget(blockId);
                            else dispatch({ type: "os.window.focus", blockId });
                            return { success: true, message: `Opened image widget ${blockId}.` };
                        }
                        openKrontermFile(input.file);
                        return { success: true, message: `Opening ${input.file}.` };
                    }
                    if (input.action === "spatial.openCommandCenter") {
                        toggleCommandCenter();
                        return { success: true, message: "Opened command center." };
                    }
                    if (input.action === "focus" || input.action === "spatial.focus") {
                        if (!input.blockid || !stateRef.current.windows[input.blockid])
                            return { success: false, message: "OS window not found." };
                        if (inKronOSV2) {
                            if (penFullChat)
                                return { success: false, message: "This widget is on Canvas. Return to Canvas to focus it." };
                            setPenWidgetVisible(input.blockid, true);
                            setPenActiveWidget(input.blockid);
                            return { success: true, message: "Focused widget on the Pen canvas." };
                        }
                        dispatch({ type: "os.view.set", view: "canvas" });
                        dispatch({
                            type: input.action === "spatial.focus" ? "spatial.focus" : "os.window.focus",
                            blockId: input.blockid,
                        });
                        return { success: true, message: "Focused OS window." };
                    }
                    if (input.action === "move" || input.action === "spatial.move") {
                        if (!input.blockid || input.x == null || input.y == null)
                            return { success: false, message: "Block and coordinates are required." };
                        dispatch({ type: "spatial.move", blockId: input.blockid, x: input.x, y: input.y });
                        return { success: true, message: "Moved OS window." };
                    }
                    if (input.action === "resize" || input.action === "spatial.resize") {
                        if (!input.blockid || input.width == null || input.height == null)
                            return { success: false, message: "Block and size are required." };
                        dispatch({
                            type: "spatial.resize",
                            blockId: input.blockid,
                            width: input.width,
                            height: input.height,
                        });
                        return { success: true, message: "Resized OS window." };
                    }
                    if (input.action === "spatial.dock") {
                        if (!input.blockid || !input.targetblockid)
                            return { success: false, message: "Source and target blocks are required." };
                        dispatch({
                            type: "spatial.dock",
                            blockId: input.blockid,
                            targetBlockId: input.targetblockid,
                            side: input.side === "right" ? "right" : "left",
                        });
                        return { success: true, message: "Docked OS window." };
                    }
                    if (input.action === "spatial.detach") {
                        if (!input.blockid) return { success: false, message: "Block is required." };
                        dispatch({ type: "spatial.detach", blockId: input.blockid });
                        return { success: true, message: "Detached OS window." };
                    }
                    if (input.action === "spatial.collapse" || input.action === "spatial.restore") {
                        if (!input.blockid) return { success: false, message: "Block is required." };
                        dispatch({ type: input.action, blockId: input.blockid });
                        return {
                            success: true,
                            message:
                                input.action === "spatial.collapse" ? "Collapsed OS window." : "Restored OS window.",
                        };
                    }
                    if (input.action === "spatial.showOverview") {
                        dispatch({ type: "spatial.showOverview", selectedBlockId: input.blockid });
                        return { success: true, message: "Showing all OS windows." };
                    }
                    if (input.action === "fit") {
                        if (stateRef.current.view === "kronos-v2") {
                            leavePenWidget();
                            await requestPenEditor(tabId, "fit");
                        } else fitAll();
                        return { success: true, message: "OS content fitted." };
                    }
                    if (input.action === "add_note") {
                        if (inKronOSV2) {
                            const note = JSON.stringify({
                                type: "note",
                                content: input.text ?? "New note",
                                x: input.x,
                                y: input.y,
                                width: input.width ?? 240,
                                height: input.height ?? 180,
                            });
                            leavePenWidget();
                            const result = await requestPenEditor(tabId, "execute", {
                                code: `const note = ${note};
                                       const {x, y} = FindEmptySpace({width: note.width, height: note.height});
                                       Print(Insert(document, {x, y, ...note}));`,
                            }) as { isError?: boolean };
                            return { success: result?.isError !== true, message: JSON.stringify(result) ?? "null" };
                        }
                        addObject("note", input.text, input);
                        return { success: true, message: "Created OS note." };
                    }
                    if (input.action === "navigate") {
                        const state = stateRef.current;
                        const navigationState = inKronOSV2 ? {
                            ...state,
                            selectedEntityId: penActiveWidgetRef.current ?? penInputWidgetRef.current ?? input.blockid,
                            windows: Object.fromEntries(Object.entries(state.windows).map(([id, window]) => {
                                const widget = getKronOSV2Widget(state, id);
                                return [id, { ...window, bounds: widget, collapsed: !widget.visible }];
                            })),
                        } : state;
                        const target = getOSNavigationTarget(navigationState, input.direction);
                        if (!target) return { success: false, message: "No window in that direction." };
                        dispatch({ type: "spatial.focus", blockId: target });
                        return { success: true, message: "Focused adjacent OS window." };
                    }
                    if (input.action === "connect_objects") {
                        const bothWorkflowNodes = [input.fromobjectid, input.toobjectid].every((id) =>
                            stateRef.current.objects.some(
                                (object) => object.id === id && object.kind === "workflow-node"
                            )
                        );
                        if (bothWorkflowNodes)
                            return {
                                success: false,
                                message:
                                    "Connect workflow nodes through their input and output ports to create an executable connection.",
                            };
                        const connector: OSCanvasObject = {
                            id: `connector-${crypto.randomUUID()}`,
                            kind: "connector",
                            x: 0,
                            y: 0,
                            width: 1,
                            height: 1,
                            fromObjectId: input.fromobjectid,
                            toObjectId: input.toobjectid,
                        };
                        setAndPersist((current) => ({
                            ...current,
                            objects: [...current.objects, connector],
                            selectedEntityId: connector.id,
                        }));
                        return {
                            success: true,
                            message: "Added an OS annotation connector. Workflow execution uses node ports.",
                        };
                    }
                    if (input.action === "delete_object" && input.objectid) {
                        return deleteObject(input.objectid) ?? { success: true, message: "Deleted OS object." };
                    }
                    if (input.action === "update_object" && input.objectid) {
                        return updateObject(input.objectid, {
                            x: input.x,
                            y: input.y,
                            width: input.width,
                            height: input.height,
                            text: input.text,
                            color: input.color as OSCanvasColor,
                        });
                    }
                    return { success: false, message: `Unsupported OS action: ${input.action}` };
                },
            }),
        [
            addObject,
            arrangeWindows,
            compactDeviceBlocks,
            createPenLayer,
            deleteObject,
            descriptors,
            dispatch,
            fitAll,
            handleClose,
            leavePenWidget,
            penViewport,
            penFullChat,
            penChatDockActive,
            penChatDockFocus,
            allBlockIds,
            chatDockTabs,
            pinResource,
            placeWindow,
            setPenWidgetVisible,
            handleCreateAppStream,
            handleCreateBlock,
            tabId,
            updateObject,
            viewport,
        ]
    );

    const activeGroup = state.scene.kind === "grouped" ? state.groups[state.scene.groupId] : undefined;
    const agentPresences = useAgentPresences();
    const desktopInstalledApps = useMemo(
        () =>
            installedAppDescriptors
                .filter((descriptor) => descriptor.installedAppId)
                .map((descriptor) => ({ id: descriptor.installedAppId, name: descriptor.name, icon: descriptor.icon })),
        [installedAppDescriptors]
    );
    const agentPresenceByBlock = useMemo(
        () =>
            assignAgentPresencesToWindows(
                agentPresences,
                descriptors.map((descriptor) => ({ blockId: descriptor.blockId, view: descriptor.view }))
            ),
        [agentPresences, descriptors]
    );
    const desktopActiveBlockId = state.scene.kind === "focused" ? state.scene.blockId : state.selectedEntityId;
    const desktopWindows = useMemo(
        () =>
            descriptors.map((descriptor) => {
                const presence = agentPresenceByBlock.get(descriptor.blockId);
                return {
                    blockId: descriptor.blockId,
                    title: descriptor.title,
                    subtitle: descriptor.subtitle,
                    icon: descriptor.icon,
                    active: desktopActiveBlockId === descriptor.blockId,
                    minimized: !!state.windows[descriptor.blockId]?.collapsed,
                    agentLabel: presence ? describeAgentPresence(presence) : undefined,
                };
            }),
        [agentPresenceByBlock, descriptors, desktopActiveBlockId, state.windows]
    );
    const worldTransform =
        state.scene.kind === "freeform"
            ? `translate3d(${state.camera.x}px, ${state.camera.y}px, 0) scale(${state.camera.zoom})`
            : "translate3d(0, 0, 0) scale(1)";
    const connectorObjects = state.objects.filter((object) => object.kind === "connector");
    const activeBlockId = state.scene.kind === "focused" ? state.scene.blockId : state.selectedEntityId;
    const carouselOrder = getOSCarouselOrder(state);
    const activeTabGroup = getOSTabGroup(state, activeBlockId);
    const activeTabBounds = activeBlockId ? windowLayouts[activeBlockId]?.bounds : undefined;
    const showCarouselControls =
        state.view === "canvas" &&
        state.scene.kind === "focused" &&
        !state.windows[state.scene.blockId]?.maximized &&
        carouselOrder.length > 1;
    const adjacentPanes =
        state.view === "canvas" && (activeGroup || showCarouselControls) && !Object.keys(dragBounds).length
            ? getOSAdjacentPanes(windowLayouts, compactDeviceBlocks)
            : [];

    return (
        <SystemUIProvider enabled={systemLayerEnabled}>
            <div
                ref={rootRef}
                className={cn(
                    "os-mode-root",
                    `scene-${state.scene.kind}`,
                    `view-${state.view}`,
                    sidebarOpen && !penCanvasVisible && "has-agent-sidebar",
                    !penCanvasVisible && inspectorOpen && "has-files-inspector",
                    penCanvasVisible && "has-pen-canvas",
                    inspectorExpanded && "has-expanded-inspector",
                    inspectorCompact && "has-compact-inspector",
                    comfyPanels.logs && "has-comfy-logs",
                    reducedMotion && "reduced-motion"
                )}
                style={
                    {
                        "--os-sidebar-width": `min(${sessionSidebarWidth}px, 65%)`,
                        "--os-inspector-dragged-width": inspectorWidth ? `${inspectorWidth}px` : undefined,
                        "--os-workflow-top": `${workflowPanelLayout.top}px`,
                        "--os-workflow-right": `${workflowPanelLayout.right}px`,
                        "--os-workflow-bottom": `${workflowPanelLayout.bottom}px`,
                        "--os-workflow-controls-gutter": "0px",
                    } as CSSProperties
                }
                tabIndex={-1}
                onPointerMove={handleRootPointerMove}
                onPointerUp={handleRootPointerUp}
                onPointerCancel={handleRootPointerUp}
                onLostPointerCapture={(event) => {
                    if (interactionRef.current?.pointerId === event.pointerId) handleRootPointerUp(event);
                }}
                onWheel={handleWheel}
            >
                {kronosV2 && <KronOSV2AgentPointer onFollow={followPenAgentPointer} />}
                {!penCanvasVisible && <WorkspaceWallpaper />}
                <aside
                    id="kronterm-left-sidebar"
                    data-live-block-occluder=""
                    className="os-agent-sidebar"
                    aria-label="Workspace sidebar"
                    hidden={penCanvasVisible || !sidebarOpen}
                >
                    <div ref={attachSidebar} className="h-full min-h-0" />
                    {sidebarMode === "sessions" && !penCanvasVisible && sidebarOpen && (
                        <div
                            className="os-session-sidebar-resize"
                            role="separator"
                            aria-label="Resize Sessions panel"
                            aria-orientation="vertical"
                            aria-valuemin={200}
                            aria-valuemax={680}
                            aria-valuenow={sessionSidebarWidth}
                            tabIndex={0}
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.stopPropagation();
                                const panel = event.currentTarget.parentElement;
                                const width = panel.getBoundingClientRect().width + (state.view === "canvas" ? 8 : 0);
                                sessionSidebarDrag.current = { x: event.clientX, width };
                                event.currentTarget.setPointerCapture(event.pointerId);
                            }}
                            onPointerMove={(event) => {
                                const drag = sessionSidebarDrag.current;
                                if (drag && event.currentTarget.hasPointerCapture(event.pointerId)) {
                                    resizeSessionSidebar(drag.width + event.clientX - drag.x);
                                }
                            }}
                            onLostPointerCapture={() => { sessionSidebarDrag.current = null; }}
                            onKeyDown={(event) => {
                                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                event.preventDefault();
                                event.stopPropagation();
                                resizeSessionSidebar(sessionSidebarWidth + (event.key === "ArrowRight" ? 16 : -16));
                            }}
                        />
                    )}
                </aside>
                <aside
                    id="kronterm-right-inspector"
                    data-live-block-occluder=""
                    className="os-files-inspector"
                    aria-label="Workspace inspector"
                    hidden={penCanvasVisible || !inspectorOpen}
                >
                    <div ref={attachInspector} className="h-full min-h-0" />
                </aside>
                {penDesignTarget &&
                    createPortal(
                        <div className="flex h-full min-h-0 flex-col">
                            {penCanvasVisible && <OSPenCanvasActions tabId={tabId} />}
                            {state.objects.some((object) => object.pen) && (
                                <OSPenPanel
                                    objects={state.objects}
                                    selectedId={state.selectedEntityId}
                                    status=""
                                    onChange={updateObject}
                                    onDelete={deleteObject}
                                    onDuplicate={(id) => {
                                        setAndPersist((current) => {
                                            const layer = current.objects.find((object) => object.id === id);
                                            if (!layer?.pen) return current;
                                            const copy = {
                                                ...layer,
                                                id: crypto.randomUUID(),
                                                name: `${layer.name} copy`,
                                                x: layer.x + 24,
                                                y: layer.y + 24,
                                                pen: { ...layer.pen },
                                            };
                                            return {
                                                ...current,
                                                objects: [...current.objects, copy],
                                                selectedEntityId: copy.id,
                                            };
                                        });
                                    }}
                                    onFit={(id) => {
                                        const layer = stateRef.current.objects.find((object) => object.id === id);
                                        if (layer)
                                            setAndPersist((current) => ({
                                                ...current,
                                                camera: fitSpatialViewportToBounds(layer, viewport, 80, 1),
                                            }));
                                    }}
                                    onSelect={(id) => {
                                        setTool("select");
                                        setAndPersist((current) => {
                                            const next = selectOSSceneEntity(current, id);
                                            const layer = next.objects.find((object) => object.id === id);
                                            return layer
                                                ? {
                                                      ...next,
                                                      camera: keepWorkflowNodeVisible(next.camera, layer, viewport),
                                                  }
                                                : next;
                                        });
                                    }}
                                />
                            )}
                        </div>,
                        penDesignTarget
                    )}
                {comfyLibrarySlot &&
                    createPortal(
                        <div className="flex h-full min-h-0 flex-col">
                            {hasComfyPanels ? (
                                <select
                                    className="mx-2 my-1 cursor-pointer rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                                    aria-label="KronRender library"
                                    value={comfyLibrary}
                                    onChange={(event) => setComfyLibrary(event.currentTarget.value as ComfyLibrary)}
                                >
                                    {Object.entries(ComfyLibraries).map(([id, label]) => (
                                        <option key={id} value={id}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <SystemButton
                                    className="m-2 self-start"
                                    size="small"
                                    onClick={() => {
                                        setComfyWorkflowOpen(true);
                                        $comfyControlsOpen.set(true);
                                    }}
                                >
                                    Open KronRender controls
                                </SystemButton>
                            )}
                            <div className="flex gap-1 px-2 pb-1">
                                <SystemButton
                                    size="small"
                                    onClick={() => {
                                        setAndPersist(activateOSWorkflowCanvas);
                                        $workflowPickerSource.set("comfy-nodes");
                                    }}
                                >
                                    Nodes
                                </SystemButton>
                                <SystemButton
                                    size="small"
                                    onClick={() => {
                                        setAndPersist(activateOSWorkflowCanvas);
                                        $workflowPickerSource.set("comfy-models");
                                    }}
                                >
                                    Model Library
                                </SystemButton>
                            </div>
                            <div ref={setComfyLibraryTarget} className="min-h-0 flex-1 overflow-hidden" />
                        </div>,
                        comfyLibrarySlot
                    )}
                <section
                    className="os-workflow-executions-dock os-comfy-logs"
                    data-workflow-panel=""
                    data-live-block-occluder=""
                    aria-label="KronRender logs"
                    hidden={!comfyPanels.logs}
                >
                    <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1 text-sm">
                        <span>KronRender Logs</span>
                        <SystemButton size="small" onClick={() => setShowComfyLogs(false)}>
                            Close logs
                        </SystemButton>
                    </header>
                    <div ref={setComfyLogsTarget} className="min-h-0 flex-1 overflow-hidden" />
                </section>
                {workspaceSetupOpen && (
                    <OSWorkspaceSetup
                        editing={editingWorkspaceSetup}
                        initialName={editingWorkspaceSetup ? currentWorkspace?.name : undefined}
                        initialIdentity={editingWorkspaceSetup ? currentWorkspace?.meta?.["os:identity"] : undefined}
                        initialChannel={editingWorkspaceSetup ? currentWorkspace?.meta?.["os:channelsetup"] : undefined}
                        onClose={() => {
                            pendingWorkspaceId.current = undefined;
                            setWorkspaceSetupOpen(false);
                            setEditingWorkspaceSetup(false);
                        }}
                        onCreate={async (name, identity, channel) => {
                            if (editingWorkspaceSetup) {
                                await WorkspaceService.UpdateWorkspace(
                                    currentWorkspace.oid,
                                    name,
                                    currentWorkspace.icon,
                                    currentWorkspace.color,
                                    false
                                );
                                await RpcApi.SetMetaCommand(TabRpcClient, {
                                    oref: WOS.makeORef("workspace", currentWorkspace.oid),
                                    meta: { "os:channelsetup": channel } as MetaType,
                                });
                                setWorkspaceSetupOpen(false);
                                setEditingWorkspaceSetup(false);
                                return;
                            }
                            const workspaceId =
                                pendingWorkspaceId.current ??
                                (await WorkspaceService.CreateWorkspace(name, "", identity.color, true));
                            pendingWorkspaceId.current = workspaceId;
                            if (!workspaceId) throw new Error("Workspace creation failed");
                            await RpcApi.SetMetaCommand(TabRpcClient, {
                                oref: WOS.makeORef("workspace", workspaceId),
                                meta: {
                                    "os:identity": identity.id,
                                    ...(channel ? { "os:channelsetup": channel } : {}),
                                } as MetaType,
                            });
                            pendingWorkspaceId.current = undefined;
                            setWorkspaceSetupOpen(false);
                            getApi().switchWorkspace(workspaceId);
                        }}
                    />
                )}
                {systemLoadState === "restoring" && (
                    <div className="os-restore-status" role="status">
                        <span className="os-restore-status-spinner" aria-hidden="true" />
                        Restoring space
                    </div>
                )}
                <OSModeShell
                    hasComfyPanels={hasComfyPanels}
                    systemControlsSlot={penCanvasVisible ? penSystemControlsSlot : null}
                    workspaces={workspaces}
                    currentWorkspaceId={currentWorkspace?.oid ?? ""}
                    blocks={descriptors}
                    collapsedIds={blockIds.filter((id) => state.windows[id]?.collapsed)}
                    showCollapsedDock={state.view === "canvas" && (!desktopWidgetsEnabled || viewport.width <= 900)}
                    onWorkspace={(workspaceId) => {
                        if (stateRef.current.view !== "kronos-v2") void getApi().switchWorkspace(workspaceId);
                    }}
                    onCreateWorkspace={() => setWorkspaceSetupOpen(true)}
                    onRestore={(blockId) => dispatch({ type: "spatial.restore", blockId })}
                    onPinResource={pinResource}
                    onShowApps={() => {
                        if (stateRef.current.view !== "kronos-v2") {
                            dispatch({ type: "os.view.set", view: "design" });
                        }
                        void requestPenEditor(tabId, "show_workspaces").catch((error: unknown) => {
                            setCanvasHint(error instanceof Error ? error.message : "Could not open the Workspace dashboard.");
                        });
                    }}
                    osView={state.view}
                    onFocusApp={(blockId) => {
                        dispatch({ type: "os.view.set", view: "canvas" });
                        dispatch({ type: "spatial.focus", blockId });
                    }}
                />
                {state.view === "canvas" && state.scene.kind === "overview" && (
                    <OSSpaceOverview
                        blocks={descriptors}
                        workspaces={workspaces}
                        currentWorkspaceId={currentWorkspace?.oid ?? ""}
                        state={state}
                        onDelete={(workspaceId) => getApi().deleteWorkspace(workspaceId)}
                        onSwitch={(workspaceId) => getApi().switchWorkspace(workspaceId)}
                        onCreate={() => setWorkspaceSetupOpen(true)}
                        onConfigure={() => {
                            setEditingWorkspaceSetup(true);
                            setWorkspaceSetupOpen(true);
                        }}
                    />
                )}
                {activeTabGroup &&
                    activeTabBounds &&
                    state.scene.kind === "focused" &&
                    !state.windows[activeBlockId]?.maximized && (
                        <nav
                            className="os-window-tabs"
                            aria-label="Window tabs"
                            style={{
                                left: activeTabBounds.x,
                                top: activeTabBounds.y - 36,
                                width: activeTabBounds.width,
                            }}
                        >
                            <div role="tablist" aria-label="Grouped widgets">
                                {activeTabGroup.blockIds.map((id, index) => (
                                    <button
                                        key={id}
                                        type="button"
                                        role="tab"
                                        aria-selected={id === activeBlockId}
                                        onClick={() => dispatch({ type: "os.window.focus", blockId: id })}
                                        onKeyDown={(event) => {
                                            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                            event.preventDefault();
                                            const next =
                                                activeTabGroup.blockIds[
                                                    (index +
                                                        (event.key === "ArrowRight"
                                                            ? 1
                                                            : activeTabGroup.blockIds.length - 1)) %
                                                        activeTabGroup.blockIds.length
                                                ];
                                            dispatch({ type: "os.window.focus", blockId: next });
                                            event.currentTarget.parentElement
                                                ?.querySelector<HTMLButtonElement>(`[data-tab-id="${next}"]`)
                                                ?.focus();
                                        }}
                                        data-tab-id={id}
                                        tabIndex={id === activeBlockId ? 0 : -1}
                                        onContextMenu={(event) =>
                                            ContextMenuModel.getInstance().showContextMenu(
                                                [
                                                    {
                                                        label: "Move Tab Left",
                                                        enabled: index > 0,
                                                        click: () =>
                                                            dispatch({
                                                                type: "os.tabs.reorder",
                                                                blockId: id,
                                                                index: index - 1,
                                                            }),
                                                    },
                                                    {
                                                        label: "Move Tab Right",
                                                        enabled: index < activeTabGroup.blockIds.length - 1,
                                                        click: () =>
                                                            dispatch({
                                                                type: "os.tabs.reorder",
                                                                blockId: id,
                                                                index: index + 1,
                                                            }),
                                                    },
                                                    {
                                                        label: "Detach Tab",
                                                        click: () => dispatch({ type: "os.tabs.detach", blockId: id }),
                                                    },
                                                    {
                                                        label: "Minimize Tab",
                                                        click: () =>
                                                            dispatch({ type: "os.window.minimize", blockId: id }),
                                                    },
                                                ],
                                                event
                                            )
                                        }
                                    >
                                        {descriptors.find((item) => item.blockId === id)?.title ?? "Widget"}
                                    </button>
                                ))}
                            </div>
                        </nav>
                    )}
                {state.view === "canvas" && carouselOrder.length > 0 && (
                    <nav className="os-carousel-controls" aria-label="Pane navigation">
                        {([-1, 1] as const).map((direction) => {
                            const id = getOSPaneNeighbor(state, direction);
                            const previous = direction === -1;
                            const Icon = previous ? ChevronLeft : ChevronRight;
                            return (
                                <button
                                    key={direction}
                                    type="button"
                                    aria-label={previous ? "Previous pane" : "Next pane"}
                                    aria-keyshortcuts={previous ? "<" : ">"}
                                    disabled={!id}
                                    onClick={() => id && navigatePane(id)}
                                >
                                    <Icon aria-hidden="true" />
                                </button>
                            );
                        })}
                    </nav>
                )}
                <OSWidgetsFileView
                    hidden={state.view !== "file"}
                    blocks={descriptors.map((descriptor) => ({
                        ...descriptor,
                        collapsed: state.windows[descriptor.blockId]?.collapsed,
                    }))}
                    activeBlockId={activeBlockId}
                    workspaceName={
                        workspaces.find((workspace) => workspace.id === currentWorkspace?.oid)?.name ??
                        "Current workspace"
                    }
                    onOpenBlock={(blockId) => {
                        dispatch({ type: "os.view.set", view: "canvas" });
                        dispatch({ type: "spatial.focus", blockId });
                    }}
                    onToggleFiled={(blockId, filed) =>
                        dispatch({ type: filed ? "spatial.collapse" : "spatial.restore", blockId })
                    }
                    onOpenResource={openResource}
                    onPinResource={pinResource}
                    onSaveResource={(resource) => void systemModel.pinArtifact(resource)}
                    onAttachResource={attachOSResourceToKronos}
                />
                <div className="os-workflow-panels">
                    <OSOriginalWorkflow
                        onPanelLayout={setWorkflowPanelLayout}
                        tabId={tabId}
                        onChat={() => hermesSurfaceController.requestOpenChat()}
                        workspaceId={currentWorkspace?.oid}
                        camera={kronosV2 ? penWorkflowCamera : state.camera}
                        toolsTarget={workflowToolsTarget}
                        focusTarget={workflowFocusTarget}
                        onFocusVisibility={onWorkflowFocusVisibility}
                        worldTarget={workflowWorldTarget}
                        viewportTarget={viewportRef.current}
                        objectOrder={sceneZIndices}
                        selectedObjectId={state.selectedEntityId}
                        visible={workflowGraphVisible}
                        onCameraIntent={moveWorkflowCamera}
                        onObjects={(objects) =>
                            setState((current) => {
                                const next = {
                                    ...current,
                                    selectedEntityId:
                                        current.selectedEntityId?.startsWith("workflow:") &&
                                        !objects.some((object) => object.id === current.selectedEntityId)
                                            ? undefined
                                            : current.selectedEntityId,
                                    objects: [
                                        ...current.objects.filter((object) => !object.id.startsWith("workflow:")),
                                        ...objects,
                                    ],
                                };
                                stateRef.current = next;
                                return next;
                            })
                        }
                        onActivate={() => setAndPersist(activateOSWorkflowCanvas)}
                    />
                </div>
                <div
                    className={cn("os-mode-viewport", workflowPanelLayout.top > 0 && "has-workflow-panels")}
                    ref={viewportRef}
                    onPointerDownCapture={captureCanvasPan}
                    onLostPointerCapture={(event) => {
                        if (event.target === event.currentTarget && marqueeRef.current?.pointerId === event.pointerId) {
                            handleRootPointerUp(event);
                        }
                    }}
                    onDragOver={(event) => {
                        if (
                            event.dataTransfer.types.includes(OSAppDragMimeType) ||
                            event.dataTransfer.types.includes(OSResourceDragMimeType) ||
                            ((!penCanvasVisible || kronosV2) && acceptsCanvasTransfer(event.dataTransfer))
                        ) {
                            allowCanvasDrop(event);
                        }
                    }}
                    onDrop={(event) => {
                        const clientPoint = { x: event.clientX, y: event.clientY };
                        const resource = readOSResourceDragPayload(event.dataTransfer);
                        if (resource != null) {
                            event.preventDefault();
                            importResources([resource], clientPoint);
                            return;
                        }
                        if (
                            (!penCanvasVisible || kronosV2) &&
                            importCanvasTransfer(
                                event.dataTransfer,
                                getApi(),
                                (files) => importResources(files, clientPoint),
                                setCanvasHint
                            )
                        ) {
                            event.preventDefault();
                            return;
                        }
                        const payload = readOSAppDragPayload(event.dataTransfer);
                        if (payload == null) return;
                        event.preventDefault();
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const point = screenRectToWorld(
                            { x: event.clientX - bounds.left, y: event.clientY - bounds.top, width: 0, height: 0 },
                            stateRef.current.camera
                        );
                        const worldX = Math.max(16, point.x - 260);
                        const worldY = Math.max(96, point.y - 30);
                        handleDropApp(payload, worldX, worldY);
                    }}
                    tabIndex={state.view === "canvas" ? 0 : undefined}
                    onPointerDown={(event) => {
                        if (state.view === "canvas" && isOSCanvasBackground(event.target, event.currentTarget)) {
                            event.currentTarget.focus({ preventScroll: true });
                        }
                        if (focusedCanvasWidget && event.button === 0 && event.target === event.currentTarget) {
                            dispatch({ type: "os.window.restore", blockId: focusedCanvasWidget });
                            return;
                        }
                        if (
                            kronOSCanvasVisible &&
                            isOSCanvasBackground(event.target, event.currentTarget) &&
                            tool === "select" &&
                            event.button === 0 &&
                            event.isPrimary
                        ) {
                            const rect = event.currentTarget.getBoundingClientRect();
                            event.preventDefault();
                            marqueeRef.current = {
                                pointerId: event.pointerId,
                                start: { x: event.clientX - rect.left, y: event.clientY - rect.top },
                            };
                            event.currentTarget.setPointerCapture(event.pointerId);
                            setCanvasPointerCaptured(true);
                            return;
                        }
                        if (
                            state.scene.kind !== "freeform" ||
                            event.target !== event.currentTarget ||
                            (tool !== "hand" && event.button !== 1)
                        )
                            return;
                        panRef.current = {
                            pointerId: event.pointerId,
                            clientX: event.clientX,
                            clientY: event.clientY,
                            x: state.camera.x,
                            y: state.camera.y,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onContextMenu={(event) => {
                        if (
                            state.scene.kind !== "freeform" ||
                            !isOSCanvasBackground(event.target, event.currentTarget)
                        ) return;
                        event.preventDefault();
                        showDesktopContextMenu(event);
                    }}
                >
                    {(penCanvasVisible || penVisited) && (
                        <OSPenEditor
                            key={kronosV2 ? `kronos-v2:${tabId}` : tabId}
                            tabId={tabId}
                            kronosV2={kronosV2}
                            presenting={kronosV2 && penPresentation.active}
                            visible={penCanvasVisible}
                            camera={kronosV2 ? penRequestedCamera : undefined}
                            onCamera={kronosV2 ? updatePenCamera : undefined}
                            onViewport={kronosV2 ? updatePenViewport : undefined}
                            widgets={penWidgets}
                            onWidgets={kronosV2 ? onPenWidgets : undefined}
                            onWidgetControlsSlot={kronosV2 ? setPenWidgetControlsSlot : undefined}
                            onWidgetsReady={kronosV2 ? setPenWidgetsReady : undefined}
                            onWidgetInteract={kronosV2 ? interactWithPenWidget : undefined}
                            onCanvasInteraction={kronosV2 ? leavePenWidget : undefined}
                            onOverlay={kronosV2 ? setPenOverlayOpen : undefined}
                            chatDockTabs={chatDockTabs}
                            chatDockFocus={penChatDockFocus}
                            onChatDockActive={setPenChatDockActive}
                            onOpenActivityWidget={kronosV2 ? (id) => {
                                if (!chatDockTabs.some((tab) => tab.id === id)) {
                                    if (!descriptors.some((block) => block.blockId === id && block.resolved) ||
                                        !getKronOSV2Widget(stateRef.current, id)) return false;
                                    setPenWidgetVisible(id, true);
                                }
                                setPenChatDockFocus({ id });
                                return true;
                            } : undefined}
                            onFullChat={kronosV2 ? setPenFullChat : undefined}
                            onPresentation={kronosV2 ? updatePenPresentation : undefined}
                            context={penContext}
                            onToolsSlot={kronosV2 ? setPenToolsSlot : undefined}
                            onSystemControlsSlot={setPenSystemControlsSlot}
                            onRenderControlsSlot={attachPenRenderControls}
                            onIslandControlsSlot={kronosV2 ? setPenIslandControlsSlot : undefined}
                            onRenderLibrary={(library) => {
                                if (library === "nodes" || library === "models") {
                                    setAndPersist(activateOSWorkflowCanvas);
                                    $workflowPickerSource.set(library === "nodes" ? "comfy-nodes" : "comfy-models");
                                    return;
                                }
                                if (!Object.hasOwn(ComfyLibraries, library)) return;
                                setComfyLibrary(library as ComfyLibrary);
                                setComfyWorkflowOpen(true);
                                $workflowSidebarMode.set("comfy");
                                setSidebarOpen(true);
                            }}
                            onWorkspaceAction={(workspaceId) => {
                                if (stateRef.current.view === "kronos-v2") return;
                                if (!workspaceId) {
                                    setEditingWorkspaceSetup(false);
                                    setWorkspaceSetupOpen(true);
                                    return;
                                }
                                const target = workspaces.find(
                                    (workspace) => (workspace.tabId || workspace.id) === workspaceId
                                );
                                if (target) void getApi().switchWorkspace(target.id);
                            }}
                        />
                    )}
                    {kronosV2 && penLivePlaneVisible && !penFocusedWidget && !penPresentation.active && (
                        <button
                            type="button"
                            className="kronos-v2-add-folder"
                            aria-label="Add folder to canvas"
                            title="Add folder to canvas"
                            onClick={async () => {
                                try {
                                    const path = await getApi().selectDirectory();
                                    if (!path || stateRef.current.view !== "kronos-v2") return;
                                    importResources([{ ...canvasFileResource(path), kind: "folder" }]);
                                } catch {
                                    setCanvasHint("Could not open the folder picker.");
                                }
                            }}
                        >
                            <FolderOpen size={17} aria-hidden="true" />
                        </button>
                    )}
                    {kronosV2 && penWidgetControlsSlot && createPortal(
                        <KronOSV2LayerControls
                            widgets={penWidgets}
                            selectedBlockId={penFocusedWidget ?? penLayerWidget ?? penInputWidget}
                            focusedBlockId={penFocusedWidget}
                            onToggleVisibility={setPenWidgetVisible}
                            onToggleFocus={togglePenWidgetExpansion}
                            onClose={handleClose}
                        />,
                        penWidgetControlsSlot
                    )}
                    {kronosV2 && penToolsSlot?.isConnected && workflowGraphVisible && createPortal(
                        <details data-kronos-v2-workflow-tools="">
                            <summary aria-label="KronFlow tools" title="KronFlow tools">
                                <Link2 size={16} aria-hidden="true" />
                            </summary>
                            <div className="kronos-v2-workflow-tool-popover">
                                <div ref={setWorkflowToolsTarget} data-workflow-tool-rail="" data-kronos-v2-tool-rail="" />
                            </div>
                        </details>,
                        penToolsSlot
                    )}
                    {kronosV2 && penToolsSlot?.isConnected && createPortal(
                        <>
                            <IslandLauncher busy={launchingIsland} onOpen={openFloatingIsland} />
                            <IslandModelTools model={islandModel} />
                        </>,
                        penToolsSlot
                    )}
                    {kronosV2 && penIslandControlsSlot?.isConnected && islandModel && createPortal(
                        <IslandGameControls model={islandModel} />,
                        penIslandControlsSlot
                    )}
                    {systemLayerEnabled && kronOSCanvasVisible && (
                        <>
                            <div
                                role="group"
                                aria-label="Canvas tools panel"
                                className={cn(
                                    "os-canvas-tool-rail",
                                    workflowPanelLayout.top > 0 && "has-workflow-tools",
                                    !canvasToolsOpen && "is-closed",
                                    "is-kronos-canvas-tools"
                                )}
                                aria-hidden={!canvasToolsOpen}
                                onWheel={(event) => event.stopPropagation()}
                                data-live-block-occluder=""
                                data-react-grab-ignore-events=""
                                data-workflow-panel=""
                            >
                                <SystemToolbar
                                    className="os-canvas-toolbar"
                                    aria-label="Canvas tools"
                                    data-live-block-occluder=""
                                >
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        selected={tool === "select"}
                                        onClick={() => {
                                            setConnectorStartId(undefined);
                                            setCanvasHint("");
                                            setTool("select");
                                        }}
                                        aria-label="Select"
                                        title="Select"
                                    >
                                        <MousePointer2 />
                                    </SystemButton>
                                    {isMacOS() && <DesktopGrabControl compact />}
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        selected={tool === "hand"}
                                        onClick={() => {
                                            setConnectorStartId(undefined);
                                            setCanvasHint("");
                                            setTool("hand");
                                        }}
                                        aria-label="Pan Canvas"
                                        title="Pan Canvas"
                                    >
                                        <Hand />
                                    </SystemButton>
                                    <span className="os-canvas-toolbar-separator" aria-hidden="true" />
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        onClick={() => addObject("note")}
                                        aria-label="Add note"
                                        title="Add note"
                                    >
                                        <StickyNote />
                                    </SystemButton>
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        onClick={() => addObject("rectangle")}
                                        aria-label="Add rectangle"
                                        title="Add rectangle"
                                    >
                                        <ShapeSquare />
                                    </SystemButton>
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        onClick={() => addObject("ellipse")}
                                        aria-label="Add ellipse"
                                        title="Add ellipse"
                                    >
                                        <ShapeCircle />
                                    </SystemButton>
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        onClick={() => addObject("diamond")}
                                        aria-label="Add decision"
                                        title="Add decision"
                                    >
                                        <ShapeDiamond />
                                    </SystemButton>
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        selected={tool === "connector"}
                                        onClick={() => {
                                            setConnectorStartId(undefined);
                                            setCanvasHint("Select two objects to connect.");
                                            setTool("connector");
                                        }}
                                        aria-label="Connect objects"
                                        title="Connect objects"
                                    >
                                        <Link2 />
                                    </SystemButton>
                                    <span className="os-canvas-toolbar-separator" aria-hidden="true" />
                                    <SystemButton
                                        type="button"
                                        size="small"
                                        onClick={fitAll}
                                        aria-label="Fit all"
                                        title="Fit all"
                                    >
                                        <Focus />
                                    </SystemButton>
                                </SystemToolbar>
                                <div
                                    ref={setWorkflowToolsTarget}
                                    className="os-original-canvas-tools"
                                    data-workflow-tool-rail=""
                                />
                                <SystemButton
                                    size="small"
                                    aria-label="Close Canvas tools"
                                    onClick={() => setCanvasToolsOpen(false)}
                                >
                                    <X />
                                </SystemButton>
                            </div>

                        </>
                    )}
                    {(kronosV2 || (systemLayerEnabled && kronOSCanvasVisible)) && (
                        <CanvasToolsPortal target={document.body}>
                            <WorkflowFocusPanel
                                editing={workflowConfigOpen}
                                visible={workflowGraphVisible && workflowFocusVisible}
                                setTarget={setWorkflowFocusTarget}
                            />
                        </CanvasToolsPortal>
                    )}
                    {desktopWidgetsEnabled && state.view === "canvas" && state.scene.kind !== "overview" && (
                        <OSDesktopLayer
                            windows={desktopWindows}
                            pins={dockPins}
                            installedApps={desktopInstalledApps}
                            onFocusWindow={(blockId) => {
                                dispatch({ type: "spatial.restore", blockId });
                                dispatch({ type: "spatial.focus", blockId });
                            }}
                            onAskKronos={askKronos}
                            onOpenKronos={() => hermesSurfaceController.requestOpenChat()}
                            onLaunchPin={launchDockPin}
                            onPinsChange={updateDockPins}
                        />
                    )}
                    <div
                        ref={penLivePlaneRef}
                        className="os-kronos-live-plane"
                        data-kronos-v2-focused={kronosV2 && penFocusedWidget ? "" : undefined}
                        data-kronos-v2-presenting={kronosV2 && penSlideWidget ? "" : undefined}
                        hidden={penCanvasVisible && (!kronosV2 || !penLivePlaneVisible)}
                        style={kronosV2 && penViewport ? {
                            inset: "auto",
                            left: penViewport.x,
                            top: penViewport.y,
                            width: penViewport.width,
                            height: penViewport.height,
                            "--pen-viewport-x": `${penViewport.x}px`,
                            "--pen-viewport-y": `${penViewport.y}px`,
                        } as CSSProperties : undefined}
                    >
                        <OSComfyWorkflow
                            tabId={tabId}
                            controlsTarget={penCanvasVisible && inspectorOpen ? penRenderControlsSlot : null}
                            active={comfyWorkflowOpen}
                            visible={comfyWorkflowOpen && workflowGraphVisible}
                            camera={renderCamera}
                            order={sceneZIndices}
                            world={comfyWorldTarget}
                            libraryTarget={comfyLibraryTarget}
                            propertiesTarget={comfyPropertiesTarget}
                            logsTarget={comfyLogsTarget}
                            panels={comfyPanels}
                            allowCanvasPicker={tool === "select"}
                            onActivate={() => {
                                setComfyWorkflowOpen(true);
                                const current = stateRef.current;
                                if (current.view !== "canvas" || current.scene.kind !== "freeform")
                                    setAndPersist(activateOSWorkflowCanvas);
                            }}
                            onReady={(ready) => {
                                setComfyReady(ready);
                                if (ready && $sidebarOpen.get()) $workflowSidebarMode.set("comfy");
                            }}
                            onTogglePanel={(panel) => {
                                if (panel === "library") {
                                    $workflowSidebarMode.set(comfyPanels.library ? "sessions" : "comfy");
                                    if (!comfyPanels.library) setSidebarOpen(true);
                                } else if (panel === "properties") {
                                    if (comfyPanels.properties) $krontermInspectorSection.set("files");
                                    else openComfyProperties();
                                } else setShowComfyLogs((open) => !open);
                            }}
                            onClosePanel={(panel) => {
                                if (panel === "library") $workflowSidebarMode.set("sessions");
                                else $krontermInspectorSection.set("files");
                            }}
                            onNodes={(nodes) =>
                                setState((current) => {
                                    const next = {
                                        ...current,
                                        objects: [
                                            ...current.objects.filter((object) => !object.id.startsWith("comfy:")),
                                            ...nodes,
                                        ],
                                        selectedEntityId:
                                            current.selectedEntityId?.startsWith("comfy:") &&
                                            !nodes.some((node) => node.id === current.selectedEntityId)
                                                ? undefined
                                                : current.selectedEntityId,
                                    };
                                    stateRef.current = next;
                                    return next;
                                })
                            }
                            onSelect={selectCanvasObject}
                            onFit={(nodes) => {
                                if (!nodes.length) return;
                                moveWorkflowCamera({ fitBounds: spatialBoundsForRects(nodes) });
                            }}
                            onClose={() => {
                                setComfyWorkflowOpen(false);
                                if (penCanvasVisible) $krontermInspectorOpen.set(false);
                            }}
                        />
                        <div
                            className="os-mode-world"
                            style={{
                                transform: kronosV2
                                    ? penFocusedWidget
                                        ? "none"
                                        : "translate3d(calc(var(--pen-camera-x, 0px) - var(--pen-viewport-x)), calc(var(--pen-camera-y, 0px) - var(--pen-viewport-y)), 0) scale(var(--pen-camera-zoom, 1))"
                                    : worldTransform,
                                "--os-canvas-zoom": kronosV2
                                    ? penFocusedWidget ? 1 : "var(--pen-camera-zoom, 1)"
                                    : state.camera.zoom,
                            } as CSSProperties}
                        >
                            <div
                                ref={setComfyWorldTarget}
                                style={{ display: comfyWorkflowOpen && workflowGraphVisible ? "contents" : "none" }}
                                data-comfy-workflow-world=""
                                data-workflow-native-host=""
                            />
                            <div
                                ref={setWorkflowWorldTarget}
                                role="group"
                                aria-label="Workflow objects on the OS canvas"
                                data-workflow-native-host=""
                                data-workflow-world=""
                                hidden={!workflowGraphVisible}
                                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                            />
                            {((!kronosV2 && state.scene.kind === "freeform") || (kronosV2 && !penFocusedWidget && !penPresentation.active)) && (
                                <>
                                    {!kronosV2 && <svg className="os-connectors" aria-hidden="true">
                                        {connectorObjects.map((connector) => {
                                            const from = dragBounds[connector.fromObjectId] ??
                                                getOSCanvasEntityBounds(state, connector.fromObjectId);
                                            const to = dragBounds[connector.toObjectId] ??
                                                getOSCanvasEntityBounds(state, connector.toObjectId);
                                            if (!from || !to) return null;
                                            return (
                                                <line
                                                    key={connector.id}
                                                    x1={from.x + from.width / 2}
                                                    y1={from.y + from.height / 2}
                                                    x2={to.x + to.width / 2}
                                                    y2={to.y + to.height / 2}
                                                />
                                            );
                                        })}
                                    </svg>}
                                    {state.objects
                                        .filter((object) => kronosV2
                                            ? ["file", "folder", "generated-artifact"].includes(object.kind)
                                            : object.kind !== "workflow-node")
                                        .map((object) => (
                                            <OSCanvasEntity
                                                key={object.id}
                                                object={dragBounds[object.id] ? { ...object, ...dragBounds[object.id] } : object}
                                                selected={(!marquee && state.selectedEntityId === object.id) ||
                                                    highlightedSelection.includes(object.id)}
                                                zIndex={(sceneZIndices[object.id] ?? 0) + (kronosV2 ? descriptors.length + 1 : 0)}
                                                zoom={state.camera.zoom}
                                                getZoom={kronosV2 ? () => penCameraRef.current.zoom : undefined}
                                                browseFolderOnClick={kronosV2}
                                                onSelect={selectCanvasObject}
                                                onGroupDragStart={
                                                    !kronosV2 && multiSelection.length > 1 && multiSelection.includes(object.id)
                                                        ? (event) =>
                                                              beginWindowInteraction(
                                                                  event,
                                                                  object.id,
                                                                  { bounds: object, presentation: "freeform" },
                                                                  "move"
                                                              )
                                                        : undefined
                                                }
                                                onMove={(id, x, y) => updateObject(id, { x, y })}
                                                onResize={(id, width, height, position) =>
                                                    updateObject(id, { ...position, width, height })
                                                }
                                                onDelete={deleteObject}
                                                onTextChange={(id, text) => updateObject(id, { text })}
                                                onOpenResource={openResource}
                                                onCreateVariants={(source) => {
                                                    void openRenderComparison(tabId, source.resource, source.render)
                                                        .then((ref) => {
                                                            const [, id] = WOS.splitORef(ref);
                                                            if (stateRef.current.view === "kronos-v2") setPenActiveWidget(id);
                                                        })
                                                        .catch((failure) => setCanvasHint(String(failure)));
                                                }}
                                                onOpenCanvasEntry={openCanvasFolderEntry}
                                            />
                                        ))}
                                </>
                            )}
                            {descriptors.map((descriptor) => {
                                const blockId = descriptor.blockId;
                                const widget = penWidgetsById.get(blockId);
                                const penActive = penFocusedWidget === blockId;
                                const penVisible = widget?.visible && (
                                    penPresentation.active ? penSlideWidget === blockId : !penFocusedWidget || penActive
                                );
                                const penAcceptsInput = penVisible && penLivePlaneVisible;
                                const nativeLayout = windowLayouts[blockId];
                                const layout: OSWindowLayout = kronosV2 ? {
                                    bounds: penActive && penViewport ? {
                                        x: 8,
                                        y: 8,
                                        width: Math.max(1, penViewport.width - 16),
                                        height: Math.max(1, penViewport.height - 16),
                                    } : widget ?? nativeLayout.bounds,
                                    presentation: penVisible ? "freeform" : "collapsed",
                                    opacity: penVisible ? 1 : 0,
                                    scale: 1,
                                    rotateY: 0,
                                    zIndex: penActive ? descriptors.length + 1 : state.zOrder.indexOf(blockId) + 1,
                                } : nativeLayout;
                                const docked = !!activeGroup?.blockIds.includes(descriptor.blockId);
                                return (
                                    <OSBlockWindow
                                        key={descriptor.blockId}
                                        descriptor={descriptor}
                                        layout={
                                            !kronosV2 && state.scene.kind === "freeform"
                                                ? { ...layout, zIndex: sceneZIndices[descriptor.blockId] }
                                                : layout
                                        }
                                        penWidget={kronosV2}
                                        penPassive={kronosV2 && !penAcceptsInput}
                                        canvasWidget={kronosV2 ? !!penVisible : kronOSCanvasVisible && layout.presentation === "freeform"}
                                        multiSelected={!kronosV2 && highlightedSelection.includes(blockId)}
                                        selected={kronosV2 ? penAcceptsInput && (penActive || penInputWidget === blockId) : (
                                            (!marquee && state.selectedEntityId === descriptor.blockId) ||
                                            (state.scene.kind === "focused" &&
                                                state.scene.blockId === descriptor.blockId) ||
                                            (state.scene.kind === "overview" &&
                                                state.scene.selectedBlockId === descriptor.blockId)
                                        )}
                                        docked={!kronosV2 && docked}
                                        maximized={kronosV2 ? penActive : state.windows[blockId]?.maximized}
                                        agentPresence={agentPresenceByBlock.get(descriptor.blockId)}
                                        reducedMotion={reducedMotion}
                                        interacting={
                                            kronosV2 || resizingPane || !!paneTakeover || !!dragBounds[blockId]
                                        }
                                        onFocus={kronosV2 ? setPenInputWidget : focusBlock}
                                        surfaceInput={kronosV2 ? penAcceptsInput
                                            ? ActivePenWidgetInput : PassivePenWidgetInput : surfaceInput}
                                        onTitlePointerDown={(event, blockId, nextLayout) => {
                                            if (!kronosV2) beginWindowInteraction(event, blockId, nextLayout, "move");
                                        }}
                                        onResizePointerDown={(event, blockId, nextLayout, edge) =>
                                            beginWindowInteraction(event, blockId, nextLayout, "resize", edge)
                                        }
                                        onClose={handleClose}
                                        onCollapse={kronosV2 ? (blockId) => setPenWidgetVisible(blockId, false)
                                            : (blockId) => dispatch({ type: "spatial.collapse", blockId })}
                                        onToggleFocus={kronosV2 ? togglePenWidgetExpansion : (blockId) =>
                                            state.windows[blockId]?.maximized
                                                ? dispatch({ type: "os.window.restore", blockId })
                                                : expandCanvasWidget(blockId)
                                        }
                                        onExitFocus={kronosV2 ? penActive ? returnToPenCanvas : undefined :
                                            state.view === "canvas" &&
                                            state.scene.kind === "focused" &&
                                            state.scene.blockId === descriptor.blockId
                                                ? () => {
                                                      if (state.windows[descriptor.blockId]?.maximized) {
                                                          dispatch({ type: "os.window.restore", blockId: descriptor.blockId });
                                                      }
                                                      dispatch({ type: "spatial.freeform" });
                                                  }
                                                : undefined
                                        }
                                        onTitleContextMenu={showWindowContextMenu}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    {kronOSCanvasVisible && (marquee || alignmentGuides.length > 0) && (
                        <CanvasGestureOverlay
                            viewport={viewportRef.current}
                            camera={state.camera}
                            guides={alignmentGuides}
                            marquee={marquee}
                        />
                    )}
                    {(kronOSCanvasVisible || kronosV2) && canvasHint && (
                        <p
                            role="status"
                            className="absolute bottom-24 left-1/2 z-[1800] -translate-x-1/2 bg-background px-3 py-2 text-sm text-foreground pointer-events-none"
                        >
                            {canvasHint}
                        </p>
                    )}
                    {state.view === "canvas" && dockPreview && (
                        <div
                            className={cn("os-dock-preview", `is-${dockPreview.side}`)}
                            style={{
                                top: dockPreview.targetBounds.y,
                                left:
                                    dockPreview.side === "left"
                                        ? dockPreview.targetBounds.x
                                        : dockPreview.targetBounds.x + dockPreview.targetBounds.width / 2,
                                width: dockPreview.targetBounds.width / 2,
                                height: dockPreview.targetBounds.height,
                            }}
                        >
                            <span>
                                Dock {dockPreview.side} of {dockPreview.targetTitle}
                            </span>
                        </div>
                    )}
                    {state.view === "canvas" && activeGroup && <OSGroupFrame group={activeGroup} layouts={windowLayouts} />}
                    {adjacentPanes.map(({ left, right }) => {
                        const leftWeight = getOSPaneWeight(state, left.id, activeGroup);
                        const rightWeight = getOSPaneWeight(state, right.id, activeGroup);
                        return (
                            <OSPaneDivider
                                key={left.id + ":" + right.id}
                                left={(left.bounds.x + left.bounds.width + right.bounds.x) / 2}
                                top={right.bounds.y + 16}
                                height={Math.max(1, right.bounds.height - 32)}
                                span={left.bounds.width + right.bounds.width - 2 * OSMinimumPaneWidth}
                                ratio={leftWeight / (leftWeight + rightWeight)}
                                onResize={setResizingPane}
                                onRatio={(ratio) =>
                                    dispatch({
                                        type: "spatial.setDivider",
                                        groupId: activeGroup?.id,
                                        left: left.id,
                                        right: right.id,
                                        ratio,
                                    })
                                }
                            />
                        );
                    })}
                </div>
            </div>
        </SystemUIProvider>
    );
}

export { OSModeView };

function WorkflowFocusPanel({
    editing,
    visible,
    setTarget,
}: {
    editing: boolean;
    visible: boolean;
    setTarget: (target: HTMLDivElement) => void;
}) {
    const appearance = useSystemAppearance();
    return (
        <section
            className={cn("kt-system-ui os-canvas-focus-frame", editing && "is-editing")}
            hidden={!visible}
            aria-label="Workflow focus panel"
            data-color-scheme={appearance.colorScheme}
            data-contrast={appearance.contrast}
            data-live-block-occluder=""
        >
            <div className="os-canvas-tools-heading">
                <span>{editing ? "Node configuration" : "Focus panel"}</span>
                <SystemButton
                    size="small"
                    aria-label="Close workflow focus panel"
                    onClick={() =>
                        window.dispatchEvent(
                            editing
                                ? new CustomEvent("kronterm:workflow-close-node-config")
                                : new CustomEvent("kronterm:canvas-toolbar-action", {
                                      detail: { action: "workflow-focus" },
                                  })
                        )
                    }
                >
                    <X />
                </SystemButton>
            </div>
            <div ref={setTarget} className="os-canvas-focus-slot" />
        </section>
    );
}

function CanvasGestureOverlay({
    viewport,
    camera,
    guides,
    marquee,
}: {
    viewport: HTMLElement;
    camera: OSModeState["camera"];
    guides: OSAlignmentGuide[];
    marquee?: DragBounds;
}) {
    if (!viewport) return null;
    const { left, top, width, height } = viewport.getBoundingClientRect();
    const { clipPath } = getComputedStyle(viewport);
    return createPortal(
        <div className="os-canvas-gesture-overlay" style={{ left, top, width, height, clipPath }} aria-hidden="true">
            {marquee && (
                <div
                    className="os-canvas-marquee"
                    style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
                />
            )}
            {guides.map(({ axis, at, from, to }) => {
                const offset = from * camera.zoom;
                const length = (to - from) * camera.zoom;
                return (
                    <div
                        key={axis}
                        className="os-canvas-alignment-guide"
                        data-axis={axis}
                        style={
                            axis === "x"
                                ? { left: camera.x + at * camera.zoom, top: camera.y + offset, height: length }
                                : { left: camera.x + offset, top: camera.y + at * camera.zoom, width: length }
                        }
                    />
                );
            })}
        </div>,
        document.body
    );
}

function CanvasToolsPortal({ target, children }: { target: HTMLElement; children: React.ReactNode }) {
    return target ? createPortal(children, target) : children;
}
