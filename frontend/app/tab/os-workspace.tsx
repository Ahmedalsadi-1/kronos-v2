import { $workflowPickerSource } from "@hermes/store/command-palette";
import { $workflowSidebarMode } from "@hermes/app/workflows/workflow-context";
import { getCanvasToolbarSlot } from "@/app/lib/react-grab-canvas-toolbar";
import { DesktopGrabControl } from "@/app/workspace/kronterm-hud-controls";
import { WorkspaceService } from "@/app/store/services";
import Logo from "@/app/asset/logo.svg?url";
import { Menu } from "@base-ui/react/menu";
import * as Dialog from "@radix-ui/react-dialog";
import { createPortal } from "react-dom";
import { OSCanvasEntity } from "./os-canvas-entity";
import { PenDrawingTools, readPenLayerPatch, type PenDrawingTool } from "./os-pen-import";
import { OSPenPanel } from "./os-pen-panel";
import { OSPenEditor } from "./os-pen-editor";
import { requestPenEditor, type PenEditorMethod } from "./os-pen-editor-bridge";
import { loadPenProject, penProjectRoots, type PenProjectDocument } from "./os-pen-project";
import { $currentCwd, $selectedStoredSessionId, $workspaceCwdOwner } from "@hermes/store/session";
import { $workspaceChangeTick } from "@hermes/store/workspace-events";
import { OSPenProperties } from "./os-pen-properties";
import { osCanvasOwnsDelete, osWidgetOwnsWheel } from "./os-canvas-input";
import { OSOriginalWorkflow } from "./os-original-workflow";
import { ComfyLibraries, OSComfyWorkflow, type ComfyLibrary } from "./os-comfy-workflow";
import {
    applyOSWorkflowSelection,
    getOSCanvasEntityBounds,
    getOSSceneZIndices,
    getPersistedOSSceneOrder,
    selectOSSceneEntity,
} from "./os-scene-order";
import { resolveWorkflowCameraIntent, workflowEventMatchesTab, workflowOwnsWheel } from "./os-workflow-host";
import { activateOSWorkflowCanvas, keepWorkflowNodeVisible } from "./os-workflow-layout";
import { OSSpaceIdentities, OSWorkspaceSetup } from "./os-workspace-setup";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import KronTermOSWallpaper from "@/app/asset/kronterm-os-wallpaper.png";
import { BlockChromeProvider } from "@/app/block/block-chrome-context";
import { blockViewToName, resolveBlockIcon } from "@/app/block/blockutil";
import { PersistentBlock as BlockView } from "@/app/block/persistent-block";
import { AppIcon } from "@/app/components/app-icon";
import {
    SystemButton,
    SystemMaterial,
    SystemSegmentedControl,
    SystemToolbar,
    SystemUIProvider,
    SystemWindowFrame,
    useSystemAppearance,
} from "@/app/components/system-ui";
import {
    Battery,
    BatteryCharging,
    BatteryLow,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Focus,
    FolderOpen,
    Grid2X2,
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
    Unlink,
    Wifi,
    WifiOff,
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
import { classifyMedia } from "@/app/view/medialibrary/media-library-utils";
import { submitToHermes } from "@/app/view/hermes/hermes-quick-submit";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
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
import { atoms, getApi, getSettingsKeyAtom } from "@/store/global";
import { CompactDeviceBlocksAtom, getSingleDeviceWorkspaceWidth } from "@/app/view/computers/device-workspace-layout";
import * as services from "@/store/services";
import * as WOS from "@/store/wos";
import { systemMaterialVariables } from "@/types/system-materials";
import { getModelPreviewFormat } from "@/util/model-preview";
import { isMacOS } from "@/util/platformutil";
import { cn } from "@/util/util";
import {
    $krontermInspectorCompact,
    $krontermInspectorExpanded,
    $krontermInspectorOpen,
    $krontermInspectorSection,
    $krontermInspectorTarget,
    $krontermInspectorWidth,
    $krontermSidebarOwner,
    $krontermSidebarTarget,
    $comfyControlsOpen,
    $comfyLibraryTarget,
    $comfyPropertiesAvailable,
    $comfyPropertiesTarget,
    $workspaceCanvasPanels,
    $penDesignTarget,
    KrontermInspectorChatEvent,
    openKrontermFile,
} from "@hermes/lib/kronterm-sidebar";
import { $sidebarOpen, setSidebarOpen, toggleSidebarOpen } from "@hermes/store/layout";
import { useStore } from "@nanostores/react";
import { atom, useAtom, useAtomValue } from "jotai";
import {
    Bot,
    LayoutGrid,
    PanelBottom,
    PanelRight as SidebarRight,
    Search,
    SlidersHorizontal,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
    memo,
    useCallback,
    useEffect,
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
import { OSSpaceOverview, useOSSpaceSnapshot } from "./os-space-overview";
import { getOSNavigationTarget, placeOSCanvasObject, validateOSSurfaceControl } from "./os-surface-control";
import { OSSystemCenterPanel } from "./os-system-centers";
import { OSHermesSettings } from "./os-hermes-settings";
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
    getOSCarouselNeighbor,
    getOSCarouselOrder,
    getOSAdjacentPanes,
    getOSGroupAdditions,
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
import {
    canvasFileCardSize,
    canvasFileResource,
    isLocalCanvasFilePath,
    readNativeCanvasDrops,
} from "./workspace-canvas-files";
import "./os-workspace.scss";

// The shell refinements must follow the legacy compact-chrome rules.
import "./os-shell-polish.css";
import { registerWorkspaceSurfaceModeProvider, type WorkspaceSurfaceControlInput } from "./workspace-surface-runtime";

type OSResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
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

const OSBlockWindow = memo(
    ({
        descriptor,
        layout,
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
        onDock,
        onDetach,
        onTitleContextMenu,
        surfaceInput,
    }: {
        descriptor: BlockDescriptor;
        layout: OSWindowLayout;
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
        onDock: (blockId: string, side: "left" | "right") => void;
        onDetach: (blockId: string) => void;
        onTitleContextMenu?: (event: React.MouseEvent, blockId: string, sizeAction?: ContextMenuItem) => void;
        surfaceInput: {
            capturePointer: boolean;
            onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
            onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
        };
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
        return (
            <section
                ref={windowElement}
                className={cn(
                    "os-window",
                    phoneWindow && "is-phone-window",
                    "kt-system-material",
                    "is-window",
                    `is-${layout.presentation}`,
                    selected && "is-selected",
                    docked && "is-docked",
                    agentWorking && "is-agent-working",
                    kronTermHudController.isIsland(descriptor.blockId) && "is-hud-island",
                    interacting && "is-interacting"
                )}
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
                <SystemWindowFrame
                    titlebar={
                        phoneWindow ? null : (
                            <header
                                className="os-window-titlebar"
                                onPointerDown={(event) => onTitlePointerDown(event, descriptor.blockId, layout)}
                                onDoubleClick={() => onToggleFocus(descriptor.blockId)}
                                onContextMenu={(event) => {
                                    if (!onTitleContextMenu) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onFocus(descriptor.blockId);
                                    onTitleContextMenu(event, descriptor.blockId);
                                }}
                            >
                                <div className="os-window-title">
                                    <AppIcon icon={descriptor.icon} />
                                    {descriptor.view !== "preview" && <span>{descriptor.title}</span>}
                                </div>
                                <div
                                    ref={setToolbarHost}
                                    className="os-window-context"
                                    onPointerDown={(event) => {
                                        if (
                                            (event.target as HTMLElement).closest(
                                                "button, input, textarea, select, a, [contenteditable='true'], [role='button']"
                                            )
                                        )
                                            event.stopPropagation();
                                    }}
                                    onDoubleClick={(event) => event.stopPropagation()}
                                />
                                <div className="os-window-controls">
                                    {docked ? (
                                        <button
                                            type="button"
                                            onClick={() => onDetach(descriptor.blockId)}
                                            aria-label="Detach window"
                                        >
                                            <Unlink />
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => onDock(descriptor.blockId, "left")}
                                                aria-label="Dock left"
                                            >
                                                <PanelLeft />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDock(descriptor.blockId, "right")}
                                                aria-label="Dock right"
                                            >
                                                <PanelRight />
                                            </button>
                                        </>
                                    )}
                                </div>
                                <div className={cn("os-window-lights", !isMacOS() && "is-platform-controls")}>
                                    <button
                                        type="button"
                                        className="is-close"
                                        onClick={() => onClose(descriptor.blockId)}
                                        aria-label="Close"
                                    >
                                        <X />
                                    </button>
                                    <button
                                        type="button"
                                        className="is-minimize"
                                        onClick={() => onCollapse(descriptor.blockId)}
                                        aria-label="Minimize"
                                    >
                                        <Minimize2 />
                                    </button>
                                    <button
                                        type="button"
                                        className="is-zoom"
                                        onClick={() => onToggleFocus(descriptor.blockId)}
                                        aria-label={maximized ? "Restore window" : "Maximize window"}
                                    >
                                        <Maximize2 />
                                    </button>
                                </div>
                            </header>
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
                                <BlockView nodeModel={nodeModel} preview={false} surfaceInput={surfaceInput} />
                            </BlockChromeProvider>
                        </div>
                    </div>
                </SystemWindowFrame>
                {layout.presentation === "freeform" &&
                    OSResizeEdges.map((edge) => (
                        <span
                            key={edge}
                            className={`os-window-edge is-${edge}`}
                            role="presentation"
                            onPointerDown={(event) => onResizePointerDown(event, descriptor.blockId, layout, edge)}
                        />
                    ))}
            </section>
        );
    }
);
OSBlockWindow.displayName = "OSBlockWindow";

type OSBatteryState = { level: number; charging: boolean };
type BatteryManagerLike = OSBatteryState & EventTarget;

function useOSBatteryState(): OSBatteryState | undefined {
    const [battery, setBattery] = useState<OSBatteryState>();
    useEffect(() => {
        const getBattery = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery;
        if (getBattery == null) return;
        let manager: BatteryManagerLike | undefined;
        let cancelled = false;
        const update = () => manager && setBattery({ level: manager.level, charging: manager.charging });
        void getBattery
            .call(navigator)
            .then((result: BatteryManagerLike) => {
                if (cancelled) return;
                manager = result;
                update();
                manager.addEventListener("levelchange", update);
                manager.addEventListener("chargingchange", update);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
            manager?.removeEventListener("levelchange", update);
            manager?.removeEventListener("chargingchange", update);
        };
    }, []);
    return battery;
}

function subscribeOnline(notify: () => void): () => void {
    window.addEventListener("online", notify);
    window.addEventListener("offline", notify);
    return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
    };
}

const OSShellStatus = memo(() => {
    const online = useSyncExternalStore(
        subscribeOnline,
        () => navigator.onLine,
        () => true
    );
    const battery = useOSBatteryState();
    const percent = battery ? Math.round(battery.level * 100) : undefined;
    const BatteryIcon = battery?.charging ? BatteryCharging : percent != null && percent <= 20 ? BatteryLow : Battery;
    return (
        <div className="os-shell-status" role="group" aria-label="System status">
            <span title={online ? "Online" : "Offline"} aria-label={online ? "Online" : "Offline"}>
                {online ? <Wifi /> : <WifiOff />}
            </span>
            {percent != null && (
                <span title={`Battery ${percent}%${battery.charging ? ", charging" : ""}`}>
                    <BatteryIcon />
                    <span className="os-shell-status-value">{percent}%</span>
                </span>
            )}
        </div>
    );
});
OSShellStatus.displayName = "OSShellStatus";

export function OSModeShell({
    hasComfyPanels,
    workspaces,
    currentWorkspaceId,
    blocks,
    collapsedIds,
    showCollapsedDock,
    sceneKind,
    activeBlockId,
    osView,
    onSetOSView,
    onFocusApp,
    onWorkspace,
    onCreateWorkspace,
    onRestore,
    onPinResource,
    onOverview,
    onFreeform,
}: {
    hasComfyPanels?: boolean;
    workspaces: Array<{ id: string; name: string }>;
    currentWorkspaceId: string;
    blocks: BlockDescriptor[];
    collapsedIds: string[];
    showCollapsedDock: boolean;
    sceneKind: OSModeState["scene"]["kind"];
    activeBlockId: string | undefined;
    osView: KronTermOSView;
    onSetOSView: (view: KronTermOSView) => void;
    onFocusApp: (blockId: string) => void;
    onWorkspace: (id: string) => void;
    onCreateWorkspace: () => void;
    onRestore: (blockId: string) => void;
    onPinResource: (resource: OSResourceReference) => void;
    onOverview: () => void;
    onFreeform: () => void;
}) {
    const shellTabId = useAtomValue(atoms.staticTabId);
    const isFullScreen = useAtomValue(atoms.isFullScreen);
    const shellRef = useRef<HTMLDivElement>(null);
    const appearance = useSystemAppearance();
    const [activeSystemCenter, setActiveSystemCenter] = useState<SystemCenterTarget>();
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const hermesSurface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );

    const sidebarOpen = useStore($sidebarOpen);
    const inspectorOpen = useStore($krontermInspectorOpen);
    const hudMode = useSyncExternalStore(
        kronTermHudController.subscribe,
        kronTermHudController.getSnapshot,
        kronTermHudController.getSnapshot
    );
    const toggleHermesChat = useCallback(() => {
        if (hermesSurface.presentation === "hud") {
            hermesSurfaceController.dismiss();
            return;
        }
        hermesSurfaceController.requestOpenHud();
    }, [hermesSurface.presentation]);
    const toggleHudMode = useCallback(() => {
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
    }, []);
    useEffect(() => {
        const handleSystemCenterOpen = (event: Event) => {
            const center = (event as CustomEvent<{ center?: SystemCenterTarget }>).detail?.center;
            if (center !== "activity" && center !== "control") return;
            setViewMenuOpen(false);
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
                data-live-block-occluder=""
                className={cn("os-shell", isMacOS() && !isFullScreen && "has-window-controls")}
            >
                <div className="os-shell-left">
                    <SystemButton
                        type="button"
                        size="small"
                        className="os-shell-icon os-sidebar-toggle"
                        selected={sidebarOpen}
                        aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                        aria-expanded={sidebarOpen}
                        aria-controls="kronterm-left-sidebar"
                        title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
                        onClick={() => {
                            toggleSidebarOpen();
                            if ($sidebarOpen.get() && !$krontermSidebarOwner.get() && !hasComfyPanels) {
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
                <SystemToolbar className="os-shell-right" aria-label="System controls">
                    <SystemButton
                        type="button"
                        size="small"
                        className="os-system-entry"
                        onClick={() => {
                            setActiveSystemCenter(undefined);
                            toggleCommandCenter();
                        }}
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
                            aria-label="Open Hermes Settings"
                            title="Hermes Settings"
                        >
                            <SlidersHorizontal aria-hidden="true" />
                        </SystemButton>
                    </Dialog.Trigger>
                    <SystemButton
                        type="button"
                        size="small"
                        selected={hermesSurface.presentation === "hud"}
                        className="os-shell-icon"
                        onClick={toggleHermesChat}
                        aria-label={hermesSurface.presentation === "hud" ? "Hide KronOS Agent" : "Open KronOS Agent"}
                        aria-pressed={hermesSurface.presentation === "hud"}
                        title="KronOS Agent chat"
                    >
                        <Bot />
                    </SystemButton>
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
                        title="KronOS HUD mode"
                    >
                        <PanelBottom />
                    </SystemButton>
                    <SystemSegmentedControl className="os-view-selector" aria-label="Workspace view">
                        <Menu.Root open={viewMenuOpen} onOpenChange={setViewMenuOpen}>
                            <Menu.Trigger
                                type="button"
                                onDragOver={(event) => {
                                    if (
                                        event.dataTransfer.types.includes(OSAppDragMimeType) ||
                                        event.dataTransfer.types.includes(OSResourceDragMimeType)
                                    ) {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "copy";
                                    }
                                }}
                                onDrop={(event) => {
                                    const resource = readOSResourceDragPayload(event.dataTransfer);
                                    if (resource != null) {
                                        event.preventDefault();
                                        onPinResource(resource);
                                        setViewMenuOpen(false);
                                        return;
                                    }
                                    const payload = readOSAppDragPayload(event.dataTransfer);
                                    if (payload?.blockId == null) return;
                                    event.preventDefault();
                                    onRestore(payload.blockId);
                                    onSetOSView("canvas");
                                    onFocusApp(payload.blockId);
                                    setViewMenuOpen(false);
                                }}
                                aria-expanded={viewMenuOpen}
                                aria-haspopup="menu"
                                aria-label={`KronOS view: ${osView === "file" ? "files" : sceneKind === "freeform" ? "canvas" : "carousel"}`}
                            >
                                {osView === "file" ? <FolderOpen /> : <Grid2X2 />}
                                <span className="os-view-selector-label">
                                    {osView === "file" ? "Files" : sceneKind === "freeform" ? "Canvas" : "Carousel"}
                                </span>
                                <ChevronDown />
                            </Menu.Trigger>
                            <Menu.Portal container={shellRef.current}>
                                <Menu.Positioner sideOffset={8} align="end" style={{ zIndex: 5000 }}>
                                    <Menu.Popup
                                        className="os-view-menu"
                                        style={{
                                            ...systemMaterialVariables(appearance),
                                            position: "relative",
                                            top: "auto",
                                            right: "auto",
                                            background: "var(--kt-popover)",
                                        }}
                                    >
                                        <Menu.RadioGroup
                                            value={
                                                osView === "file"
                                                    ? "files"
                                                    : sceneKind === "freeform"
                                                      ? "canvas"
                                                      : "carousel"
                                            }
                                        >
                                            <Menu.RadioItem
                                                render={<button type="button" />}
                                                nativeButton
                                                value="carousel"
                                                closeOnClick
                                                onDragOver={(event) => {
                                                    if (event.dataTransfer.types.includes(OSAppDragMimeType)) {
                                                        event.preventDefault();
                                                        event.dataTransfer.dropEffect = "move";
                                                    }
                                                }}
                                                onDrop={(event) => {
                                                    const payload = readOSAppDragPayload(event.dataTransfer);
                                                    if (payload?.blockId == null) return;
                                                    event.preventDefault();
                                                    onRestore(payload.blockId);
                                                    onSetOSView("canvas");
                                                    onFocusApp(payload.blockId);
                                                    setViewMenuOpen(false);
                                                }}
                                                onClick={() => {
                                                    onSetOSView("canvas");
                                                    const blockId =
                                                        activeBlockId ??
                                                        blocks.find((block) => !collapsedIds.includes(block.blockId))
                                                            ?.blockId;
                                                    if (blockId) onFocusApp(blockId);
                                                    setViewMenuOpen(false);
                                                }}
                                            >
                                                <Grid2X2 />
                                                <span>Window carousel</span>
                                            </Menu.RadioItem>
                                            <Menu.RadioItem
                                                render={<button type="button" />}
                                                nativeButton
                                                value="canvas"
                                                closeOnClick
                                                onClick={() => {
                                                    onSetOSView("canvas");
                                                    onFreeform();
                                                    setViewMenuOpen(false);
                                                }}
                                            >
                                                <Grid2X2 />
                                                <span>Freeform canvas</span>
                                            </Menu.RadioItem>
                                        </Menu.RadioGroup>
                                    </Menu.Popup>
                                </Menu.Positioner>
                            </Menu.Portal>
                        </Menu.Root>
                    </SystemSegmentedControl>
                    <OSShellStatus />
                    <SystemButton
                        type="button"
                        size="small"
                        className="os-shell-icon os-all-apps-button"
                        selected={sceneKind === "overview"}
                        onClick={() => {
                            if (sceneKind !== "overview") {
                                onOverview();
                                return;
                            }
                            const blockId =
                                activeBlockId ?? blocks.find((block) => !collapsedIds.includes(block.blockId))?.blockId;
                            if (blockId) onFocusApp(blockId);
                        }}
                        aria-label={sceneKind === "overview" ? "Return to carousel" : "Show all apps"}
                        aria-pressed={sceneKind === "overview"}
                    >
                        {sceneKind === "overview" ? <Focus /> : <LayoutGrid />}
                    </SystemButton>
                    <SystemButton
                        type="button"
                        size="small"
                        className="os-shell-icon"
                        aria-label={
                            hasComfyPanels
                                ? inspectorOpen ? "Hide inspector" : "Show inspector"
                                : inspectorOpen ? "Hide files and changes" : "Show files and changes"
                        }
                        aria-expanded={inspectorOpen}
                        aria-controls="kronterm-right-inspector"
                        selected={inspectorOpen}
                        title={hasComfyPanels ? "Workspace inspector" : "Files and changes"}
                        onClick={() => {
                            if (!$krontermInspectorOpen.get() && !hasComfyPanels) $krontermInspectorSection.set("files");
                            $krontermInspectorOpen.set(!$krontermInspectorOpen.get());
                        }}
                    >
                        <SidebarRight />
                    </SystemButton>
                </SystemToolbar>
                {activeSystemCenter === "activity" && (
                    <OSSystemCenterPanel
                        onClose={() => setActiveSystemCenter(undefined)}
                        onPinResource={onPinResource}
                        onFocusBlock={(blockId) => {
                            onSetOSView("canvas");
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
                <OSHermesSettings tabId={shellTabId} onClose={() => setActiveSystemCenter(undefined)} />
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
    const attachSidebar = useCallback((target: HTMLDivElement) => $krontermSidebarTarget.set(target), []);
    const hudMode = useSyncExternalStore(
        kronTermHudController.subscribe,
        kronTermHudController.getSnapshot,
        kronTermHudController.getSnapshot
    );
    const allBlockIds = tabData.blockids ?? [];
    const blockIds = hudMode.active
        ? allBlockIds.filter((blockId) => !kronTermHudController.isIsland(blockId))
        : allBlockIds;
    const blockIdsKey = blockIds.join(":");
    const [state, setState] = useState<OSModeState>(() =>
        makeInitialOSModeState(tabData, blockIds, resolvedViewsByBlockId(blockIds.map(readBlockDescriptor)))
    );
    const stateRef = useRef(state);
    const rootRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const [workflowPanelLayout, setWorkflowPanelLayout] = useState({ top: 0, right: 0, bottom: 0 });
    const [selectorOwnsToolbar, setSelectorOwnsToolbar] = useState(() =>
        document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner")
    );
    const [selectorToolsSlot, setSelectorToolsSlot] = useState<HTMLElement>(() => getCanvasToolbarSlot());
    const [selectorExpanded, setSelectorExpanded] = useState(() =>
        document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded")
    );
    const [fallbackToolsOpen, setFallbackToolsOpen] = useState(false);
    const [workflowFocusTarget, setWorkflowFocusTarget] = useState<HTMLDivElement>(null);
    const [workflowFocusVisible, setWorkflowFocusVisible] = useState(false);
    const [workflowConfigOpen, setWorkflowConfigOpen] = useState(false);
    const onWorkflowFocusVisibility = useCallback((visible: boolean, editing: boolean) => {
        setWorkflowFocusVisible(visible);
        setWorkflowConfigOpen(editing);
    }, []);
    const canvasToolsOpen = selectorOwnsToolbar ? selectorExpanded : fallbackToolsOpen;
    const closeCanvasTools = () => {
        setFallbackToolsOpen(false);
        window.dispatchEvent(new CustomEvent("kronterm:canvas-toolbar-close"));
    };
    const [workflowToolsTarget, setWorkflowToolsTarget] = useState<HTMLDivElement>(null);
    const [workflowWorldTarget, setWorkflowWorldTarget] = useState<HTMLDivElement>(null);
    const [comfyWorldTarget, setComfyWorldTarget] = useState<HTMLDivElement>(null);
    const [comfyWorkflowOpen, setComfyWorkflowOpen] = useAtom(comfyWorkflowOpenAtom);
    const comfyWorkflowVisible = comfyWorkflowOpen && state.view === "canvas" && state.scene.kind === "freeform";
    const [comfyReady, setComfyReady] = useState(false);
    const comfyLibrarySlot = useStore($comfyLibraryTarget);
    const comfyPropertiesTarget = useStore($comfyPropertiesTarget);
    const sidebarMode = useStore($workflowSidebarMode);
    const penDesignTarget = useStore($penDesignTarget);
    const designSelected = sidebarMode === "design";
    const [designMode, setDesignMode] = useState<"editor" | "canvas">("editor");
    const [designEditorMounted, setDesignEditorMounted] = useState(false);
    const designVisible = designSelected && designMode === "canvas" && state.view === "canvas" && state.scene.kind === "freeform";
    const designEditorVisible = designSelected && designMode === "editor" && state.view === "canvas" && state.scene.kind === "freeform";
    useEffect(() => {
        if (designEditorVisible) {
            setDesignEditorMounted(true);
            window.dispatchEvent(new CustomEvent("kronterm:canvas-toolbar-close"));
        }
    }, [designEditorVisible]);
    const [designTool, setDesignTool] = useState<PenDrawingTool>();
    const designPath = useRef<{ pointerId: number; points: Array<{ x: number; y: number }> }>(undefined);
    const [designPathPreview, setDesignPathPreview] = useState("");
    const [designInspector, setDesignInspector] = useState<"properties" | "chat">("properties");
    const selectedDesignLayer = designVisible
        ? state.objects.find((object) => object.id === state.selectedEntityId && object.pen)
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
    const reserveMinimizedApps = desktopWidgetsEnabled && Object.values(state.windows).some((window) => window.collapsed);
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
    const [dockPreview, setDockPreview] = useState<DockPreview | undefined>(undefined);
    const [paneTakeover, setPaneTakeover] = useState<ReturnType<typeof getOSPaneTakeover>>();
    const [resizingPane, setResizingPane] = useState(false);
    const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | undefined>(
        undefined
    );
    const interactionRef = useRef<
        | {
              kind: "move" | "resize" | "add";
              edge: OSResizeEdge;
              blockId: string;
              pointerId: number;
              clientX: number;
              clientY: number;
              bounds: DragBounds;
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
    const systemSpaceId = useAtomValue(systemModel.activeSpaceIdAtom);
    const spaceProfile = useAtomValue(systemModel.profileAtom);
    const designCwd = useStore($currentCwd);
    const designCwdOwner = useStore($workspaceCwdOwner);
    const designSessionId = useStore($selectedStoredSessionId);
    const designChangeTick = useStore($workspaceChangeTick);
    const [designLoadStatus, setDesignLoadStatus] = useState("");
    const designRoots = useMemo(
        () => penProjectRoots(
            spaceProfile.roots,
            designCwdOwner === designSessionId ? designCwd : "",
            getApi().getHomeDir()
        ),
        [spaceProfile.roots, designCwd, designCwdOwner, designSessionId]
    );
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
        (nextState: OSModeState) => {
            if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
            persistTimerRef.current = window.setTimeout(() => {
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
            }, OSSaveDelayMs);
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
        (updater: (current: OSModeState) => OSModeState) => {
            const next = updater(stateRef.current);
            stateRef.current = next;
            setState(next);
            persist(next);
        },
        [persist]
    );

    useEffect(() => {
        if (!designSelected) {
            setDesignTool(undefined);
            setDesignInspector("properties");
            return;
        }
        setTool("select");
        setAndPersist(activateOSWorkflowCanvas);
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
            setAndPersist((current) => reduceOSModeState(current, action));
        },
        [setAndPersist]
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

    const droppedCanvasFiles = useRef(new Map<string, File>());
    useEffect(() => {
        const objectIds = new Set(state.objects.map((object) => object.id));
        for (const id of droppedCanvasFiles.current.keys()) {
            if (!objectIds.has(id)) droppedCanvasFiles.current.delete(id);
        }
    }, [state.objects]);

    const pinResource = useCallback(
        (resource: OSResourceReference, position?: { x?: number; y?: number }) => {
            const camera = stateRef.current.camera;
            const isFile = resource.kind === "file" || resource.kind === "generated-artifact";
            const { width, height } = isFile ? canvasFileCardSize(resource.resource) : { width: 260, height: 112 };
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
            };
            setAndPersist((current) => ({
                ...current,
                view: "canvas",
                scene: { kind: "freeform" },
                objects: [...current.objects, isFile ? placeOSCanvasObject(current, object) : object],
                selectedEntityId: object.id,
            }));
            return object.id;
        },
        [setAndPersist, viewport]
    );

    const addPenDocument = useCallback(({ path, layers }: PenProjectDocument) => {
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
                objects: [...current.objects, ...layers.map((layer) => ({ ...layer, x: layer.x + x, y: layer.y + y }))],
                selectedEntityId: current.selectedEntityId ?? layers[0].id,
                camera: existing ? current.camera : fitSpatialViewportToBounds(
                    bounds,
                    viewportRef.current?.getBoundingClientRect() ?? { width: 1440, height: 900 },
                    96,
                    1
                ),
            };
        });
    }, [setAndPersist]);

    useEffect(() => {
        if (!designVisible) {
            setDesignLoadStatus("");
            return;
        }
        if (systemSpaceId !== currentWorkspace?.oid || systemLoadState === "restoring") return;
        if (!designRoots.length) {
            setDesignLoadStatus("");
            return;
        }
        const controller = new AbortController();
        const { signal } = controller;
        let scanning = false;
        const scan = async () => {
            if (scanning) return;
            scanning = true;
            if (!stateRef.current.objects.some((object) => object.pen)) setDesignLoadStatus("Finding project designs…");
            try {
                const { found, failed, skipped, limited } = await loadPenProject(
                    designRoots, stateRef.current.loadedPenPaths ?? [], signal, addPenDocument
                );
                if (signal.aborted) return;
                if (failed) setDesignLoadStatus("Some project designs could not be loaded.");
                else if (limited) setDesignLoadStatus("Search reached its project scan limit.");
                else if (skipped) setDesignLoadStatus("Some layer types are unsupported.");
                else if (!found && !stateRef.current.objects.some((object) => object.pen))
                    setDesignLoadStatus("");
                else setDesignLoadStatus("");
            } catch {
                if (!signal.aborted) setDesignLoadStatus("Project designs could not be loaded.");
            } finally {
                scanning = false;
            }
        };
        void scan();
        window.addEventListener("focus", scan);
        return () => {
            controller.abort();
            window.removeEventListener("focus", scan);
        };
    }, [addPenDocument, currentWorkspace?.oid, designChangeTick, designRoots, designVisible, systemLoadState, systemSpaceId]);

    const createPenLayer = useCallback((
        type: PenDrawingTool,
        patch: Partial<OSCanvasObject> = {},
        fill?: string,
        geometry?: string
    ) => {
        const id = crypto.randomUUID();
        const { camera } = stateRef.current;
        const width = patch.width ?? (type === "frame" ? 480 : 160);
        const height = patch.height ?? (type === "frame" ? 320 : type === "text" ? 32 : 96);
        const layer: OSCanvasObject = {
            id, kind: "pen-layer", name: type[0].toUpperCase() + type.slice(1),
            width, height,
            x: (viewport.width / 2 - camera.x) / camera.zoom - width / 2,
            y: (viewport.height / 2 - camera.y) / camera.zoom - height / 2,
            text: type === "text" || type === "note" ? "Text" : undefined,
            ...patch,
            pen: {
                documentId: id,
                type,
                fill: fill ?? (type === "note" ? "#fee484" : type === "path" ? undefined : type === "text" ? "#ffffff" : "#6466ed"),
                geometry: type === "path" ? geometry ?? "M0 24 L12 0 L24 24" : undefined,
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
    }, [setAndPersist, viewport]);

    const openResource = useCallback(
        (resource: OSResourceReference | OSCanvasObject) => {
            if (!resource.resource) return;
            if (resource.kind === "url") {
                getApi().openExternal(resource.resource);
                return;
            }
            if (resource.kind === "file") {
                const path = resource.resource;
                const media = classifyMedia({ path, mimetype: undefined, isdir: false });
                if (!["image", "video", "audio"].includes(media) && !getModelPreviewFormat(path) && !/\.pdf$/i.test(path)) {
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
                    objects: current.objects.filter((object) => ![object.id, object.fromObjectId, object.toObjectId]
                        .some((id) => removed.has(id))),
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
        setAndPersist((current) => ({ ...current, camera: fitSpatialViewportToBounds(bounds, viewport, 120, 1) }));
    }, [setAndPersist, viewport]);

    useEffect(() => {
        const slot = () => setSelectorToolsSlot(getCanvasToolbarSlot());
        window.addEventListener("kronterm:canvas-toolbar-slot", slot);
        slot();
        const ownership = () => {
            setSelectorOwnsToolbar(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-owner"));
            setSelectorExpanded(document.documentElement.hasAttribute("data-kronterm-canvas-toolbar-expanded"));
        };
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
        window.addEventListener("kronterm:canvas-toolbar-owner", ownership);
        window.addEventListener("kronterm:canvas-toolbar-action", action);
        ownership();
        return () => {
            window.removeEventListener("kronterm:canvas-toolbar-slot", slot);
            window.removeEventListener("kronterm:canvas-toolbar-owner", ownership);
            window.removeEventListener("kronterm:canvas-toolbar-action", action);
        };
    }, [addObject, fitAll, tabId, workflowToolsTarget]);

    const focusBlock = useCallback(
        (blockId: string) => {
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
            if (!reveal(detail.blockId) && detail.tabId) pendingSessionFocus.current = { tabId, blockId: detail.blockId };
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
            const cameraScale = current.camera.zoom || 1;
            const currentScreen = {
                x: window.bounds.x * cameraScale + current.camera.x,
                y: window.bounds.y * cameraScale + current.camera.y,
                width: window.bounds.width * cameraScale,
                height: window.bounds.height * cameraScale,
            };
            const screen = computeOSPlacementBounds(placement, osWorkArea(), currentScreen);
            dispatch({ type: "os.view.set", view: "canvas" });
            dispatch({ type: "os.window.setBounds", blockId, bounds: screenRectToWorld(screen, current.camera) });
            return true;
        },
        [dispatch, osWorkArea]
    );

    const arrangeWindows = useCallback(
        (arrangement: OSWindowArrangement) => {
            const current = stateRef.current;
            const visible = current.zOrder.filter((id) => current.windows[id] && !current.windows[id].collapsed);
            if (visible.length === 0) return 0;
            const rects = computeOSArrangement(arrangement, visible.length, osWorkArea());
            dispatch({ type: "os.view.set", view: "canvas" });
            dispatch({
                type: "os.window.arrangeBounds",
                bounds: Object.fromEntries(
                    visible.map((id, index) => [id, screenRectToWorld(rects[index], current.camera)])
                ),
            });
            return visible.length;
        },
        [dispatch, osWorkArea]
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

    const showDesktopContextMenu = useCallback(
        (event: React.MouseEvent) => {
            const current = stateRef.current;
            const openCount = current.zOrder.filter((id) => !current.windows[id]?.collapsed).length;
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
                    { label: "Search…", click: () => toggleCommandCenter() },
                ],
                event
            );
        },
        [arrangeWindows, desktopWidgetsEnabled, dispatch, handleCreateBlock, toggleDesktopWidgets]
    );

    const showWindowContextMenu = useCallback(
        (event: React.MouseEvent, blockId: string, sizeAction?: ContextMenuItem) => {
            ContextMenuModel.getInstance().showContextMenu(
                [
                    {
                        label: "Group as Tabs With",
                        submenu: descriptors
                            .filter((item) => item.blockId !== blockId)
                            .map((item) => ({
                                label: item.title,
                                click: () => dispatch({ type: "os.tabs.group", blockId, targetBlockId: item.blockId }),
                            })),
                    },
                    {
                        label: "Detach Tab",
                        enabled: !!getOSTabGroup(stateRef.current, blockId),
                        click: () => dispatch({ type: "os.tabs.detach", blockId }),
                    },
                    {
                        label: "Move & Resize",
                        submenu: [
                            { label: "Left Half", sublabel: "⌃⌥←", click: () => placeWindow(blockId, "left") },
                            { label: "Right Half", sublabel: "⌃⌥→", click: () => placeWindow(blockId, "right") },
                            { label: "Top Half", click: () => placeWindow(blockId, "top") },
                            { label: "Bottom Half", click: () => placeWindow(blockId, "bottom") },
                            { type: "separator" },
                            { label: "Fill", sublabel: "⌃⌥↑", click: () => placeWindow(blockId, "fill") },
                            { label: "Center", sublabel: "⌃⌥C", click: () => placeWindow(blockId, "center") },
                        ],
                    },
                    { label: "Tile All Windows", click: () => arrangeWindows("tile") },
                    { type: "separator" },
                    ...(sizeAction ? [sizeAction] : []),
                    { label: "Minimize", click: () => dispatch({ type: "spatial.collapse", blockId }) },
                    { label: "Close Window", click: () => handleClose(blockId) },
                ],
                event
            );
        },
        [arrangeWindows, descriptors, dispatch, handleClose, placeWindow]
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
                const computed = computeOSWindowLayout(layoutState, block.blockId, block.view, viewport, compactDeviceBlocks);
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

    const beginWindowInteraction = useCallback(
        (
            event: ReactPointerEvent,
            blockId: string,
            layout: OSWindowLayout,
            kind: "move" | "resize" | "add",
            edge: OSResizeEdge = "se"
        ) => {
            if (
                event.button !== 0 ||
                (kind !== "add" &&
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
            if (kind === "resize") focusBlock(blockId);
            const scale = stateRef.current.scene.kind === "freeform" ? stateRef.current.camera.zoom : 1;
            interactionRef.current = {
                kind,
                edge,
                blockId,
                pointerId: event.pointerId,
                clientX: event.clientX,
                clientY: event.clientY,
                bounds: layout.bounds,
                scale,
            };
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        },
        [focusBlock, tool, selectCanvasObject]
    );

    const handleRootPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const interaction = interactionRef.current;
            if (interaction?.pointerId === event.pointerId) {
                const dx = (event.clientX - interaction.clientX) / interaction.scale;
                const dy = (event.clientY - interaction.clientY) / interaction.scale;
                if (!interaction.latestBounds && Math.hypot(dx, dy) < 4) return;
                const bounds =
                    interaction.kind !== "resize"
                        ? { ...interaction.bounds, x: interaction.bounds.x + dx, y: interaction.bounds.y + dy }
                        : resizeBoundsFromEdge(interaction.bounds, interaction.edge, dx, dy);
                interaction.latestBounds = bounds;
                setDragBounds((current) => ({ ...current, [interaction.blockId]: bounds }));
                if (interaction.kind !== "resize") {
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
                    const hit = interaction.takeover ? undefined : findOSDockHitTarget(interaction.blockId, pointer, layouts);
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
                const finalBounds = event.type === "pointercancel" ? undefined : interaction.latestBounds;
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
                } else if (finalBounds && interaction.kind === "move") {
                    setAndPersist((current) => {
                        const detached = reduceOSModeState(current, { type: "spatial.detach", blockId: interaction.blockId });
                        const keepSplit = detached !== current && detached.scene.kind === "grouped";
                        const next = keepSplit
                            ? detached
                            : {
                                  ...selectOSSceneEntity(detached, interaction.blockId),
                                  scene: { kind: "freeform" } as const,
                                  zOrder: [...detached.zOrder.filter((id) => id !== interaction.blockId), interaction.blockId],
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
                } else if (!finalBounds && event.type !== "pointercancel") {
                    if (interaction.kind === "add") {
                        const current = stateRef.current;
                        const targetBlockId =
                            current.scene.kind === "grouped" ? current.groups[current.scene.groupId]?.blockIds.at(-1) : undefined;
                        if (targetBlockId) {
                            dispatch({ type: "spatial.dock", blockId: interaction.blockId, targetBlockId, side: "right" });
                        }
                    } else if (interaction.kind === "move") {
                        focusBlock(interaction.blockId);
                    }
                }
                interactionRef.current = undefined;
                setDockPreview(undefined);
                setPaneTakeover(undefined);
                setDragBounds((current) => {
                    const next = { ...current };
                    delete next[interaction.blockId];
                    return next;
                });
            }
            if (panRef.current?.pointerId === event.pointerId) {
                panRef.current = undefined;
                persist(stateRef.current);
            }
        },
        [dispatch, focusBlock, persist, setAndPersist]
    );

    const handleWheel = useCallback(
        (event: ReactWheelEvent<HTMLDivElement>) => {
            if (event.defaultPrevented || workflowOwnsWheel(event.nativeEvent.composedPath())) return;
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
            if (stateRef.current.scene.kind !== "freeform") return;
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
        () => ({ capturePointer: tool === "hand", onPointerDownCapture: captureCanvasPan, onWheel: handleWheel }),
        [captureCanvasPan, handleWheel, tool]
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
                if (
                    current.scene.kind === "freeform" &&
                    current.objects.some(
                        (object) => object.id === current.selectedEntityId && object.kind !== "workflow-node"
                    )
                ) {
                    event.preventDefault();
                    deleteObject(current.selectedEntityId);
                    return;
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
    }, [dispatch, connectorStartId, deleteObject]);

    useEffect(
        () =>
            registerWorkspaceSurfaceModeProvider(tabId, {
                snapshot: () => ({
                    presentation: "os",
                    osview: stateRef.current.view,
                    selectedblockid: stateRef.current.windows[stateRef.current.selectedEntityId ?? ""]
                        ? stateRef.current.selectedEntityId
                        : undefined,
                    selectedobjectid: stateRef.current.objects.some(
                        (object) => object.id === stateRef.current.selectedEntityId
                    )
                        ? stateRef.current.selectedEntityId
                        : undefined,
                    camera: getOSSurfaceCamera(stateRef.current),
                    rects: Object.fromEntries(
                        descriptors.map((block) => [
                            block.blockId,
                            computeOSWindowLayout(
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
                            computeOSWindowLayout(
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
                    const validationError = validateOSSurfaceControl(stateRef.current, rawInput);
                    if (validationError) return { success: false, message: validationError };
                    const input = resolveOSControlAction(rawInput);
                    if (input.action === "os.design.editor") {
                        try {
                            const { method, params = {} } = JSON.parse(input.text ?? "{}");
                            $workflowSidebarMode.set("design");
                            setDesignMode("editor");
                            setAndPersist(activateOSWorkflowCanvas);
                            const result = await requestPenEditor(tabId, method as PenEditorMethod, params);
                            return { success: true, message: JSON.stringify(result) ?? "null" };
                        } catch (error) {
                            return { success: false, message: error instanceof Error ? error.message : "Design operation failed." };
                        }
                    }
                    if (input.action === "os.design.create" || input.action === "os.design.update") {
                        const creating = input.action === "os.design.create";
                        try {
                            const { type, patch, fill, geometry } = readPenLayerPatch(input.text ?? "", creating);
                            if (creating) {
                                const id = createPenLayer(type, patch, fill, geometry);
                                return { success: true, message: `Created design layer ${id}.` };
                            }
                            const layer = stateRef.current.objects.find((object) => object.id === input.objectid && object.pen);
                            if (!layer) return { success: false, message: "Design layer not found in this OS workspace." };
                            if (geometry != null && layer.pen.type !== "path")
                                return { success: false, message: "Only path layers accept SVG path data." };
                            return updateObject(layer.id, {
                                ...patch,
                                pen: { ...layer.pen, fill: fill ?? layer.pen.fill, geometry: geometry ?? layer.pen.geometry },
                            });
                        } catch (error) {
                            return { success: false, message: error instanceof Error ? error.message : "Invalid design properties." };
                        }
                    }
                    if (input.action === "add_file") {
                        if (!input.file || !isLocalCanvasFilePath(input.file)) {
                            return { success: false, message: "An absolute local file path is required." };
                        }
                        if ([input.x, input.y].some((coordinate) => coordinate != null && !Number.isFinite(coordinate))) {
                            return { success: false, message: "File card coordinates must be finite." };
                        }
                        const id = pinResource(canvasFileResource(input.file, input.text), { x: input.x, y: input.y });
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
                        if (input.presentation !== "canvas" && input.presentation !== "file") {
                            return { success: false, message: "Presentation must be canvas or file." };
                        }
                        dispatch({ type: "os.view.set", view: input.presentation });
                        return { success: true, message: `KronOS switched to ${input.presentation}.` };
                    }
                    if (input.action === "spatial.openFile") {
                        if (!input.file) return { success: false, message: "File path is required." };
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
                        fitAll();
                        return { success: true, message: "OS content fitted." };
                    }
                    if (input.action === "add_note") {
                        addObject("note", input.text, input);
                        return { success: true, message: "Created OS note." };
                    }
                    if (input.action === "navigate") {
                        const target = getOSNavigationTarget(stateRef.current, input.direction);
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
            pinResource,
            placeWindow,
            handleCreateAppStream,
            handleCreateBlock,
            tabId,
            updateObject,
            viewport,
        ]
    );

    const activeGroup = state.scene.kind === "grouped" ? state.groups[state.scene.groupId] : undefined;
    const groupAdditions = activeGroup ? getOSGroupAdditions(state, activeGroup) : [];
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
                    sidebarOpen && "has-agent-sidebar",
                    ((inspectorOpen && !designEditorVisible) || designVisible) && "has-files-inspector",
                    designVisible && "has-design-tools",
                    designEditorVisible && "has-design-editor",
                    inspectorExpanded && "has-expanded-inspector",
                    inspectorCompact && "has-compact-inspector",
                    comfyPanels.logs && "has-comfy-logs",
                    reducedMotion && "reduced-motion"
                )}
                style={
                    {
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
                onWheel={handleWheel}
            >
                <WorkspaceWallpaper />
                <aside
                    id="kronterm-left-sidebar"
                    data-live-block-occluder=""
                    className="os-agent-sidebar"
                    aria-label="Workspace sidebar"
                    hidden={!sidebarOpen}
                >
                    <div ref={attachSidebar} className="h-full min-h-0" />
                </aside>
                <aside
                    id="kronterm-right-inspector"
                    data-live-block-occluder=""
                    className="os-files-inspector"
                    aria-label="Workspace inspector"
                    hidden={designEditorVisible || (!inspectorOpen && !designVisible)}
                >
                    <div className="flex h-full min-h-0 flex-col">
                        {designVisible && (
                            <SystemToolbar aria-label="Design inspector" className="shrink-0 border-b border-border p-1">
                                <SystemButton size="small" selected={designInspector === "properties"} onClick={() => setDesignInspector("properties")}>Properties</SystemButton>
                                <SystemButton size="small" selected={designInspector === "chat"} onClick={() => {
                                    $krontermInspectorSection.set("chat");
                                    $krontermInspectorOpen.set(true);
                                    setDesignInspector("chat");
                                    window.dispatchEvent(new Event(KrontermInspectorChatEvent));
                                }}>Chat</SystemButton>
                            </SystemToolbar>
                        )}
                        <div ref={attachInspector} className="min-h-0 flex-1" hidden={designVisible && designInspector !== "chat"} />
                        {designVisible && designInspector === "properties" && (
                        <section aria-label="Design properties" className="os-pen-properties min-h-0 flex-1 overflow-auto" onWheel={(event) => event.stopPropagation()}>
                            <OSPenProperties
                                key={selectedDesignLayer?.id ?? "empty"}
                                layer={selectedDesignLayer}
                                onChange={(patch) => updateObject(selectedDesignLayer.id, patch)}
                            />
                        </section>
                        )}
                    </div>
                </aside>
                {penDesignTarget &&
                    createPortal(
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="flex shrink-0 gap-1 border-b border-border p-2" role="group" aria-label="Design workspace">
                                <SystemButton size="small" selected={designMode === "editor"} onClick={() => setDesignMode("editor")}>Editor</SystemButton>
                                <SystemButton size="small" selected={designMode === "canvas"} onClick={() => setDesignMode("canvas")}>Canvas layers</SystemButton>
                            </div>
                            {designMode === "editor" ? (
                                <div className="flex flex-col gap-4 p-4 text-[13px]">
                                    <div><h2 className="font-medium">Your design workspace</h2><p className="mt-2 text-foreground/65">Draw, arrange, and edit with Pen’s tools. Your document opens automatically and stays here when you switch sections.</p></div>
                                    <div className="rounded-lg border border-border p-3"><h3 className="font-medium">Connected to KronOS Agent</h3><p className="mt-2 text-foreground/65">The agent can read the editor’s skills, inspect the document, and edit the same design.</p></div>
                                    <p className="text-[12px] text-foreground/55">Existing OS canvas designs are under Canvas layers.</p>
                                </div>
                            ) : (
                                <OSPenPanel
                            objects={state.objects}
                            selectedId={state.selectedEntityId}
                            status={designLoadStatus}
                            onChange={updateObject}
                            onDelete={deleteObject}
                            onDuplicate={(id) => {
                                setAndPersist((current) => {
                                    const layer = current.objects.find((object) => object.id === id);
                                    if (!layer?.pen) return current;
                                    const copy = { ...layer, id: crypto.randomUUID(), name: `${layer.name} copy`, x: layer.x + 24, y: layer.y + 24, pen: { ...layer.pen } };
                                    return { ...current, objects: [...current.objects, copy], selectedEntityId: copy.id };
                                });
                            }}
                            onFit={(id) => {
                                const layer = stateRef.current.objects.find((object) => object.id === id);
                                if (layer) setAndPersist((current) => ({ ...current, camera: fitSpatialViewportToBounds(layer, viewport, 80, 1) }));
                            }}
                            onSelect={(id) => {
                                setTool("select");
                                setAndPersist((current) => {
                                    const next = selectOSSceneEntity(activateOSWorkflowCanvas(current), id);
                                    const layer = next.objects.find((object) => object.id === id);
                                    return layer ? { ...next, camera: keepWorkflowNodeVisible(next.camera, layer, viewport) } : next;
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
                                        <option key={id} value={id}>{label}</option>
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
                                <SystemButton size="small" onClick={() => {
                                    setAndPersist(activateOSWorkflowCanvas);
                                    $workflowPickerSource.set("comfy-nodes");
                                }}>
                                    Nodes
                                </SystemButton>
                                <SystemButton size="small" onClick={() => {
                                    setAndPersist(activateOSWorkflowCanvas);
                                    $workflowPickerSource.set("comfy-models");
                                }}>
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
                        <SystemButton size="small" onClick={() => setShowComfyLogs(false)}>Close logs</SystemButton>
                    </header>
                    <div ref={setComfyLogsTarget} className="min-h-0 flex-1 overflow-hidden" />
                </section>
                {OSSpaceIdentities.find((identity) => identity.id === currentWorkspace?.meta?.["os:identity"]) && (
                    <div
                        className="os-space-background"
                        style={{
                            background: OSSpaceIdentities.find(
                                (identity) => identity.id === currentWorkspace?.meta?.["os:identity"]
                            ).background,
                        }}
                        aria-hidden="true"
                    />
                )}
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
                <img className="os-wallpaper-fallback" src={KronTermOSWallpaper} alt="" aria-hidden="true" />
                {systemLoadState === "restoring" && (
                    <div className="os-restore-status" role="status">
                        <span className="os-restore-status-spinner" aria-hidden="true" />
                        Restoring space
                    </div>
                )}
                <OSModeShell
                    hasComfyPanels={hasComfyPanels}
                    workspaces={workspaces}
                    currentWorkspaceId={currentWorkspace?.oid ?? ""}
                    blocks={descriptors}
                    collapsedIds={blockIds.filter((id) => state.windows[id]?.collapsed)}
                    showCollapsedDock={!desktopWidgetsEnabled || viewport.width <= 900}
                    sceneKind={state.scene.kind}
                    onWorkspace={(workspaceId) => getApi().switchWorkspace(workspaceId)}
                    onCreateWorkspace={() => setWorkspaceSetupOpen(true)}
                    onRestore={(blockId) => dispatch({ type: "spatial.restore", blockId })}
                    onPinResource={pinResource}
                    onOverview={() => dispatch({ type: "spatial.showOverview" })}
                    onFreeform={() => dispatch({ type: "spatial.freeform" })}
                    activeBlockId={activeBlockId}
                    osView={state.view}
                    onSetOSView={(view) => dispatch({ type: "os.view.set", view })}
                    onFocusApp={(blockId) => {
                        dispatch({ type: "os.view.set", view: "canvas" });
                        dispatch({ type: "spatial.focus", blockId });
                    }}
                />
                {state.scene.kind === "overview" && (
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
                {showCarouselControls && (
                    <nav className="os-carousel-controls" aria-label="Window carousel">
                        <button
                            type="button"
                            aria-label="Previous window"
                            disabled={!getOSCarouselNeighbor(state, -1)}
                            onClick={() =>
                                dispatch({ type: "os.window.focus", blockId: getOSCarouselNeighbor(state, -1) })
                            }
                        >
                            <ChevronLeft aria-hidden="true" />
                        </button>
                        <div className="os-carousel-dots" aria-label="Open windows">
                            {carouselOrder.map((blockId) => (
                                <button
                                    key={blockId}
                                    type="button"
                                    aria-label={descriptors.find((block) => block.blockId === blockId)?.title ?? "App"}
                                    aria-current={blockId === activeBlockId ? "true" : undefined}
                                    onClick={() => dispatch({ type: "os.window.focus", blockId })}
                                >
                                    <span aria-hidden="true" />
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            aria-label="Next window"
                            disabled={!getOSCarouselNeighbor(state, 1)}
                            onClick={() =>
                                dispatch({ type: "os.window.focus", blockId: getOSCarouselNeighbor(state, 1) })
                            }
                        >
                            <ChevronRight aria-hidden="true" />
                        </button>
                    </nav>
                )}
                {state.view === "canvas" && groupAdditions.length > 0 && (
                    <nav className="os-group-tray" aria-label="Add widgets to split">
                        <span>Add to split</span>
                        {groupAdditions.map((blockId) => {
                            const descriptor = descriptors.find((item) => item.blockId === blockId);
                            const layout = windowLayouts[blockId];
                            if (!descriptor || !layout) return null;
                            return (
                                <SystemButton
                                    key={blockId}
                                    size="small"
                                    aria-label={`Add ${descriptor.title} to split`}
                                    title={`Click to add ${descriptor.title}, or drag it onto a pane`}
                                    onPointerDown={(event) => {
                                        const viewportBounds = viewportRef.current?.getBoundingClientRect();
                                        if (!viewportBounds) return;
                                        beginWindowInteraction(
                                            event,
                                            blockId,
                                            {
                                                ...layout,
                                                bounds: {
                                                    x: event.clientX - viewportBounds.left - 100,
                                                    y: event.clientY - viewportBounds.top - 24,
                                                    width: Math.min(480, viewport.width - 32),
                                                    height: Math.min(360, viewport.height - 96),
                                                },
                                            },
                                            "add"
                                        );
                                    }}
                                    onClick={(event) => {
                                        if (event.detail !== 0) return;
                                        dispatch({
                                            type: "spatial.dock",
                                            blockId,
                                            targetBlockId: activeGroup.blockIds.at(-1),
                                            side: "right",
                                        });
                                    }}
                                >
                                    <AppIcon icon={descriptor.icon} />
                                    {descriptor.title}
                                </SystemButton>
                            );
                        })}
                    </nav>
                )}
                {state.view === "file" && (
                    <OSWidgetsFileView
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
                )}
                {designEditorMounted && (
                    <OSPenEditor key={tabId} tabId={tabId} visible={designEditorVisible} onClose={() => setDesignMode("canvas")} />
                )}
                <div className="os-workflow-panels">
                    <OSOriginalWorkflow
                        onPanelLayout={setWorkflowPanelLayout}
                        tabId={tabId}
                        onChat={() => hermesSurfaceController.requestOpenChat()}
                        workspaceId={currentWorkspace?.oid}
                        camera={state.camera}
                        toolsTarget={workflowToolsTarget}
                        focusTarget={workflowFocusTarget}
                        onFocusVisibility={onWorkflowFocusVisibility}
                        worldTarget={workflowWorldTarget}
                        viewportTarget={viewportRef.current}
                        objectOrder={sceneZIndices}
                        selectedObjectId={state.selectedEntityId}
                        visible={!designEditorVisible && state.view === "canvas" && state.scene.kind === "freeform"}
                        onCameraIntent={(intent) =>
                            setAndPersist((current) => ({
                                ...current,
                                camera: resolveWorkflowCameraIntent(intent, current.camera, viewport),
                            }))
                        }
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
                    onDragOver={(event) => {
                        if (
                            !event.defaultPrevented &&
                            (event.dataTransfer.types.includes(OSAppDragMimeType) ||
                                event.dataTransfer.types.includes(OSResourceDragMimeType) ||
                                event.dataTransfer.types.includes("Files"))
                        ) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "copy";
                        }
                    }}
                    onDrop={(event) => {
                        if (event.defaultPrevented) return;
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const camera = stateRef.current.camera;
                        const point = screenRectToWorld(
                            {
                                x: event.clientX - bounds.left,
                                y: event.clientY - bounds.top,
                                width: 0,
                                height: 0,
                            },
                            camera
                        );
                        const pinAtDrop = (resource: OSResourceReference, file?: File) => {
                            const { width, height } =
                                resource.kind === "file" || resource.kind === "generated-artifact"
                                    ? canvasFileCardSize(resource.resource)
                                    : { width: 260, height: 112 };
                            const id = pinResource(resource, { x: point.x - width / 2, y: point.y - height / 2 });
                            if (file) droppedCanvasFiles.current.set(id, file);
                        };
                        const resource = readOSResourceDragPayload(event.dataTransfer);
                        if (resource != null) {
                            event.preventDefault();
                            pinAtDrop(resource);
                            return;
                        }
                        if (event.dataTransfer.files.length) {
                            event.preventDefault();
                            for (const { resource, file } of readNativeCanvasDrops(event.dataTransfer.files, getApi().getPathForFile)) {
                                pinAtDrop(resource, file);
                            }
                            return;
                        }
                        const payload = readOSAppDragPayload(event.dataTransfer);
                        if (payload == null) return;
                        event.preventDefault();
                        const worldX = Math.max(16, point.x - 260);
                        const worldY = Math.max(96, point.y - 30);
                        handleDropApp(payload, worldX, worldY);
                    }}
                    onPointerMove={(event) => {
                        const path = designPath.current;
                        if (path?.pointerId !== event.pointerId || path.points.length >= 450) return;
                        const bounds = event.currentTarget.getBoundingClientRect();
                        const point = { x: Math.round(event.clientX - bounds.left), y: Math.round(event.clientY - bounds.top) };
                        const previous = path.points.at(-1);
                        if (Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;
                        path.points.push(point);
                        setDesignPathPreview(path.points.map(({ x, y }) => `${x},${y}`).join(" "));
                    }}
                    onPointerUp={(event) => {
                        const path = designPath.current;
                        if (path?.pointerId !== event.pointerId) return;
                        designPath.current = undefined;
                        setDesignPathPreview("");
                        if (path.points.length < 2) return;
                        const bounds = spatialBoundsForRects(path.points.map((point) => ({ ...point, width: 1, height: 1 })));
                        const { zoom, x, y } = state.camera;
                        const geometry = path.points.map((point, index) =>
                            `${index ? "L" : "M"}${((point.x - bounds.x) / zoom).toFixed(2)} ${((point.y - bounds.y) / zoom).toFixed(2)}`
                        ).join(" ");
                        createPenLayer("path", {
                            x: (bounds.x - x) / zoom, y: (bounds.y - y) / zoom,
                            width: Math.max(1, bounds.width / zoom), height: Math.max(1, bounds.height / zoom),
                        }, undefined, geometry);
                        setDesignTool(undefined);
                    }}
                    onLostPointerCapture={(event) => {
                        if (designPath.current?.pointerId !== event.pointerId) return;
                        designPath.current = undefined;
                        setDesignPathPreview("");
                    }}
                    onPointerDown={(event) => {
                        if (designVisible && designTool && event.button === 0 && event.target === event.currentTarget) {
                            const bounds = event.currentTarget.getBoundingClientRect();
                            if (designTool === "path") {
                                designPath.current = { pointerId: event.pointerId, points: [{
                                    x: Math.round(event.clientX - bounds.left), y: Math.round(event.clientY - bounds.top),
                                }] };
                                event.currentTarget.setPointerCapture(event.pointerId);
                                return;
                            }
                            createPenLayer(designTool, {
                                x: (event.clientX - bounds.left - state.camera.x) / state.camera.zoom,
                                y: (event.clientY - bounds.top - state.camera.y) / state.camera.zoom,
                            });
                            setDesignTool(undefined);
                            return;
                        }
                        if (
                            state.scene.kind === "freeform" &&
                            event.target === event.currentTarget &&
                            tool === "select" &&
                            event.button === 0
                        ) {
                            setAndPersist((current) => ({ ...current, selectedEntityId: undefined }));
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
                        const target = event.target as HTMLElement;
                        const onDesktop =
                            target === event.currentTarget ||
                            target.classList.contains("os-mode-world") ||
                            target.classList.contains("os-desktop-layer") ||
                            target.classList.contains("os-desktop-column");
                        if (!onDesktop || state.scene.kind !== "freeform") return;
                        event.preventDefault();
                        showDesktopContextMenu(event);
                    }}
                >
                    {designPathPreview && (
                        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1500] size-full">
                            <polyline points={designPathPreview} fill="none" stroke="var(--accent-color)" strokeWidth="2" />
                        </svg>
                    )}
                    {designVisible && (
                        <SystemToolbar className="os-pen-toolbar" aria-label="Design tools" data-live-block-occluder="">
                            <SystemButton size="small" selected={!designTool && tool === "select"} onClick={() => { setTool("select"); setDesignTool(undefined); }}>Move</SystemButton>
                            <SystemButton size="small" selected={tool === "hand"} onClick={() => { setTool("hand"); setDesignTool(undefined); }}>Hand</SystemButton>
                            {PenDrawingTools.map((name) => (
                                <SystemButton key={name} size="small" selected={designTool === name}
                                    onClick={() => { setTool("select"); setDesignTool(name); }}>
                                    {name === "path" ? "Pen" : name[0].toUpperCase() + name.slice(1)}
                                </SystemButton>
                            ))}
                            <SystemButton size="small" onClick={fitAll}>Fit</SystemButton>
                        </SystemToolbar>
                    )}
                    {!designVisible && systemLayerEnabled && state.view === "canvas" && state.scene.kind === "freeform" && (
                        <>
                            {!selectorOwnsToolbar && (
                                <SystemButton
                                    className="os-canvas-tools-trigger"
                                    aria-label="Elements selector"
                                    aria-expanded={canvasToolsOpen}
                                    onClick={() => setFallbackToolsOpen(!fallbackToolsOpen)}
                                >
                                    <MousePointer2 />
                                </SystemButton>
                            )}
                            <CanvasToolsPortal target={selectorToolsSlot}>
                                <div
                                    role="group"
                                    aria-label="Elements selector tools"
                                    className={cn(
                                        "os-canvas-tool-rail",
                                        workflowPanelLayout.top > 0 && "has-workflow-tools",
                                        !canvasToolsOpen && "is-closed",
                                        selectorToolsSlot && "is-in-selector"
                                    )}
                                    aria-hidden={!canvasToolsOpen}
                                    data-live-block-occluder=""
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
                                        aria-label="Close elements selector"
                                        onClick={closeCanvasTools}
                                    >
                                        <X />
                                    </SystemButton>
                                </div>
                            </CanvasToolsPortal>
                            <CanvasToolsPortal target={document.body}>
                                <WorkflowFocusPanel
                                    editing={workflowConfigOpen}
                                    visible={workflowFocusVisible}
                                    setTarget={setWorkflowFocusTarget}
                                />
                            </CanvasToolsPortal>
                        </>
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
                    <OSComfyWorkflow
                        tabId={tabId}
                        active={comfyWorkflowOpen}
                        visible={comfyWorkflowVisible}
                        camera={state.camera}
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
                        onNodes={(nodes) => setState((current) => {
                            const next = {
                                ...current,
                                objects: [...current.objects.filter((object) => !object.id.startsWith("comfy:")), ...nodes],
                                selectedEntityId: current.selectedEntityId?.startsWith("comfy:") &&
                                    !nodes.some((node) => node.id === current.selectedEntityId)
                                    ? undefined
                                    : current.selectedEntityId,
                            };
                            stateRef.current = next;
                            return next;
                        })}
                        onSelect={selectCanvasObject}
                        onFit={(nodes) => {
                            if (!nodes.length) return;
                            setAndPersist((current) => ({
                                ...current,
                                camera: resolveWorkflowCameraIntent(
                                    { fitBounds: spatialBoundsForRects(nodes) },
                                    current.camera,
                                    viewport
                                ),
                            }));
                        }}
                        onClose={() => setComfyWorkflowOpen(false)}
                    />
                    <div className="os-mode-world" style={{ transform: worldTransform }}>
                        <div
                            ref={setComfyWorldTarget}
                            style={{ display: comfyWorkflowVisible ? "contents" : "none" }}
                            data-comfy-workflow-world=""
                            data-workflow-native-host=""
                        />
                        <div
                            ref={setWorkflowWorldTarget}
                            role="group"
                            aria-label="Workflow objects on the OS canvas"
                            data-workflow-native-host=""
                            data-workflow-world=""
                            hidden={state.view !== "canvas" || state.scene.kind !== "freeform"}
                            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                        />
                        {state.scene.kind === "freeform" && (
                            <>
                                <svg className="os-connectors" aria-hidden="true">
                                    {connectorObjects.map((connector) => {
                                        const from = getOSCanvasEntityBounds(state, connector.fromObjectId);
                                        const to = getOSCanvasEntityBounds(state, connector.toObjectId);
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
                                </svg>
                                {state.objects
                                    .filter((object) => object.kind !== "workflow-node")
                                    .map((object) => (
                                        <OSCanvasEntity
                                            key={object.id}
                                            object={object}
                                            localFile={droppedCanvasFiles.current.get(object.id)}
                                            selected={state.selectedEntityId === object.id}
                                            zIndex={sceneZIndices[object.id]}
                                            zoom={state.camera.zoom}
                                            onSelect={selectCanvasObject}
                                            onMove={(id, x, y) => updateObject(id, { x, y })}
                                            onResize={(id, width, height) => updateObject(id, { width, height })}
                                            onDelete={deleteObject}
                                            onTextChange={(id, text) => updateObject(id, { text })}
                                            onOpenResource={openResource}
                                        />
                                    ))}
                            </>
                        )}
                        {descriptors.map((descriptor) => {
                            const layout = windowLayouts[descriptor.blockId];
                            const docked = !!activeGroup?.blockIds.includes(descriptor.blockId);
                            return (
                                <OSBlockWindow
                                    key={descriptor.blockId}
                                    descriptor={descriptor}
                                    layout={
                                        state.scene.kind === "freeform"
                                            ? { ...layout, zIndex: sceneZIndices[descriptor.blockId] }
                                            : layout
                                    }
                                    selected={
                                        state.selectedEntityId === descriptor.blockId ||
                                        (state.scene.kind === "focused" &&
                                            state.scene.blockId === descriptor.blockId) ||
                                        (state.scene.kind === "overview" &&
                                            state.scene.selectedBlockId === descriptor.blockId)
                                    }
                                    docked={docked}
                                    maximized={state.windows[descriptor.blockId]?.maximized}
                                    agentPresence={agentPresenceByBlock.get(descriptor.blockId)}
                                    reducedMotion={reducedMotion}
                                    interacting={resizingPane || !!paneTakeover || !!dragBounds[descriptor.blockId]}
                                    onFocus={focusBlock}
                                    surfaceInput={surfaceInput}
                                    onTitlePointerDown={(event, blockId, nextLayout) =>
                                        beginWindowInteraction(event, blockId, nextLayout, "move")
                                    }
                                    onResizePointerDown={(event, blockId, nextLayout, edge) =>
                                        beginWindowInteraction(event, blockId, nextLayout, "resize", edge)
                                    }
                                    onClose={handleClose}
                                    onCollapse={(blockId) => dispatch({ type: "spatial.collapse", blockId })}
                                    onToggleFocus={(blockId) =>
                                        state.windows[blockId]?.maximized
                                            ? dispatch({ type: "os.window.restore", blockId })
                                            : dispatch({ type: "os.window.maximize", blockId })
                                    }
                                    onDock={dockBlock}
                                    onDetach={(blockId) => dispatch({ type: "spatial.detach", blockId })}
                                    onTitleContextMenu={showWindowContextMenu}
                                />
                            );
                        })}
                    </div>
                    {canvasHint && (
                        <p
                            role="status"
                            className="absolute bottom-24 left-1/2 z-[1800] -translate-x-1/2 bg-background px-3 py-2 text-sm text-foreground pointer-events-none"
                        >
                            {canvasHint}
                        </p>
                    )}
                    {dockPreview && (
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
                    {activeGroup && <OSGroupFrame group={activeGroup} layouts={windowLayouts} />}
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

function CanvasToolsPortal({ target, children }: { target: HTMLElement; children: React.ReactNode }) {
    return target ? createPortal(children, target) : children;
}
