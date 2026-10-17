// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import KronTermOSWallpaper from "@/app/asset/kronterm-os-wallpaper.png";
import { BlockChromeProvider } from "@/app/block/block-chrome-context";
import { blockViewToName, resolveBlockIcon } from "@/app/block/blockutil";
import { PersistentBlock as BlockView } from "@/app/block/persistent-block";
import { AppIcon } from "@/app/components/app-icon";
import {
    SystemButton,
    SystemDock,
    SystemMaterial,
    SystemPopover,
    SystemSegmentedControl,
    SystemToolbar,
    SystemUIProvider,
    SystemWindowFrame,
} from "@/app/components/system-ui";
import { hasViewIcon, KronPetIcon, viewIconId } from "@/app/components/view-icons";
import {
    fitSpatialViewportToBounds,
    spatialBoundsForRects,
    zoomSpatialViewportAtPoint,
} from "@/app/spatial/spatial-engine";
import {
    getBuiltinViewDescriptors,
    launchSystemApp,
    mergeAppDescriptors,
    rankInstalledApps,
    systemAppIdForBlock,
    useInstalledAppDescriptors,
    type AppDescriptor,
} from "@/app/store/app-registry";
import { ContextMenuModel } from "@/app/store/contextmenu";
import { globalStore } from "@/app/store/jotaiStore";
import {
    attachOSResourceToKronos,
    OSResourceDragMimeType,
    readOSResourceDragPayload,
    type OSResourceReference,
} from "@/app/store/os-resource-service";
import { OSSystemModel } from "@/app/store/os-system";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { publishWorkspacePresentation } from "@/app/tab/workspace-presentation";
import { useAgentPresences } from "@/app/view/agent-control-indicator";
import { AppStreamFrameSizeEvent, type AppStreamFrameSize } from "@/app/view/appstream/appstream-events";
import { submitToHermes } from "@/app/view/hermes/hermes-quick-submit";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { requestAgentTakeover } from "@/app/view/hermes/hermes-tool-activity";
import {
    OSSessionFocusEvent,
    SystemCenterOpenEvent,
    toggleCommandCenter,
    type SystemCenterTarget,
} from "@/app/workspace/command-center-events";
import { kronTermHudController } from "@/app/workspace/kronterm-hud-controller";
import { DesktopGrabControl } from "@/app/workspace/kronterm-hud-controls";
import { WorkspaceWallpaper } from "@/app/workspace/workspace-wallpaper";
import type { NodeModel } from "@/layout/lib/types";
import { atoms, getApi, getSettingsKeyAtom } from "@/store/global";
import * as services from "@/store/services";
import * as WOS from "@/store/wos";
import { isMacOS } from "@/util/platformutil";
import { cn } from "@/util/util";
import { atom, useAtomValue } from "jotai";
import {
    Battery,
    BatteryCharging,
    BatteryLow,
    Bell,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    FileText,
    Focus,
    FolderOpen,
    GitBranch,
    Grid2X2,
    Hand,
    Image,
    LayoutGrid,
    Link2,
    List,
    Maximize2,
    Minimize2,
    MousePointer2,
    PackageOpen,
    PanelBottom,
    PanelLeft,
    PanelRight,
    PanelTop,
    Plus,
    Search,
    Settings2,
    Circle as ShapeCircle,
    Diamond as ShapeDiamond,
    Square as ShapeSquare,
    StickyNote,
    Trash2,
    Unlink,
    Wifi,
    WifiOff,
    X,
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
    type PointerEvent as ReactPointerEvent,
    type WheelEvent as ReactWheelEvent,
} from "react";
import { subscribeAgentActivityStream } from "../../types/agent-activity";
import { assignAgentPresencesToWindows, describeAgentPresence, type OSAgentPresence } from "./os-agent-presence";
import { OSAppDragMimeType, readOSAppDragPayload, type OSAppDragPayload } from "./os-app-stream";
import { osDesktopInsetsForWidth, OSDesktopLayer } from "./os-desktop";
import { OSDesktopWidgetsStorageKey, readOSDockPins, writeOSDockPins, type OSDockPin } from "./os-desktop-model";
import { OSNativeTaskGroups } from "./os-native-task-groups";
import { useOSNowPlaying } from "./os-now-playing";
import { OSSpaceOverview } from "./os-space-overview";
import { getOSNavigationTarget, placeOSCanvasObject, validateOSSurfaceControl } from "./os-surface-control";
import { OSSystemCenterPanel, type OSSystemCenter } from "./os-system-centers";
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
    computeOSWindowLayout,
    findOSDockHitTarget,
    fitOSWindowToContentAspect,
    getOSCarouselNeighbor,
    getOSCarouselOrder,
    getOSSurfaceCamera,
    makeInitialOSModeState,
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
import type { WorkspacePresentation } from "./workspace-presentation";
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
const OSDockInstalledAppLimit = 6;
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
        groups: state.groups,
        tabGroups: state.tabGroups,
        objects: state.objects.map((object) => ({
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
        onTitleContextMenu?: (event: React.MouseEvent, blockId: string) => void;
    }) => {
        const blockAtom = useMemo(
            () => WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", descriptor.blockId)),
            [descriptor.blockId]
        );
        useAtomValue(blockAtom);
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

        const { bounds } = layout;
        const agentWorking = agentPresence != null;
        const transitionDuration = reducedMotion ? "0ms" : "220ms";
        return (
            <section
                className={cn(
                    "os-window",
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
                    transition: `left ${transitionDuration} cubic-bezier(0.22, 0.61, 0.36, 1), top ${transitionDuration} cubic-bezier(0.22, 0.61, 0.36, 1), width ${transitionDuration} cubic-bezier(0.22, 0.61, 0.36, 1), height ${transitionDuration} cubic-bezier(0.22, 0.61, 0.36, 1), opacity ${transitionDuration} ease`,
                    transformOrigin: layout.presentation === "edge-left" ? "left" : "right",
                }}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    onFocus(descriptor.blockId);
                }}
            >
                <SystemWindowFrame
                    titlebar={
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
                            <div className="os-window-title">
                                <AppIcon icon={descriptor.icon} />
                                <span>{descriptor.title}</span>
                            </div>
                            <div
                                ref={setToolbarHost}
                                className="os-window-context"
                                onPointerDown={(event) => event.stopPropagation()}
                                onDoubleClick={(event) => event.stopPropagation()}
                            />
                            {agentWorking && (
                                <span className="os-window-agent-badge" title={describeAgentPresence(agentPresence)}>
                                    <KronPetIcon />
                                    {agentPresence.agent}
                                </span>
                            )}
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
                        </header>
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
                                <BlockView nodeModel={nodeModel} preview={false} />
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

const OSCanvasEntity = memo(
    ({
        object,
        selected,
        zoom,
        onSelect,
        onMove,
        onResize,
        onDelete,
        onOpenResource,
    }: {
        object: OSCanvasObject;
        selected: boolean;
        onSelect: (id: string) => void;
        zoom: number;
        onMove: (id: string, x: number, y: number) => void;
        onResize: (id: string, width: number, height: number) => void;
        onDelete: (id: string) => void;
        onOpenResource: (object: OSCanvasObject) => void;
    }) => {
        const startRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | undefined>(undefined);
        const resizeRef = useRef<{ clientX: number; clientY: number; width: number; height: number } | undefined>(
            undefined
        );
        if (object.kind === "connector") return null;
        const isResource = ["file", "folder", "repository", "url", "generated-artifact"].includes(object.kind);
        const ResourceIcon =
            object.kind === "repository"
                ? GitBranch
                : object.kind === "folder"
                  ? FolderOpen
                  : object.kind === "url"
                    ? Link2
                    : object.kind === "generated-artifact"
                      ? PackageOpen
                      : FileText;
        return (
            <article
                className={cn(
                    "os-canvas-object",
                    `is-${object.kind}`,
                    `color-${object.color ?? "amber"}`,
                    selected && "is-selected"
                )}
                style={{ left: object.x, top: object.y, width: object.width, height: object.height }}
                onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelect(object.id);
                }}
            >
                <div
                    className="os-canvas-object-handle"
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(object.id);
                        startRef.current = { clientX: event.clientX, clientY: event.clientY, x: object.x, y: object.y };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        if (!startRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                        onMove(
                            object.id,
                            startRef.current.x + (event.clientX - startRef.current.clientX) / zoom,
                            startRef.current.y + (event.clientY - startRef.current.clientY) / zoom
                        );
                    }}
                    onPointerUp={(event) => {
                        startRef.current = undefined;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                >
                    <span>{object.kind === "note" ? "Note" : object.kind}</span>
                    <button type="button" onClick={() => onDelete(object.id)} aria-label="Delete canvas object">
                        <X />
                    </button>
                </div>
                {object.kind === "note" && <p>{object.text || "New note"}</p>}
                {isResource && (
                    <button
                        type="button"
                        className="os-canvas-reference"
                        onClick={(event) => {
                            event.stopPropagation();
                            onSelect(object.id);
                        }}
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            onOpenResource(object);
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            onOpenResource(object);
                        }}
                        title={object.resource ? `Open ${object.resource}` : undefined}
                    >
                        <ResourceIcon aria-hidden="true" />
                        <span>
                            <strong>{object.text || object.kind}</strong>
                            <small>{object.resource}</small>
                        </span>
                    </button>
                )}
                <button
                    type="button"
                    className="os-canvas-object-resize"
                    aria-label="Resize canvas object"
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        resizeRef.current = {
                            clientX: event.clientX,
                            clientY: event.clientY,
                            width: object.width,
                            height: object.height,
                        };
                        event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                        if (!resizeRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                        onResize(
                            object.id,
                            Math.max(96, resizeRef.current.width + (event.clientX - resizeRef.current.clientX) / zoom),
                            Math.max(72, resizeRef.current.height + (event.clientY - resizeRef.current.clientY) / zoom)
                        );
                    }}
                    onPointerUp={(event) => {
                        resizeRef.current = undefined;
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }}
                />
            </article>
        );
    }
);
OSCanvasEntity.displayName = "OSCanvasEntity";

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

/** The shell's live "agent is working" indicator; hidden whenever no agent is acting. */
const OSShellAgentPill = memo(({ onOpen }: { onOpen: () => void }) => {
    const presences = useAgentPresences();
    const latest = presences[presences.length - 1];
    if (latest == null) return null;
    const waiting = presences.find((presence) => presence.awaitingApproval);
    const label = describeAgentPresence(waiting ?? latest);
    return (
        <div className={cn("os-agent-pill", waiting && "is-waiting")} role="status" aria-live="polite">
            <button type="button" className="os-agent-pill-main" onClick={onOpen} title={label}>
                <span className="os-agent-pill-dot" aria-hidden="true" />
                <span className="os-agent-pill-label">{label}</span>
                {presences.length > 1 && <span className="os-agent-pill-count">+{presences.length - 1}</span>}
            </button>
            <button
                type="button"
                className="os-agent-pill-takeover"
                onClick={() => requestAgentTakeover()}
                aria-label="Take over from the agent"
            >
                Take over
            </button>
        </div>
    );
});
OSShellAgentPill.displayName = "OSShellAgentPill";

function OSModeShell({
    workspaces,
    currentWorkspaceId,
    blocks,
    installedApps,
    collapsedIds,
    showCollapsedDock,
    sceneKind,
    activeBlockId,
    osView,
    onSetOSView,
    onFocusApp,
    onCreateAppStream,
    onWorkspace,
    onCreateWorkspace,
    onCreateBlock,
    onRestore,
    onPinResource,
    onOverview,
    onFreeform,
    onPresentation,
}: {
    workspaces: Array<{ id: string; name: string }>;
    currentWorkspaceId: string;
    blocks: BlockDescriptor[];
    installedApps: AppDescriptor[];
    collapsedIds: string[];
    showCollapsedDock: boolean;
    sceneKind: OSModeState["scene"]["kind"];
    activeBlockId: string | undefined;
    osView: KronTermOSView;
    onSetOSView: (view: KronTermOSView) => void;
    onFocusApp: (blockId: string) => void;
    onCreateAppStream: (appid: string, appname: string) => void;
    onWorkspace: (id: string) => void;
    onCreateWorkspace: () => void;
    onCreateBlock: (view: string) => void;
    onRestore: (blockId: string) => void;
    onPinResource: (resource: OSResourceReference) => void;
    onOverview: () => void;
    onFreeform: () => void;
    onPresentation: (presentation: WorkspacePresentation) => void;
}) {
    const [systemMenuOpen, setSystemMenuOpen] = useState(false);
    const [activeSystemCenter, setActiveSystemCenter] = useState<OSSystemCenter>();
    const [viewMenuOpen, setViewMenuOpen] = useState(false);
    const systemModel = OSSystemModel.getInstance();
    const systemEvents = useAtomValue(systemModel.eventsAtom);
    const systemLoadState = useAtomValue(systemModel.loadStateAtom);
    const unreadActivityCount = systemEvents.filter((event) => event.readAt == null).length;
    const hermesSurface = useSyncExternalStore(
        hermesSurfaceController.subscribe,
        hermesSurfaceController.getSnapshot,
        hermesSurfaceController.getSnapshot
    );
    const hudMode = useSyncExternalStore(
        kronTermHudController.subscribe,
        kronTermHudController.getSnapshot,
        kronTermHudController.getSnapshot
    );
    const [clock, setClock] = useState(() => new Date());
    const wallpaper = useAtomValue(getSettingsKeyAtom("window:wallpaper" as never));
    const surfaceOpacity = useAtomValue(getSettingsKeyAtom("window:surfaceopacity" as never));
    const [wallpaperDraft, setWallpaperDraft] = useState(() => String(wallpaper ?? ""));
    useEffect(() => {
        const timer = window.setInterval(() => setClock(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        if (systemMenuOpen) setWallpaperDraft(String(wallpaper ?? ""));
    }, [systemMenuOpen, wallpaper]);
    const saveWallpaper = useCallback((value: string) => {
        void RpcApi.SetConfigCommand(TabRpcClient, { "window:wallpaper": value.trim() || undefined });
    }, []);
    const chooseWallpaper = useCallback(async () => {
        const selected = await getApi().selectWallpaper();
        if (!selected) return;
        setWallpaperDraft(selected);
        saveWallpaper(selected);
    }, [saveWallpaper]);
    const appDescriptors = useMemo(() => {
        const builtins = mergeAppDescriptors(getBuiltinViewDescriptors(blocks), [], blocks);
        const pinned = builtins.filter((descriptor) => descriptor.pinned);
        const runningExtras = builtins.filter(
            (descriptor) => !descriptor.pinned && descriptor.runningBlockIds.length > 0
        );
        return [...pinned, ...runningExtras, ...installedApps.slice(0, OSDockInstalledAppLimit)];
    }, [blocks, installedApps]);
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
    const toggleSystemCenter = useCallback((center: OSSystemCenter) => {
        setSystemMenuOpen(false);
        setActiveSystemCenter((current) => (current === center ? undefined : center));
    }, []);
    useEffect(() => {
        const handleSystemCenterOpen = (event: Event) => {
            const center = (event as CustomEvent<{ center?: SystemCenterTarget }>).detail?.center;
            if (center !== "activity" && center !== "control") return;
            setSystemMenuOpen(false);
            setViewMenuOpen(false);
            setActiveSystemCenter(center);
        };
        window.addEventListener(SystemCenterOpenEvent, handleSystemCenterOpen);
        return () => window.removeEventListener(SystemCenterOpenEvent, handleSystemCenterOpen);
    }, []);

    const launchApp = useCallback(
        (descriptor: AppDescriptor) => {
            void launchSystemApp(descriptor, {
                focusBlock: onFocusApp,
                createView: onCreateBlock,
                createAppStream: onCreateAppStream,
            });
        },
        [onFocusApp, onCreateBlock, onCreateAppStream]
    );

    const appDock = (
        <div className="os-dock-bay" data-live-block-occluder="">
            <SystemDock className="os-app-dock" aria-label="Applications">
                {appDescriptors.map((descriptor) => {
                    const running = descriptor.runningBlockIds.length > 0;
                    const active = running && descriptor.runningBlockIds.includes(activeBlockId ?? "");
                    return (
                        <SystemButton
                            type="button"
                            size="large"
                            selected={active}
                            key={descriptor.id}
                            className={cn(
                                "os-dock-app",
                                descriptor.view != null && `view-${descriptor.view}`,
                                running && "is-running",
                                active && "is-active"
                            )}
                            onClick={() => launchApp(descriptor)}
                            aria-label={`Open ${descriptor.name}`}
                            title={descriptor.name}
                        >
                            <AppIcon icon={descriptor.icon} />
                        </SystemButton>
                    );
                })}
                <SystemButton
                    type="button"
                    size="large"
                    className="os-dock-app is-add"
                    onClick={toggleCommandCenter}
                    aria-label="More applications"
                >
                    <Plus />
                </SystemButton>
            </SystemDock>
        </div>
    );

    return (
        <>
            <SystemMaterial
                material="bar"
                data-live-block-occluder=""
                className={cn("os-shell", isMacOS() && "is-macos")}
            >
                <div className="os-shell-left">
                    <button
                        type="button"
                        className="os-brand"
                        onClick={() => {
                            onSetOSView("canvas");
                            const blockId =
                                activeBlockId ?? blocks.find((block) => !collapsedIds.includes(block.blockId))?.blockId;
                            if (blockId) onFocusApp(blockId);
                        }}
                        aria-label="Return to the KronTerm desktop"
                    >
                        <strong>KronTerm</strong>
                    </button>
                    <nav className="os-workspaces" aria-label="Workspaces">
                        {workspaces.slice(0, 4).map((workspace, index) => (
                            <button
                                type="button"
                                key={workspace.id}
                                className={cn(workspace.id === currentWorkspaceId && "is-active")}
                                onClick={() => onWorkspace(workspace.id)}
                                aria-label={workspace.name}
                                aria-current={workspace.id === currentWorkspaceId ? "page" : undefined}
                            >
                                {index + 1}
                            </button>
                        ))}
                        <button type="button" onClick={onCreateWorkspace} aria-label="Create workspace">
                            <Plus />
                        </button>
                    </nav>
                </div>
                <SystemToolbar className="os-shell-right" aria-label="System controls">
                    <DesktopGrabControl compact />
                    <SystemButton
                        type="button"
                        size="small"
                        className="os-system-entry"
                        onClick={() => {
                            setActiveSystemCenter(undefined);
                            toggleCommandCenter();
                        }}
                        aria-label="Open Command Center"
                        title="Command Center"
                    >
                        <Search />
                    </SystemButton>
                    <SystemButton
                        type="button"
                        size="small"
                        selected={activeSystemCenter === "activity"}
                        className={cn("os-system-entry", activeSystemCenter === "activity" && "is-active")}
                        onClick={() => toggleSystemCenter("activity")}
                        aria-label={`Open Activity Center${systemLoadState === "degraded" ? ", restoration needs attention" : unreadActivityCount > 0 ? `, ${unreadActivityCount} unread` : ""}`}
                        aria-pressed={activeSystemCenter === "activity"}
                        title="Activity Center"
                    >
                        <Bell />
                        {(unreadActivityCount > 0 || systemLoadState === "degraded") && (
                            <span className="os-system-entry-badge">
                                {systemLoadState === "degraded" ? "!" : unreadActivityCount}
                            </span>
                        )}
                    </SystemButton>
                    <SystemButton
                        type="button"
                        size="small"
                        selected={activeSystemCenter === "control"}
                        className={cn("os-system-entry", activeSystemCenter === "control" && "is-active")}
                        onClick={() => toggleSystemCenter("control")}
                        aria-label="Open Control Center"
                        aria-pressed={activeSystemCenter === "control"}
                        title="Control Center"
                    >
                        <Settings2 />
                    </SystemButton>
                    <OSShellAgentPill
                        onOpen={() => {
                            if (hermesSurface.presentation !== "hud") toggleHermesChat();
                        }}
                    />
                    <SystemButton
                        type="button"
                        size="small"
                        selected={hermesSurface.presentation === "hud"}
                        className={cn("os-hermes-button", hermesSurface.presentation === "hud" && "is-active")}
                        onClick={toggleHermesChat}
                        aria-label={hermesSurface.presentation === "hud" ? "Hide Hermes chat" : "Open Hermes chat"}
                        aria-pressed={hermesSurface.presentation === "hud"}
                        title="KronTerm Agent chat"
                    >
                        <KronPetIcon />
                    </SystemButton>
                    <SystemButton
                        type="button"
                        size="small"
                        selected={hudMode.active && hudMode.keepWorkspaceVisible}
                        className="os-coucou-button"
                        onClick={() => {
                            if (hudMode.active && hudMode.keepWorkspaceVisible) {
                                kronTermHudController.setActive(false);
                                hermesSurfaceController.dismiss();
                                return;
                            }
                            kronTermHudController.openAlongsideWorkspace();
                            hermesSurfaceController.requestOpenHud();
                        }}
                        aria-label={
                            hudMode.active && hudMode.keepWorkspaceVisible
                                ? "Close floating Coucou HUD"
                                : "Float Coucou HUD above this workspace"
                        }
                        aria-pressed={hudMode.active && hudMode.keepWorkspaceVisible}
                        title="Float Coucou above workspace"
                    >
                        <PanelTop />
                    </SystemButton>
                    <SystemButton
                        type="button"
                        size="small"
                        selected={hudMode.active && !hudMode.keepWorkspaceVisible}
                        className={cn(
                            "os-hud-mode-button",
                            hudMode.active && !hudMode.keepWorkspaceVisible && "is-active"
                        )}
                        onClick={toggleHudMode}
                        aria-label={
                            hudMode.active && !hudMode.keepWorkspaceVisible
                                ? "Exit KronTerm HUD mode"
                                : "Enter KronTerm HUD mode"
                        }
                        aria-pressed={hudMode.active && !hudMode.keepWorkspaceVisible}
                        title="KronTerm HUD mode"
                    >
                        <PanelBottom />
                    </SystemButton>
                    <SystemSegmentedControl className="os-view-selector" aria-label="Workspace view">
                        <button
                            type="button"
                            onClick={() => setViewMenuOpen((open) => !open)}
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
                            aria-label={`KronTerm OS view: ${osView === "file" ? "files" : sceneKind === "freeform" ? "canvas" : "carousel"}`}
                        >
                            {osView === "file" ? <FolderOpen /> : <Grid2X2 />}
                            <span className="os-view-selector-label">
                                {osView === "file" ? "Files" : sceneKind === "freeform" ? "Canvas" : "Carousel"}
                            </span>
                            <ChevronDown />
                        </button>
                        {viewMenuOpen && (
                            <div className="os-view-menu" role="menu">
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={osView === "canvas" && sceneKind !== "freeform"}
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
                                            blocks.find((block) => !collapsedIds.includes(block.blockId))?.blockId;
                                        if (blockId) onFocusApp(blockId);
                                        setViewMenuOpen(false);
                                    }}
                                >
                                    <Grid2X2 />
                                    <span>Window carousel</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={osView === "canvas" && sceneKind === "freeform"}
                                    onClick={() => {
                                        onSetOSView("canvas");
                                        onFreeform();
                                        setViewMenuOpen(false);
                                    }}
                                >
                                    <Grid2X2 />
                                    <span>Freeform canvas</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={osView === "file"}
                                    onClick={() => {
                                        onSetOSView("file");
                                        setViewMenuOpen(false);
                                    }}
                                >
                                    <FolderOpen />
                                    <span>File</span>
                                </button>
                                <button
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={false}
                                    onClick={() => {
                                        onPresentation("widgets");
                                        setViewMenuOpen(false);
                                    }}
                                >
                                    <List />
                                    <span>Tiles</span>
                                </button>
                            </div>
                        )}
                    </SystemSegmentedControl>
                    <time>{clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    <OSShellStatus />
                    <OSNativeTaskGroups />
                    <button
                        type="button"
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
                    >
                        {sceneKind === "overview" ? <Focus /> : <Grid2X2 />}
                    </button>
                    <button
                        type="button"
                        className="os-layout-menu"
                        onClick={() => {
                            setActiveSystemCenter(undefined);
                            setSystemMenuOpen((open) => !open);
                        }}
                        aria-label="Wallpaper and layout controls"
                        aria-expanded={systemMenuOpen}
                    >
                        <LayoutGrid />
                    </button>
                </SystemToolbar>
                {systemMenuOpen && (
                    <SystemPopover className="os-system-menu" aria-label="Wallpaper and layout controls">
                        <header>
                            <span>
                                <Image aria-hidden="true" />
                            </span>
                            <div>
                                <strong>Wallpaper engine</strong>
                                <small>Still images and looping video</small>
                            </div>
                        </header>
                        <label className="os-wallpaper-source">
                            <span>File path or URL</span>
                            <input
                                value={wallpaperDraft}
                                onChange={(event) => setWallpaperDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") saveWallpaper(wallpaperDraft);
                                    if (event.key === "Escape") setSystemMenuOpen(false);
                                }}
                                placeholder="Choose an image/video or paste a URL"
                            />
                        </label>
                        <div className="os-wallpaper-actions">
                            <button type="button" onClick={() => void chooseWallpaper()}>
                                Choose file
                            </button>
                            <button type="button" onClick={() => saveWallpaper(wallpaperDraft)}>
                                Apply
                            </button>
                            <button
                                type="button"
                                className="is-danger"
                                onClick={() => {
                                    setWallpaperDraft("");
                                    saveWallpaper("");
                                }}
                                aria-label="Clear wallpaper"
                            >
                                <Trash2 aria-hidden="true" />
                            </button>
                        </div>
                        <label className="os-surface-opacity">
                            <span>Widget glass</span>
                            <input
                                type="range"
                                min="35"
                                max="100"
                                value={Math.min(100, Math.max(35, Number(surfaceOpacity ?? 78)))}
                                onChange={(event) =>
                                    void RpcApi.SetConfigCommand(TabRpcClient, {
                                        "window:surfaceopacity": Number(event.target.value),
                                    })
                                }
                            />
                        </label>
                        <div className="os-layout-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    const blockId =
                                        activeBlockId ??
                                        blocks.find((block) => !collapsedIds.includes(block.blockId))?.blockId;
                                    if (blockId) onFocusApp(blockId);
                                    setSystemMenuOpen(false);
                                }}
                            >
                                <Focus aria-hidden="true" />
                                <span>
                                    <strong>Window carousel</strong>
                                    <small>Large apps arranged side by side</small>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onFreeform();
                                    setSystemMenuOpen(false);
                                }}
                            >
                                <Grid2X2 aria-hidden="true" />
                                <span>
                                    <strong>Freeform canvas</strong>
                                    <small>Arrange windows on an infinite desktop</small>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onPresentation("widgets");
                                    setSystemMenuOpen(false);
                                }}
                            >
                                <LayoutGrid aria-hidden="true" />
                                <span>
                                    <strong>Legacy widgets</strong>
                                    <small>Open the compatibility tile presentation</small>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    onPresentation("canvas");
                                    setSystemMenuOpen(false);
                                }}
                            >
                                <Grid2X2 aria-hidden="true" />
                                <span>
                                    <strong>Legacy canvas</strong>
                                    <small>Open the compatibility infinite canvas</small>
                                </span>
                            </button>
                        </div>
                    </SystemPopover>
                )}
                {activeSystemCenter != null && (
                    <OSSystemCenterPanel
                        center={activeSystemCenter}
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
            {appDock}
        </>
    );
}

function OSGroupDivider({
    group,
    viewport,
    onRatio,
}: {
    group: OSWindowGroup;
    viewport: { width: number; height: number };
    onRatio: (ratio: number) => void;
}) {
    const outerWidth = Math.min(1540, viewport.width * 0.92);
    const outerHeight = Math.min(860, viewport.height * 0.78);
    const outerX = (viewport.width - outerWidth) / 2;
    const outerY = 72 + (viewport.height - 72 - outerHeight) / 2;
    const dividerX =
        group.side === "left"
            ? outerX + outerWidth * group.dividerRatio
            : outerX + outerWidth * (1 - group.dividerRatio);
    return (
        <div
            className="os-group-frame"
            style={{ left: outerX - 8, top: outerY - 8, width: outerWidth + 16, height: outerHeight + 16 }}
        >
            <div
                className="os-group-divider"
                role="separator"
                aria-orientation="vertical"
                aria-valuemin={22}
                aria-valuemax={42}
                aria-valuenow={Math.round(group.dividerRatio * 100)}
                tabIndex={0}
                style={{ left: dividerX - outerX + 4 }}
                onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                    const raw =
                        group.side === "left"
                            ? (event.clientX - outerX) / outerWidth
                            : (outerX + outerWidth - event.clientX) / outerWidth;
                    onRatio(raw);
                }}
                onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    const direction = event.key === "ArrowRight" ? 0.02 : -0.02;
                    onRatio(group.side === "left" ? group.dividerRatio + direction : group.dividerRatio - direction);
                }}
            />
        </div>
    );
}

function OSModeView({ tabId, tabData }: { tabId: string; tabData: Tab }) {
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
    const persistTimerRef = useRef<number | undefined>(undefined);
    const checkpointTimerRef = useRef<number | undefined>(undefined);
    const [measuredViewport, setViewport] = useState({ width: 1440, height: 900 });
    const [desktopWidgetsEnabled, setDesktopWidgetsEnabled] = useState(() => readDesktopWidgetsEnabled());
    const media = useOSNowPlaying();
    const viewport = useMemo(
        () => ({
            ...measuredViewport,
            rightInset: desktopWidgetsEnabled ? (media.state?.playing && !media.state.muted ? 264 : 72) : 0,
        }),
        [measuredViewport, media.state?.playing, media.state?.muted, desktopWidgetsEnabled]
    );
    const [tool, setTool] = useState<OSCanvasTool>("select");
    const [connectorStartId, setConnectorStartId] = useState<string | undefined>(undefined);
    const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
    const [dragBounds, setDragBounds] = useState<Record<string, DragBounds>>({});
    const [dockPreview, setDockPreview] = useState<DockPreview | undefined>(undefined);
    const panRef = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number } | undefined>(
        undefined
    );
    const interactionRef = useRef<
        | {
              kind: "move" | "resize";
              edge: OSResizeEdge;
              blockId: string;
              pointerId: number;
              clientX: number;
              clientY: number;
              bounds: DragBounds;
              scale: number;
          }
        | undefined
    >(undefined);
    const reducedMotion = useReducedMotion() ?? false;
    const currentWorkspace = useAtomValue(atoms.workspace);
    const systemModel = OSSystemModel.getInstance();
    const systemLoadState = useAtomValue(systemModel.loadStateAtom);
    const systemLayerEnabled = useAtomValue(getSettingsKeyAtom("feature:systemlayer" as never)) ?? true;
    stateRef.current = state;

    const descriptors = useBlockDescriptors(blockIds, blockIdsKey);
    const viewsKey = descriptors.map((descriptor) => (descriptor.resolved ? descriptor.view : "?")).join(":");

    const installedAppDescriptors = useInstalledAppDescriptors();
    const installedDescriptorsWithRunning = useMemo(
        () =>
            rankInstalledApps(
                installedAppDescriptors.map((descriptor) => ({
                    ...descriptor,
                    runningBlockIds: descriptors
                        .filter(
                            (block) =>
                                block.appStreamAppId != null && block.appStreamAppId === descriptor.installedAppId
                        )
                        .map((block) => block.blockId),
                }))
            ),
        [installedAppDescriptors, descriptors]
    );

    useEffect(() => {
        setState((current) => reconcileOSModeState(current, blockIds, resolvedViewsByBlockId(descriptors)));
    }, [blockIdsKey, viewsKey]);

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
        const root = rootRef.current;
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
        void RpcApi.WorkspaceListCommand(TabRpcClient, {})
            .then((items) => {
                if (cancelled) return;
                setWorkspaces(
                    (items ?? []).map((item, index) => ({
                        id: item.workspacedata.oid,
                        name: item.workspacedata.name || `Workspace ${index + 1}`,
                    }))
                );
            })
            .catch(() => {
                if (!cancelled) setWorkspaces([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const persist = useCallback(
        (nextState: OSModeState) => {
            if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
            persistTimerRef.current = window.setTimeout(() => {
                persistTimerRef.current = undefined;
                void RpcApi.SetMetaCommand(TabRpcClient, {
                    oref: WOS.makeORef("tab", tabId),
                    meta: { "layout:mode": "os", "layout:os": nextState } as unknown as MetaType,
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

    const dispatch = useCallback(
        (action: OSSpatialAction) => {
            setAndPersist((current) => reduceOSModeState(current, action));
        },
        [setAndPersist]
    );

    useEffect(() => {
        const rect = rootRef.current?.getBoundingClientRect();
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
        (resource: OSResourceReference, position?: { x: number; y: number }) => {
            const camera = stateRef.current.camera;
            const width = 260;
            const height = 112;
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
                objects: [...current.objects, object],
                selectedEntityId: object.id,
            }));
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
            const definedPatch = Object.fromEntries(
                Object.entries(patch).filter(([, value]) => value != null)
            ) as Partial<OSCanvasObject>;
            setAndPersist((current) => ({
                ...current,
                objects: current.objects.map((object) =>
                    object.id === objectId ? { ...object, ...definedPatch } : object
                ),
                selectedEntityId: objectId,
            }));
        },
        [setAndPersist]
    );

    const deleteObject = useCallback(
        (objectId: string) => {
            setAndPersist((current) => ({
                ...current,
                objects: current.objects.filter(
                    (object) =>
                        object.id !== objectId && object.fromObjectId !== objectId && object.toObjectId !== objectId
                ),
                selectedEntityId: current.selectedEntityId === objectId ? undefined : current.selectedEntityId,
            }));
        },
        [setAndPersist]
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

    const focusBlock = useCallback(
        (blockId: string) => {
            setAndPersist((current) =>
                current.scene.kind === "focused" && current.scene.blockId !== blockId
                    ? reduceOSModeState(current, { type: "os.window.focus", blockId })
                    : {
                          ...current,
                          selectedEntityId: blockId,
                          zOrder: [...current.zOrder.filter((id) => id !== blockId), blockId],
                      }
            );
        },
        [setAndPersist]
    );

    const primaryBlockId =
        state.scene.kind === "focused"
            ? state.scene.blockId
            : state.scene.kind === "grouped"
              ? state.groups[state.scene.groupId]?.primaryBlockId
              : undefined;

    const dockBlock = useCallback(
        (blockId: string, side: "left" | "right") => {
            const targetBlockId = primaryBlockId ?? stateRef.current.zOrder.filter((id) => id !== blockId).at(-1);
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
            dispatch({ type: "os.view.set", view: "canvas" });
            const existing = descriptors.find((block) => block.view === view);
            if (existing) {
                if (view === "hermes") {
                    hermesSurfaceController.activateWidget(existing.blockId);
                }
                dispatch({ type: "spatial.focus", blockId: existing.blockId });
                return;
            }
            return RpcApi.CreateBlockCommand(TabRpcClient, { tabid: tabId, blockdef: { meta: { view } } });
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
        const focusSession = (event: Event) => {
            const blockId = (event as CustomEvent<{ blockId?: string }>).detail?.blockId;
            const descriptor = descriptors.find((block) => block.blockId === blockId);
            if (!descriptor) return;
            if (descriptor.view === "hermes") {
                hermesSurfaceController.activateWidget(descriptor.blockId);
            }
            dispatch({ type: "os.view.set", view: "canvas" });
            dispatch({ type: "spatial.focus", blockId: descriptor.blockId });
        };
        window.addEventListener(OSSessionFocusEvent, focusSession);
        return () => window.removeEventListener(OSSessionFocusEvent, focusSession);
    }, [descriptors, dispatch]);

    const handlePresentation = useCallback((presentation: WorkspacePresentation) => {
        const nextPresentation = publishWorkspacePresentation(presentation);
        void RpcApi.SetConfigCommand(TabRpcClient, { "app:layoutmode": nextPresentation });
    }, []);

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
        const insets = osDesktopInsetsForWidth(viewport.width, desktopWidgetsEnabled);
        if (viewport.width > 900 && desktopWidgetsEnabled) insets.right = viewport.rightInset;
        return computeOSWorkArea(viewport, { top: OSShellReservedHeight, bottom: 0, ...insets });
    }, [desktopWidgetsEnabled, viewport]);

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
                handleCreateAppStream(pin.appId, pin.name);
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
        hermesSurfaceController.requestOpenPanel();
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
                            { label: "KronTerm Agent", click: () => hermesSurfaceController.requestOpenPanel() },
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
        (event: React.MouseEvent, blockId: string) => {
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

    const windowLayouts = useMemo(
        () =>
            Object.fromEntries(
                descriptors.map((block) => {
                    const computed = computeOSWindowLayout(state, block.blockId, block.view, viewport);
                    const dragged = dragBounds[block.blockId];
                    return [
                        block.blockId,
                        dragged
                            ? { ...computed, bounds: dragged, rotateY: 0, scale: 1, opacity: 1, zIndex: 900 }
                            : computed,
                    ];
                })
            ),
        [descriptors, dragBounds, state, viewport]
    );

    const beginWindowInteraction = useCallback(
        (
            event: ReactPointerEvent,
            blockId: string,
            layout: OSWindowLayout,
            kind: "move" | "resize",
            edge: OSResizeEdge = "se"
        ) => {
            if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
            event.preventDefault();
            event.stopPropagation();
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
            setDragBounds((current) => ({ ...current, [blockId]: layout.bounds }));
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        },
        []
    );

    const handleRootPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const interaction = interactionRef.current;
            if (interaction?.pointerId === event.pointerId) {
                const dx = (event.clientX - interaction.clientX) / interaction.scale;
                const dy = (event.clientY - interaction.clientY) / interaction.scale;
                const bounds =
                    interaction.kind === "move"
                        ? { ...interaction.bounds, x: interaction.bounds.x + dx, y: interaction.bounds.y + dy }
                        : resizeBoundsFromEdge(interaction.bounds, interaction.edge, dx, dy);
                setDragBounds((current) => ({ ...current, [interaction.blockId]: bounds }));
                if (interaction.kind === "move") {
                    const rootBounds = rootRef.current?.getBoundingClientRect();
                    const pointer = {
                        x: event.clientX - (rootBounds?.left ?? 0),
                        y: event.clientY - (rootBounds?.top ?? 0),
                    };
                    const current = stateRef.current;
                    const hit = findOSDockHitTarget(
                        interaction.blockId,
                        pointer,
                        Object.fromEntries(
                            descriptors.map((descriptor) => {
                                const layout = computeOSWindowLayout(
                                    current,
                                    descriptor.blockId,
                                    descriptor.view,
                                    viewport
                                );
                                return [descriptor.blockId, toScreenWindowLayout(current, layout)];
                            })
                        )
                    );
                    const target = hit && descriptors.find((descriptor) => descriptor.blockId === hit.targetBlockId);
                    setDockPreview(
                        hit && target
                            ? {
                                  blockId: interaction.blockId,
                                  targetBlockId: hit.targetBlockId,
                                  targetTitle: target.title,
                                  targetBounds: hit.bounds,
                                  side: hit.side,
                              }
                            : undefined
                    );
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
        [descriptors, viewport]
    );

    const handleRootPointerUp = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const interaction = interactionRef.current;
            if (interaction?.pointerId === event.pointerId) {
                const finalBounds = dragBounds[interaction.blockId] ?? interaction.bounds;
                if (dockPreview?.blockId === interaction.blockId) {
                    dispatch({
                        type: "spatial.dock",
                        blockId: interaction.blockId,
                        targetBlockId: dockPreview.targetBlockId,
                        side: dockPreview.side,
                    });
                } else if (interaction.kind === "move") {
                    setAndPersist((current) =>
                        reduceOSModeState(
                            current.scene.kind === "freeform" ? current : { ...current, scene: { kind: "freeform" } },
                            { type: "spatial.move", blockId: interaction.blockId, x: finalBounds.x, y: finalBounds.y }
                        )
                    );
                } else {
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
                }
                interactionRef.current = undefined;
                setDockPreview(undefined);
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
        [dispatch, dockPreview, dragBounds, persist, setAndPersist]
    );

    const handleWheel = useCallback(
        (event: ReactWheelEvent<HTMLDivElement>) => {
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
                const rect = rootRef.current?.getBoundingClientRect();
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
        [dispatch, setAndPersist]
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
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
    }, [dispatch]);

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
                            computeOSWindowLayout(stateRef.current, block.blockId, block.view, viewport).bounds,
                        ])
                    ),
                    objects: stateRef.current.objects,
                    scene: stateRef.current.scene,
                    groups: stateRef.current.groups,
                    tabgroups: stateRef.current.tabGroups,
                    presentations: Object.fromEntries(
                        descriptors.map((block) => [
                            block.blockId,
                            computeOSWindowLayout(stateRef.current, block.blockId, block.view, viewport).presentation,
                        ])
                    ),
                }),
                control: async (rawInput) => {
                    const validationError = validateOSSurfaceControl(stateRef.current, rawInput);
                    if (validationError) return { success: false, message: validationError };
                    const input = resolveOSControlAction(rawInput);
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
                        return { success: true, message: `KronTerm OS switched to ${input.presentation}.` };
                    }
                    if (input.action === "spatial.openFile") {
                        if (!input.file) return { success: false, message: "File path is required." };
                        await RpcApi.CreateBlockCommand(TabRpcClient, {
                            tabid: tabId,
                            blockdef: { meta: { view: "preview", file: input.file } },
                        });
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
                        dispatch({ type: "spatial.focus", blockId: input.blockid });
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
                        return { success: true, message: "Connected OS objects." };
                    }
                    if (input.action === "delete_object" && input.objectid) {
                        deleteObject(input.objectid);
                        return { success: true, message: "Deleted OS object." };
                    }
                    if (input.action === "update_object" && input.objectid) {
                        updateObject(input.objectid, {
                            x: input.x,
                            y: input.y,
                            width: input.width,
                            height: input.height,
                            text: input.text,
                            color: input.color as OSCanvasColor,
                        });
                        return { success: true, message: "Updated OS object." };
                    }
                    return { success: false, message: `Unsupported OS action: ${input.action}` };
                },
            }),
        [
            addObject,
            arrangeWindows,
            deleteObject,
            descriptors,
            dispatch,
            fitAll,
            handleClose,
            placeWindow,
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

    return (
        <SystemUIProvider enabled={systemLayerEnabled}>
            <div
                ref={rootRef}
                className={cn(
                    "os-mode-root",
                    `scene-${state.scene.kind}`,
                    `view-${state.view}`,
                    reducedMotion && "reduced-motion"
                )}
                tabIndex={-1}
                onPointerMove={handleRootPointerMove}
                onPointerUp={handleRootPointerUp}
                onPointerCancel={handleRootPointerUp}
                onWheel={handleWheel}
            >
                <WorkspaceWallpaper />
                <img className="os-wallpaper-fallback" src={KronTermOSWallpaper} alt="" aria-hidden="true" />
                {systemLoadState === "restoring" && (
                    <div className="os-restore-status" role="status">
                        <span className="os-restore-status-spinner" aria-hidden="true" />
                        Restoring space
                    </div>
                )}
                <OSModeShell
                    workspaces={workspaces}
                    currentWorkspaceId={currentWorkspace?.oid ?? ""}
                    blocks={descriptors}
                    installedApps={installedDescriptorsWithRunning}
                    collapsedIds={blockIds.filter((id) => state.windows[id]?.collapsed)}
                    showCollapsedDock={!desktopWidgetsEnabled || viewport.width <= 900}
                    sceneKind={state.scene.kind}
                    onWorkspace={(workspaceId) => getApi().switchWorkspace(workspaceId)}
                    onCreateWorkspace={() => getApi().createWorkspace()}
                    onCreateBlock={handleCreateBlock}
                    onRestore={(blockId) => dispatch({ type: "spatial.restore", blockId })}
                    onPinResource={pinResource}
                    onOverview={() => dispatch({ type: "spatial.showOverview" })}
                    onFreeform={() => dispatch({ type: "spatial.freeform" })}
                    onPresentation={handlePresentation}
                    activeBlockId={activeBlockId}
                    osView={state.view}
                    onSetOSView={(view) => dispatch({ type: "os.view.set", view })}
                    onFocusApp={(blockId) => {
                        dispatch({ type: "os.view.set", view: "canvas" });
                        dispatch({ type: "spatial.focus", blockId });
                    }}
                    onCreateAppStream={handleCreateAppStream}
                />
                {state.scene.kind === "overview" && (
                    <OSSpaceOverview
                        workspaces={workspaces}
                        currentWorkspaceId={currentWorkspace?.oid ?? ""}
                        state={state}
                        onSwitch={(workspaceId) => getApi().switchWorkspace(workspaceId)}
                        onCreate={() => getApi().createWorkspace()}
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
                        <span aria-live="polite">
                            {descriptors.find((block) => block.blockId === activeBlockId)?.title ?? "App"}
                            <small>
                                {carouselOrder.indexOf(activeBlockId) + 1} / {carouselOrder.length}
                            </small>
                        </span>
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
                {systemLayerEnabled && state.view === "canvas" && state.scene.kind === "freeform" && (
                    <SystemToolbar className="os-canvas-toolbar" aria-label="Canvas tools">
                        <SystemButton
                            type="button"
                            size="small"
                            selected={tool === "select"}
                            onClick={() => setTool("select")}
                            aria-label="Select"
                            title="Select"
                        >
                            <MousePointer2 />
                        </SystemButton>
                        <SystemButton
                            type="button"
                            size="small"
                            selected={tool === "hand"}
                            onClick={() => setTool("hand")}
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
                            onClick={() => setTool("connector")}
                            aria-label="Connect objects"
                            title="Connect objects"
                        >
                            <Link2 />
                        </SystemButton>
                        <span className="os-canvas-toolbar-separator" aria-hidden="true" />
                        <SystemButton type="button" size="small" onClick={fitAll} aria-label="Fit all" title="Fit all">
                            <Focus />
                        </SystemButton>
                    </SystemToolbar>
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
                <div
                    className="os-mode-viewport"
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
                            const camera = stateRef.current.camera;
                            pinResource(resource, {
                                x: Math.max(16, (event.clientX - camera.x) / camera.zoom - 130),
                                y: Math.max(96, (event.clientY - camera.y) / camera.zoom - 30),
                            });
                            return;
                        }
                        const payload = readOSAppDragPayload(event.dataTransfer);
                        if (payload == null) return;
                        event.preventDefault();
                        const camera = stateRef.current.camera;
                        const worldX = Math.max(16, (event.clientX - camera.x) / camera.zoom - 260);
                        const worldY = Math.max(96, (event.clientY - camera.y) / camera.zoom - 30);
                        handleDropApp(payload, worldX, worldY);
                    }}
                    onPointerDown={(event) => {
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
                    {desktopWidgetsEnabled && state.view === "canvas" && state.scene.kind !== "overview" && (
                        <OSDesktopLayer
                            media={media}
                            windows={desktopWindows}
                            pins={dockPins}
                            installedApps={desktopInstalledApps}
                            onFocusWindow={(blockId) => {
                                dispatch({ type: "spatial.restore", blockId });
                                dispatch({ type: "spatial.focus", blockId });
                            }}
                            onAskKronos={askKronos}
                            onOpenKronos={() => hermesSurfaceController.requestOpenPanel()}
                            onLaunchPin={launchDockPin}
                            onPinsChange={updateDockPins}
                        />
                    )}
                    <div className="os-mode-world" style={{ transform: worldTransform }}>
                        {state.scene.kind === "freeform" && (
                            <>
                                <svg className="os-connectors" aria-hidden="true">
                                    {connectorObjects.map((connector) => {
                                        const from = state.objects.find(
                                            (object) => object.id === connector.fromObjectId
                                        );
                                        const to = state.objects.find((object) => object.id === connector.toObjectId);
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
                                {state.objects.map((object) => (
                                    <OSCanvasEntity
                                        key={object.id}
                                        object={object}
                                        selected={state.selectedEntityId === object.id}
                                        zoom={state.camera.zoom}
                                        onSelect={(id) => {
                                            if (tool === "connector") {
                                                if (!connectorStartId) {
                                                    setConnectorStartId(id);
                                                    setAndPersist((current) => ({ ...current, selectedEntityId: id }));
                                                    return;
                                                }
                                                if (connectorStartId !== id) {
                                                    setAndPersist((current) => ({
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
                                                        selectedEntityId: id,
                                                    }));
                                                }
                                                setConnectorStartId(undefined);
                                                setTool("select");
                                                return;
                                            }
                                            setAndPersist((current) => ({ ...current, selectedEntityId: id }));
                                        }}
                                        onMove={(id, x, y) => updateObject(id, { x, y })}
                                        onResize={(id, width, height) => updateObject(id, { width, height })}
                                        onDelete={deleteObject}
                                        onOpenResource={openResource}
                                    />
                                ))}
                            </>
                        )}
                        {descriptors.map((descriptor) => {
                            const layout = windowLayouts[descriptor.blockId];
                            const docked = Object.values(state.groups).some(
                                (group) => group.sideBlockId === descriptor.blockId
                            );
                            return (
                                <OSBlockWindow
                                    key={descriptor.blockId}
                                    descriptor={descriptor}
                                    layout={layout}
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
                                    interacting={!!dragBounds[descriptor.blockId]}
                                    onFocus={focusBlock}
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
                    {activeGroup && (
                        <OSGroupDivider
                            group={activeGroup}
                            viewport={viewport}
                            onRatio={(dividerRatio) =>
                                dispatch({ type: "spatial.setDivider", groupId: activeGroup.id, dividerRatio })
                            }
                        />
                    )}
                </div>
            </div>
        </SystemUIProvider>
    );
}

export { OSModeView };
