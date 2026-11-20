import type { PenWidgetGeometry } from "./os-pen-widgets";
import { resolveBlockView } from "@/app/block/retired-chat-view";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SpatialRect, SpatialViewport } from "@/app/spatial/spatial-engine";
import { getSingleDeviceWorkspaceWidth } from "@/app/view/computers/device-workspace-layout";
import type { PenLayer } from "./os-pen-import";
import { raiseOSSceneOrder, reconcileOSSceneOrder } from "./os-scene-order";
import { getOSTabGroup, reconcileOSTabGroups, reduceOSTabs, type OSTabAction, type OSTabGroup } from "./os-tab-groups";

const OSLayoutVersion = 4;
const OSWindowMinimumWidth = 320;
const OSWindowMinimumHeight = 220;

export type OSScene =
    | { kind: "freeform" }
    | { kind: "focused"; blockId: string }
    | { kind: "grouped"; groupId: string }
    | { kind: "overview"; selectedBlockId?: string };

export type OSWindowPresentation =
    | "freeform"
    | "focused"
    | "carousel"
    | "docked-left"
    | "docked-right"
    | "edge-left"
    | "edge-right"
    | "overview"
    | "collapsed";

export type OSWindowState = {
    blockId: string;
    bounds: SpatialRect;
    zOrder: number;
    collapsed?: boolean;
    maximized?: boolean;
    restoreBounds?: SpatialRect;
    // bounds were chosen before the block's view was known; re-place once it resolves
    provisional?: boolean;
};

export type OSWindowGroup = {
    id: string;
    primaryBlockId: string;
    blockIds: string[];
    weights: Record<string, number>;
};

export type OSCanvasObjectKind =
    | "file"
    | "folder"
    | "repository"
    | "url"
    | "app-shortcut"
    | "agent-task"
    | "generated-artifact"
    | "note"
    | "widget"
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "pen-layer"
    | "connector"
    | "workflow-node";
export type OSCanvasColor = "amber" | "blue" | "green" | "rose" | "slate";

export type KronTermOSView = "canvas" | "design" | "kronos-v2" | "file";

export type OSCanvasObject = SpatialRect & {
    id: string;
    kind: OSCanvasObjectKind;
    text?: string;
    name?: string;
    pen?: PenLayer;
    color?: OSCanvasColor;
    fromObjectId?: string;
    toObjectId?: string;
    resource?: string;
    appId?: string;
    agentSessionId?: string;
    artifactId?: string;
    render?: import("@/types/comfyui").ComfyRenderRef;
};

export type OSModeState = {
    version: number;
    camera: SpatialViewport;
    windows: Record<string, OSWindowState>;
    zOrder: string[];
    sceneOrder?: string[];
    groups: Record<string, OSWindowGroup>;
    carouselWeights?: Record<string, number>;
    tabGroups?: OSTabGroup[];
    objects: OSCanvasObject[];
    loadedPenPaths?: string[];
    kronosV2Widgets?: Record<string, PenWidgetGeometry>;
    scene: OSScene;
    desktopLayout?: "focused" | "freeform";
    previousScene?: Exclude<OSScene, { kind: "overview" }>;
    selectedEntityId?: string;
    view: KronTermOSView;
};

export type OSWindowLayout = {
    bounds: SpatialRect;
    presentation: OSWindowPresentation;
    rotateY: number;
    scale: number;
    opacity: number;
    zIndex: number;
};

export type OSDockHitTarget = {
    targetBlockId: string;
    side: "left" | "right";
    bounds: SpatialRect;
};

export type OSSpatialAction =
    | OSTabAction
    | { type: "spatial.focus"; blockId: string }
    | { type: "os.window.focus"; blockId: string }
    | { type: "spatial.move"; blockId: string; x: number; y: number }
    | { type: "os.window.move"; blockId: string; x: number; y: number }
    | { type: "spatial.resize"; blockId: string; width: number; height: number }
    | { type: "os.window.resize"; blockId: string; width: number; height: number }
    | { type: "spatial.dock"; blockId: string; targetBlockId: string; side: "left" | "right" }
    | { type: "os.window.snap"; blockId: string; targetBlockId: string; side: "left" | "right" }
    | { type: "spatial.detach"; blockId: string }
    | { type: "spatial.collapse"; blockId: string }
    | { type: "os.window.minimize"; blockId: string }
    | { type: "spatial.restore"; blockId: string }
    | { type: "os.window.restore"; blockId: string }
    | { type: "os.window.maximize"; blockId: string }
    | { type: "spatial.showOverview"; selectedBlockId?: string }
    | { type: "os.window.overview"; selectedBlockId?: string }
    | { type: "spatial.restoreScene" }
    | { type: "spatial.freeform" }
    | { type: "spatial.setDivider"; groupId?: string; left: string; right: string; ratio: number }
    | { type: "os.view.set"; view: KronTermOSView }
    | { type: "spatial.setWidgetPresentation"; presentation: KronTermOSView }
    | { type: "os.window.setBounds"; blockId: string; bounds: SpatialRect }
    | { type: "os.window.arrangeBounds"; bounds: Record<string, SpatialRect> };

const CanonicalOSControlAliases: Record<string, string> = {
    "os.window.focus": "spatial.focus",
    "os.window.move": "spatial.move",
    "os.window.resize": "spatial.resize",
    "os.window.snap": "spatial.dock",
    "os.window.minimize": "spatial.collapse",
    "os.window.restore": "spatial.restore",
    "os.window.overview": "spatial.showOverview",
    "os.space.switch": "spatial.switchWorkspace",
    "os.resource.open": "spatial.openFile",
};

/**
 * Agents speak canonical `os.*` names; the control provider still branches on the
 * `spatial.*` compatibility names, so rewrite before dispatch. `os.app.launch` picks
 * between a native app stream and a KronTerm view from the supplied fields.
 */
export function resolveOSControlAction<T extends { action: string; appid?: string; view?: string }>(input: T): T {
    if (input.action === "os.app.launch") {
        return { ...input, action: input.appid ? "spatial.openApp" : "spatial.open" };
    }
    const alias = CanonicalOSControlAliases[input.action];
    return alias ? { ...input, action: alias } : input;
}

export function getOSSurfaceCamera(state: OSModeState): SpatialViewport {
    return state.scene.kind === "freeform" ? state.camera : { x: 0, y: 0, zoom: 1 };
}

export function findOSDockHitTarget(
    draggedBlockId: string,
    pointer: { x: number; y: number },
    layouts: Record<string, Pick<OSWindowLayout, "bounds" | "opacity" | "presentation" | "zIndex">>
): OSDockHitTarget | undefined {
    const candidates = Object.entries(layouts)
        .filter(([blockId, layout]) => {
            if (blockId === draggedBlockId || layout.opacity <= 0 || layout.presentation === "collapsed") return false;
            const { x, y, width, height } = layout.bounds;
            return pointer.x >= x && pointer.x <= x + width && pointer.y >= y && pointer.y <= y + height;
        })
        .sort(([, a], [, b]) => b.zIndex - a.zIndex);
    const [targetBlockId, target] = candidates[0] ?? [];
    if (!targetBlockId || !target) return undefined;
    return {
        targetBlockId,
        side: pointer.x < target.bounds.x + target.bounds.width / 2 ? "left" : "right",
        bounds: target.bounds,
    };
}

function defaultWindowBounds(index: number, view?: string): SpatialRect {
    if (resolveBlockView(view) === "hermes") return { x: 0, y: 112, width: 300, height: 720 };
    if (view === "web") return { x: 320, y: 112, width: 1050, height: 1000 };
    if (view === "appstream") return { x: 1390, y: 140, width: 360, height: 780 };
    if (view === "preview") return { x: 1390, y: 150, width: 360, height: 780 };
    if (view === "term") return { x: 52, y: 760, width: 360, height: 230 };
    const desktop = [
        { x: 360, y: 120, width: 520, height: 600 },
        { x: 920, y: 100, width: 900, height: 620 },
        { x: 120, y: 710, width: 720, height: 460 },
        { x: 980, y: 720, width: 760, height: 470 },
    ];
    if (index < desktop.length) return desktop[index];
    const column = index % 3;
    const row = Math.floor(index / 3);
    return { x: 180 + column * 520, y: 160 + row * 380, width: 680, height: 440 };
}

function overlapsExistingWindow(bounds: SpatialRect, occupied: SpatialRect[]): boolean {
    return occupied.some((other) => {
        const overlapWidth = Math.max(
            0,
            Math.min(bounds.x + bounds.width, other.x + other.width) - Math.max(bounds.x, other.x)
        );
        const overlapHeight = Math.max(
            0,
            Math.min(bounds.y + bounds.height, other.y + other.height) - Math.max(bounds.y, other.y)
        );
        const overlapArea = overlapWidth * overlapHeight;
        const smallerArea = Math.min(bounds.width * bounds.height, other.width * other.height);
        return smallerArea > 0 && overlapArea / smallerArea > 0.82;
    });
}

function unoccupiedDefaultWindowBounds(index: number, occupied: SpatialRect[], view?: string): SpatialRect {
    const initial = defaultWindowBounds(index, view);
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = {
            ...initial,
            x: initial.x + attempt * 72,
            y: initial.y + attempt * 56,
        };
        if (!overlapsExistingWindow(candidate, occupied)) return candidate;
    }
    return { ...initial, x: initial.x + 144, y: initial.y + 112 };
}

function readStoredLayout(tabData: Tab): Partial<OSModeState> | undefined {
    const meta = (tabData as any)?.meta as Record<string, any> | undefined;
    return meta?.["layout:os"] as Partial<OSModeState> | undefined;
}

function readCanvasSeed(tabData: Tab): {
    camera?: SpatialViewport;
    rects?: Record<string, SpatialRect>;
    objects?: any[];
} {
    const meta = (tabData as any)?.meta as Record<string, any> | undefined;
    return (meta?.["layout:canvas"] ?? {}) as {
        camera?: SpatialViewport;
        rects?: Record<string, SpatialRect>;
        objects?: any[];
    };
}

const OSCanvasObjectKinds = new Set<OSCanvasObjectKind>([
    "file",
    "folder",
    "repository",
    "url",
    "app-shortcut",
    "agent-task",
    "generated-artifact",
    "note",
    "widget",
    "rectangle",
    "ellipse",
    "diamond",
    "pen-layer",
    "connector",
]);

function normalizeSeedObjects(objects: any[] | undefined): OSCanvasObject[] {
    return (objects ?? [])
        .filter((object) => OSCanvasObjectKinds.has(object?.kind))
        .map((object) => ({
            id: String(object.id),
            kind: object.kind,
            x: Number(object.x) || 0,
            y: Number(object.y) || 0,
            width: Math.max(object.kind === "pen-layer" ? 1 : 24, Number(object.width) || 240),
            height: Math.max(object.kind === "pen-layer" ? 1 : 24, Number(object.height) || 176),
            text: object.text,
            name: object.name,
            pen: object.kind === "pen-layer" ? object.pen : undefined,
            color: object.color,
            fromObjectId: object.fromObjectId,
            toObjectId: object.toObjectId,
            resource: object.resource,
            appId: object.appId,
            agentSessionId: object.agentSessionId,
            artifactId: object.artifactId,
            render: object.render,
        }));
}

export function migrateOSModeState(stored: Partial<OSModeState> | undefined): Partial<OSModeState> | undefined {
    if (stored == null) return undefined;
    const storedVersion = Number(stored.version) || 1;
    if (storedVersion > OSLayoutVersion) return undefined;
    return {
        ...stored,
        version: OSLayoutVersion,
        windows: Object.fromEntries(
            Object.entries(stored.windows ?? {}).map(([blockId, window]) => [
                blockId,
                {
                    ...window,
                    bounds: {
                        ...window.bounds,
                        width: Math.max(OSWindowMinimumWidth, window.bounds.width),
                        height: Math.max(OSWindowMinimumHeight, window.bounds.height),
                    },
                },
            ])
        ),
        zOrder: stored.zOrder ?? [],
        groups: Object.fromEntries(
            Object.entries(stored.groups ?? {}).map(([id, group]) => {
                if (Array.isArray(group.blockIds)) return [id, group];
                const legacy = group as OSWindowGroup & {
                    sideBlockId: string;
                    side: "left" | "right";
                    dividerRatio: number;
                };
                const { primaryBlockId, sideBlockId, side, dividerRatio } = legacy;
                const ratio = Number.isFinite(dividerRatio) ? Math.max(0.2, Math.min(0.8, dividerRatio)) : 0.31;
                return [
                    id,
                    {
                        id,
                        primaryBlockId,
                        blockIds: side === "left" ? [sideBlockId, primaryBlockId] : [primaryBlockId, sideBlockId],
                        weights: { [sideBlockId]: 2 * ratio, [primaryBlockId]: 2 * (1 - ratio) },
                    },
                ];
            })
        ),
        objects: stored.objects == null ? undefined : normalizeSeedObjects(stored.objects),
        scene: stored.scene ?? { kind: "freeform" },
        view: "kronos-v2",
    };
}

function filterOSGroups(groups: OSModeState["groups"], keep: (blockId: string) => boolean): OSModeState["groups"] {
    const next: OSModeState["groups"] = {};
    for (const group of Object.values(groups)) {
        const blockIds = group.blockIds.filter(keep);
        if (blockIds.length < 2) continue;
        next[group.id] =
            blockIds.length === group.blockIds.length
                ? group
                : {
                      ...group,
                      blockIds,
                      primaryBlockId: blockIds.includes(group.primaryBlockId) ? group.primaryBlockId : blockIds[0],
                      weights: Object.fromEntries(blockIds.map((id) => [id, group.weights?.[id] ?? 1])),
                  };
    }
    return next;
}

export function makeInitialOSModeState(
    tabData: Tab,
    blockIds: string[],
    viewByBlockId: Record<string, string> = {}
): OSModeState {
    const originalStored = readStoredLayout(tabData);
    const stored = migrateOSModeState(originalStored);
    const seed = readCanvasSeed(tabData);
    const storedWindows = stored?.windows ?? {};
    const windows = Object.fromEntries(
        blockIds.map((blockId, index) => {
            if (storedWindows[blockId]) return [blockId, storedWindows[blockId]];
            const seedBounds = originalStored == null ? seed.rects?.[blockId] : undefined;
            const view = viewByBlockId[blockId];
            return [
                blockId,
                {
                    blockId,
                    bounds: seedBounds ?? defaultWindowBounds(index, view),
                    zOrder: index,
                    provisional: (seedBounds == null && view == null) || undefined,
                },
            ];
        })
    );
    const zOrder = (stored?.zOrder?.length ? stored.zOrder : blockIds).filter((blockId) => blockIds.includes(blockId));
    for (const blockId of blockIds) {
        if (!zOrder.includes(blockId)) zOrder.push(blockId);
    }
    const defaultFocusedId =
        stored?.selectedEntityId && windows[stored.selectedEntityId] && !windows[stored.selectedEntityId].collapsed
            ? stored.selectedEntityId
            : [...zOrder].reverse().find((id) => !windows[id].collapsed);
    return reconcileOSModeState(
        {
            version: OSLayoutVersion,
            camera: stored?.camera ??
                (originalStored == null ? seed.camera : undefined) ?? {
                    x: 32,
                    y: 20,
                    zoom: 0.82,
                },
            windows,
            zOrder,
            sceneOrder: stored?.sceneOrder,
            groups: stored?.groups ?? {},
            carouselWeights: stored?.carouselWeights,
            tabGroups: stored?.tabGroups ?? [],
            objects: stored?.objects ?? normalizeSeedObjects(seed.objects),
            loadedPenPaths: stored?.loadedPenPaths,
            kronosV2Widgets: stored?.kronosV2Widgets,
            scene:
                stored?.scene && (stored.scene.kind !== "freeform" || stored.desktopLayout === "freeform")
                    ? stored.scene
                    : defaultFocusedId
                      ? {
                            kind: "focused",
                            blockId: defaultFocusedId,
                        }
                      : { kind: "freeform" },
            desktopLayout: stored?.desktopLayout ?? "focused",
            previousScene: stored?.previousScene,
            selectedEntityId: stored?.selectedEntityId,
            view: "kronos-v2",
        },
        blockIds
    );
}

export function reconcileOSModeState(
    state: OSModeState,
    blockIds: string[],
    viewByBlockId: Record<string, string> = {}
): OSModeState {
    const occupied = blockIds.flatMap((blockId) =>
        state.windows[blockId] && !state.windows[blockId].provisional ? [state.windows[blockId].bounds] : []
    );
    const windows: Record<string, OSWindowState> = {};
    blockIds.forEach((blockId, index) => {
        const existing = state.windows[blockId];
        const view = viewByBlockId[blockId];
        if (existing && !existing.provisional) {
            windows[blockId] = existing;
            return;
        }
        if (existing && view == null) {
            windows[blockId] = existing;
            occupied.push(existing.bounds);
            return;
        }
        const bounds = unoccupiedDefaultWindowBounds(index, occupied, view);
        windows[blockId] = existing
            ? { ...existing, bounds, provisional: undefined }
            : { blockId, bounds, zOrder: index, provisional: view == null || undefined };
        occupied.push(bounds);
    });
    const zOrder = state.zOrder.filter((blockId) => blockIds.includes(blockId));
    for (const blockId of blockIds) if (!zOrder.includes(blockId)) zOrder.push(blockId);
    const groups = filterOSGroups(state.groups, (id) => !!windows[id] && !windows[id].collapsed);
    let scene = state.scene;
    if (scene.kind === "focused" && !blockIds.includes(scene.blockId)) scene = { kind: "freeform" };
    if (scene.kind === "focused" && windows[scene.blockId]?.collapsed) scene = { kind: "freeform" };
    if (scene.kind === "grouped" && !groups[scene.groupId]) scene = { kind: "freeform" };
    if (scene.kind === "overview" && scene.selectedBlockId && !blockIds.includes(scene.selectedBlockId)) {
        scene = { kind: "overview", selectedBlockId: blockIds[0] };
    }
    return {
        ...state,
        version: OSLayoutVersion,
        windows,
        zOrder,
        sceneOrder: reconcileOSSceneOrder(state.sceneOrder, zOrder, state.objects),
        groups,
        scene,
        tabGroups: reconcileOSTabGroups(state.tabGroups, blockIds),
    };
}

export function arrangeOSLaunchedWindows(
    previous: OSModeState,
    next: OSModeState,
    viewport: { width: number; height: number; rightInset?: number }
): OSModeState {
    const added = Object.keys(next.windows).filter((id) => !previous.windows[id]);
    const visible = Object.keys(next.windows).filter((id) => !next.windows[id].collapsed);
    if (
        added.length !== 1 ||
        visible.length > 2 ||
        viewport.width < 720 ||
        next.view !== "canvas" ||
        previous.scene.kind === "overview" ||
        previous.scene.kind === "grouped" ||
        (previous.scene.kind === "freeform" &&
            Object.keys(previous.windows).length > 0 &&
            (previous.camera.zoom !== 1 || previous.camera.x !== 0 || previous.camera.y !== 0)) ||
        visible.some((id) => next.windows[id].maximized) ||
        Object.keys(next.groups).length > 0
    )
        return next;
    const margin = 28;
    const available = viewport.width - margin * 2 - (viewport.rightInset ?? 0);
    const height = Math.max(220, Math.min(720, viewport.height - 112));
    const width = visible.length === 1 ? Math.min(960, available) : Math.floor((available - 16) / 2);
    if (width < 320) return next;
    const ordered = [...visible.filter((id) => !added.includes(id)), ...added];
    const windows = { ...next.windows };
    ordered.forEach((id, index) => {
        windows[id] = {
            ...windows[id],
            provisional: undefined,
            bounds: {
                x: visible.length === 1 ? Math.round((viewport.width - width) / 2) : margin + index * (width + 16),
                y: 80,
                width,
                height,
            },
        };
    });
    return { ...next, windows, camera: { x: 0, y: 0, zoom: 1 }, scene: { kind: "freeform" } };
}

export function reduceOSModeState(state: OSModeState, action: OSSpatialAction): OSModeState {
    if (action.type === "os.tabs.group" || action.type === "os.tabs.detach" || action.type === "os.tabs.reorder")
        return reduceOSTabs(state, action);
    if (action.type === "spatial.focus" || action.type === "os.window.focus") {
        if (!state.windows[action.blockId]) return state;
        const group =
            action.type === "spatial.focus"
                ? Object.values(state.groups).find((item) => item.blockIds.includes(action.blockId))
                : undefined;
        const keepCanvas =
            action.type === "os.window.focus" && state.scene.kind === "freeform" && state.desktopLayout === "freeform";
        return {
            ...state,
            scene: keepCanvas
                ? state.scene
                : group
                  ? { kind: "grouped", groupId: group.id }
                  : { kind: "focused", blockId: action.blockId },
            desktopLayout: keepCanvas ? state.desktopLayout : "focused",
            selectedEntityId: action.blockId,
            tabGroups: state.tabGroups?.map((group) =>
                group.blockIds.includes(action.blockId) ? { ...group, activeBlockId: action.blockId } : group
            ),
            zOrder: [...state.zOrder.filter((id) => id !== action.blockId), action.blockId],
            sceneOrder: raiseOSSceneOrder(state, [action.blockId]),
            windows: { ...state.windows, [action.blockId]: { ...state.windows[action.blockId], collapsed: false } },
        };
    }
    if (action.type === "os.window.setBounds" || action.type === "os.window.arrangeBounds") {
        const updates = action.type === "os.window.setBounds" ? { [action.blockId]: action.bounds } : action.bounds;
        const ids = Object.keys(updates).filter((id) => state.windows[id]);
        if (ids.length === 0) return state;
        const windows = { ...state.windows };
        for (const id of ids) {
            const bounds = updates[id];
            windows[id] = {
                ...windows[id],
                collapsed: false,
                maximized: false,
                provisional: undefined,
                bounds: {
                    x: Math.round(bounds.x),
                    y: Math.round(bounds.y),
                    width: Math.max(320, Math.round(bounds.width)),
                    height: Math.max(220, Math.round(bounds.height)),
                },
            };
        }
        const raised = action.type === "os.window.setBounds" ? [action.blockId] : ids;
        return {
            ...state,
            windows,
            // Arranged windows are side by side, so any grouping or maximized scene is dissolved.
            groups: filterOSGroups(state.groups, (id) => !ids.includes(id)),
            scene: { kind: "freeform" },
            selectedEntityId: action.type === "os.window.setBounds" ? action.blockId : state.selectedEntityId,
            zOrder: [...state.zOrder.filter((id) => !raised.includes(id)), ...raised],
            sceneOrder: raiseOSSceneOrder(state, raised),
        };
    }
    if (
        action.type === "spatial.move" ||
        action.type === "os.window.move" ||
        action.type === "spatial.resize" ||
        action.type === "os.window.resize"
    ) {
        const current = state.windows[action.blockId];
        if (!current) return state;
        const bounds =
            action.type === "spatial.move" || action.type === "os.window.move"
                ? { ...current.bounds, x: action.x, y: action.y }
                : { ...current.bounds, width: Math.max(320, action.width), height: Math.max(220, action.height) };
        return {
            ...state,
            windows: { ...state.windows, [action.blockId]: { ...current, bounds, provisional: undefined } },
        };
    }
    if (action.type === "spatial.dock" || action.type === "os.window.snap") {
        if (
            action.blockId === action.targetBlockId ||
            !state.windows[action.blockId] ||
            !state.windows[action.targetBlockId]
        ) {
            return state;
        }
        const activeGroup = state.scene.kind === "grouped" ? state.groups[state.scene.groupId] : undefined;
        const targetGroup = activeGroup?.blockIds.includes(action.targetBlockId)
            ? activeGroup
            : Object.values(state.groups).find((group) => group.blockIds.includes(action.targetBlockId));
        const groups = filterOSGroups(state.groups, (id) => id !== action.blockId);
        const groupId = targetGroup?.id ?? `group-${action.targetBlockId}-${action.blockId}`;
        const blockIds = targetGroup?.blockIds.filter((id) => id !== action.blockId) ?? [action.targetBlockId];
        const targetIndex = blockIds.indexOf(action.targetBlockId);
        blockIds.splice(targetIndex + (action.side === "right" ? 1 : 0), 0, action.blockId);
        groups[groupId] = {
            id: groupId,
            primaryBlockId: targetGroup?.primaryBlockId ?? action.targetBlockId,
            blockIds,
            weights: targetGroup?.weights ?? { [action.blockId]: 0.62, [action.targetBlockId]: 1.38 },
        };
        return {
            ...state,
            groups,
            windows: {
                ...state.windows,
                [action.blockId]: { ...state.windows[action.blockId], collapsed: false, maximized: false },
                [action.targetBlockId]: { ...state.windows[action.targetBlockId], collapsed: false, maximized: false },
            },
            scene: { kind: "grouped", groupId },
            selectedEntityId: action.targetBlockId,
        };
    }
    if (action.type === "spatial.detach") {
        const current = Object.values(state.groups).find((group) => group.blockIds.includes(action.blockId));
        if (!current) return state;
        const groups = filterOSGroups(state.groups, (id) => id !== action.blockId);
        const active = state.scene.kind === "grouped" && state.scene.groupId === current.id;
        const remaining = groups[current.id]?.primaryBlockId ?? current.blockIds.find((id) => id !== action.blockId);
        return {
            ...state,
            groups,
            scene: active && !groups[current.id] ? { kind: "focused", blockId: remaining } : state.scene,
            selectedEntityId: active && state.selectedEntityId === action.blockId ? remaining : state.selectedEntityId,
        };
    }
    if (
        action.type === "spatial.collapse" ||
        action.type === "os.window.minimize" ||
        action.type === "spatial.restore" ||
        action.type === "os.window.restore"
    ) {
        const current = state.windows[action.blockId];
        if (!current) return state;
        const minimizing = action.type === "spatial.collapse" || action.type === "os.window.minimize";
        const containingGroup = Object.values(state.groups).find((group) => group.blockIds.includes(action.blockId));
        const groups = minimizing ? filterOSGroups(state.groups, (id) => id !== action.blockId) : state.groups;
        let scene = state.scene;
        if (
            minimizing &&
            containingGroup &&
            state.scene.kind === "grouped" &&
            state.scene.groupId === containingGroup.id
        ) {
            if (!groups[containingGroup.id]) {
                scene = { kind: "focused", blockId: containingGroup.blockIds.find((id) => id !== action.blockId) };
            }
        } else if (minimizing && state.scene.kind === "focused" && state.scene.blockId === action.blockId) {
            const nextId = [...state.zOrder]
                .reverse()
                .find((id) => id !== action.blockId && !state.windows[id]?.collapsed);
            scene = nextId ? { kind: "focused", blockId: nextId } : { kind: "freeform" };
        } else if (!current.collapsed && current.maximized) {
            scene =
                state.desktopLayout === "freeform"
                    ? { kind: "freeform" }
                    : { kind: "focused", blockId: action.blockId };
        } else if (current.collapsed && current.maximized) {
            scene = { kind: "focused", blockId: action.blockId };
        }
        const unmaximizing = !minimizing && !current.collapsed && current.maximized;
        return {
            ...state,
            groups,
            scene,
            selectedEntityId:
                minimizing && state.selectedEntityId === action.blockId
                    ? scene.kind === "grouped"
                        ? groups[scene.groupId]?.primaryBlockId
                        : scene.kind === "focused"
                          ? scene.blockId
                          : undefined
                    : state.selectedEntityId,
            windows: {
                ...state.windows,
                [action.blockId]: {
                    ...current,
                    collapsed: minimizing,
                    maximized: unmaximizing ? false : current.maximized,
                    bounds: unmaximizing && current.restoreBounds ? current.restoreBounds : current.bounds,
                    restoreBounds: unmaximizing ? undefined : current.restoreBounds,
                },
            },
        };
    }
    if (action.type === "os.window.maximize") {
        const current = state.windows[action.blockId];
        if (!current) return state;
        return {
            ...state,
            desktopLayout:
                state.view === "canvas" && state.scene.kind === "freeform" ? "freeform" : state.desktopLayout,
            scene: { kind: "focused", blockId: action.blockId },
            selectedEntityId: action.blockId,
            zOrder: [...state.zOrder.filter((id) => id !== action.blockId), action.blockId],
            sceneOrder: raiseOSSceneOrder(state, [action.blockId]),
            windows: {
                ...state.windows,
                [action.blockId]: {
                    ...current,
                    collapsed: false,
                    maximized: true,
                    restoreBounds: current.maximized ? current.restoreBounds : current.bounds,
                },
            },
        };
    }
    if (action.type === "spatial.showOverview" || action.type === "os.window.overview") {
        const selectedBlockId = action.selectedBlockId ?? state.selectedEntityId ?? state.zOrder.at(-1);
        return {
            ...state,
            previousScene: state.scene.kind === "overview" ? state.previousScene : state.scene,
            scene: { kind: "overview", selectedBlockId },
            selectedEntityId: selectedBlockId,
        };
    }
    if (action.type === "spatial.restoreScene") {
        const previous = state.previousScene;
        const scene = previous?.kind === "grouped" && !state.groups[previous.groupId] ? undefined : previous;
        return { ...state, scene: scene ?? { kind: "freeform" }, previousScene: undefined };
    }
    if (action.type === "spatial.freeform") {
        return { ...state, scene: { kind: "freeform" }, desktopLayout: "freeform", previousScene: undefined };
    }
    if (action.type === "spatial.setDivider") {
        const group = action.groupId ? state.groups[action.groupId] : undefined;
        if (
            !Number.isFinite(action.ratio) ||
            action.left === action.right ||
            !state.windows[action.left] ||
            !state.windows[action.right] ||
            (action.groupId
                ? !group?.blockIds.includes(action.left) || !group.blockIds.includes(action.right)
                : state.scene.kind !== "focused" || state.windows[state.scene.blockId]?.maximized)
        )
            return state;
        const combined = getOSPaneWeight(state, action.left, group) + getOSPaneWeight(state, action.right, group);
        const ratio = Math.max(0.2, Math.min(0.8, action.ratio));
        const weights = {
            ...(group ? group.weights : state.carouselWeights),
            [action.left]: combined * ratio,
            [action.right]: combined * (1 - ratio),
        };
        if (!group) return { ...state, carouselWeights: weights };
        return {
            ...state,
            groups: {
                ...state.groups,
                [action.groupId]: {
                    ...group,
                    weights,
                },
            },
        };
    }
    return state;
}

function preferredFocusBounds(
    view: string,
    viewport: { width: number; height: number; rightInset?: number }
): SpatialRect {
    const shellHeight = 72;
    const margin = viewport.width < 900 ? 12 : 24;
    const railWidth = viewport.width > 900 ? (viewport.rightInset ?? 96) : 0;
    const availableWidth = Math.max(1, viewport.width - margin * 2 - railWidth);
    const width = resolveBlockView(view) === "hermes" ? Math.min(1120, availableWidth) : availableWidth;
    const height = Math.max(1, viewport.height - shellHeight - 36);
    return {
        x: Math.round(margin + (availableWidth - width) / 2),
        y: shellHeight,
        width: Math.round(width),
        height: Math.round(height),
    };
}

export function getOSCarouselOrder(state: OSModeState): string[] {
    return Object.keys(state.windows).filter((id) => {
        if (state.windows[id].collapsed) return false;
        const group = getOSTabGroup(state, id);
        const active =
            group &&
            (state.windows[group.activeBlockId]?.collapsed
                ? group.blockIds.find((item) => !state.windows[item]?.collapsed)
                : group.activeBlockId);
        return !group || id === active;
    });
}

export function getOSCarouselNeighbor(state: OSModeState, direction: -1 | 1): string | undefined {
    if (state.scene.kind !== "focused") return;
    const order = getOSCarouselOrder(state);
    const index = order.indexOf(state.scene.blockId);
    return index < 0 ? undefined : order[index + direction];
}

export function getOSPaneNeighbor(state: OSModeState, direction: -1 | 1): string | undefined {
    if (state.view !== "canvas") return;
    if (state.scene.kind === "focused") return getOSCarouselNeighbor(state, direction);
    const group = state.scene.kind === "grouped" ? state.groups[state.scene.groupId] : undefined;
    const order = group
        ? group.blockIds.filter((id) => state.windows[id] && !state.windows[id].collapsed)
        : getOSCarouselOrder(state);
    const selected = state.scene.kind === "overview" ? state.scene.selectedBlockId : state.selectedEntityId;
    const index = order.indexOf(selected);
    if (index >= 0) return order[index + direction];
    if (group) return order[order.indexOf(group.primaryBlockId) + direction];
    return direction === 1 ? order[0] : order.at(-1);
}

export const OSPaneGap = 6;
export const OSMinimumPaneWidth = 180;

export function getOSPaneWeight(state: OSModeState, id: string, group?: OSWindowGroup): number {
    if (group) return group.weights?.[id] || 1;
    return state.carouselWeights?.[id] || (state.scene.kind === "focused" && state.scene.blockId === id ? 2 : 1);
}

export function getOSAdjacentPanes(layouts: Record<string, OSWindowLayout>, compact: ReadonlySet<string>) {
    const panes = Object.entries(layouts)
        .filter(
            ([, layout]) =>
                layout.opacity > 0 &&
                ["focused", "carousel", "docked-left", "docked-right"].includes(layout.presentation)
        )
        .map(([id, { bounds }]) => ({ id, bounds }))
        .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);
    return panes.slice(1).flatMap((right, index) => {
        const left = panes[index];
        const gap = right.bounds.x - left.bounds.x - left.bounds.width;
        if (left.bounds.y !== right.bounds.y || gap < -1 || gap > OSPaneGap + 1) return [];
        if (compact.has(left.id) || compact.has(right.id)) return [];
        if (left.bounds.width + right.bounds.width <= 2 * OSMinimumPaneWidth) return [];
        return [{ left, right }];
    });
}

export function getOSPaneTakeover(
    state: OSModeState,
    blockId: string,
    dragged: SpatialRect,
    adjacent: ReturnType<typeof getOSAdjacentPanes>
): Extract<OSSpatialAction, { type: "spatial.setDivider" }> | undefined {
    if (state.scene.kind !== "focused" && state.scene.kind !== "grouped") return;
    const group = state.scene.kind === "grouped" ? state.groups[state.scene.groupId] : undefined;
    for (const { left, right } of adjacent) {
        const fromLeft = left.id === blockId;
        if (!fromLeft && right.id !== blockId) continue;
        const source = (fromLeft ? left : right).bounds;
        const target = (fromLeft ? right : left).bounds;
        const overlap = Math.min(dragged.x + dragged.width, target.x + target.width) - Math.max(dragged.x, target.x);
        const height = Math.min(dragged.y + dragged.height, target.y + target.height) - Math.max(dragged.y, target.y);
        if (overlap < 8 || height < Math.min(source.height, target.height) / 2) continue;
        const leftWeight = getOSPaneWeight(state, left.id, group);
        const rightWeight = getOSPaneWeight(state, right.id, group);
        const share = (fromLeft ? leftWeight : rightWeight) / (leftWeight + rightWeight);
        const gain = Math.min(0.28, overlap / target.width);
        const next = Math.min(0.8, Math.max(0.6, share + gain));
        return {
            type: "spatial.setDivider",
            groupId: group?.id,
            left: left.id,
            right: right.id,
            ratio: fromLeft ? next : 1 - next,
        };
    }
}

function layoutOSRow(
    ids: string[],
    area: SpatialRect,
    gap: number,
    compact: ReadonlySet<string> | undefined,
    weight: (id: string) => number
): Record<string, SpatialRect> {
    const available = Math.max(ids.length, area.width - gap * (ids.length - 1));
    const regular = ids.filter((id) => !compact?.has(id));
    const compactCount = ids.length - regular.length;
    const compactWidth = compactCount
        ? getSingleDeviceWorkspaceWidth(
              Math.max(1, (available - Math.min(regular.length * OSMinimumPaneWidth, available / 2)) / compactCount),
              area.height
          )
        : 0;
    const regularWidth = available - compactCount * compactWidth;
    const minimum = regular.length ? Math.min(OSMinimumPaneWidth, regularWidth / regular.length) : 0;
    const flexible = regularWidth - minimum * regular.length;
    const totalWeight = regular.reduce((sum, id) => sum + weight(id), 0);
    let x = regular.length ? area.x : area.x + (available - compactCount * compactWidth) / 2;
    return Object.fromEntries(
        ids.map((id) => {
            const width = compact?.has(id) ? compactWidth : minimum + (flexible * weight(id)) / totalWeight;
            const bounds = { ...area, x, width };
            x += width + gap;
            return [id, bounds];
        })
    );
}

function layoutOSGroup(
    state: OSModeState,
    group: OSWindowGroup,
    viewport: { width: number; height: number; rightInset?: number },
    compactDeviceBlocks?: ReadonlySet<string>
): Record<string, SpatialRect> {
    const gap = OSPaneGap;
    const margin = viewport.width < 900 ? 12 : 20;
    const width = Math.max(1, viewport.width - margin * 2 - (viewport.rightInset ?? 0));
    const top = 76;
    const bottom = 36;
    const maxColumns = Math.max(1, Math.floor((width + gap) / 300));
    const rows = Math.ceil(group.blockIds.length / maxColumns);
    const rowHeight = Math.max(1, (viewport.height - top - bottom - gap * (rows - 1)) / rows);
    const panes: Record<string, SpatialRect> = {};
    let offset = 0;
    for (let row = 0; row < rows; row++) {
        const size = Math.ceil((group.blockIds.length - offset) / (rows - row));
        const ids = group.blockIds.slice(offset, offset + size);
        Object.assign(
            panes,
            layoutOSRow(
                ids,
                { x: margin, y: top + row * (rowHeight + gap), width, height: rowHeight },
                gap,
                compactDeviceBlocks,
                (id) => getOSPaneWeight(state, id, group)
            )
        );
        offset += size;
    }
    return panes;
}

export function computeOSWindowLayout(
    state: OSModeState,
    blockId: string,
    view: string,
    viewport: { width: number; height: number; rightInset?: number },
    compactDeviceBlocks?: ReadonlySet<string>
): OSWindowLayout {
    const layout = computeOSWindowLayoutBase(state, blockId, view, viewport, compactDeviceBlocks);
    if (!compactDeviceBlocks?.has(blockId)) return layout;
    const bounds = layout.bounds;
    const width = getSingleDeviceWorkspaceWidth(bounds.width, bounds.height);
    return {
        ...layout,
        bounds: {
            ...bounds,
            x: layout.presentation === "freeform" ? bounds.x : bounds.x + (bounds.width - width) / 2,
            width,
        },
    };
}

function computeOSWindowLayoutBase(
    state: OSModeState,
    blockId: string,
    view: string,
    viewport: { width: number; height: number; rightInset?: number },
    compactDeviceBlocks?: ReadonlySet<string>
): OSWindowLayout {
    // a block can render one frame before reconcile registers its window
    const window: OSWindowState = state.windows[blockId] ?? {
        blockId,
        bounds: defaultWindowBounds(Object.keys(state.windows).length, view),
        zOrder: state.zOrder.length,
        provisional: true,
    };
    const base: OSWindowLayout = {
        bounds: window.bounds,
        presentation: window.collapsed ? "collapsed" : "freeform",
        rotateY: 0,
        scale: 1,
        opacity: window.collapsed ? 0 : 1,
        zIndex: Math.max(1, state.zOrder.indexOf(blockId) + 1),
    };
    if (state.scene.kind === "freeform") return base;
    if (state.scene.kind === "overview") {
        const visible = state.zOrder;
        const index = Math.max(0, visible.indexOf(blockId));
        const count = Math.max(1, visible.length);
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const gapX = 36;
        const gapY = 32;
        const topInset = 328;
        const cellWidth = Math.min(560, (viewport.width - 160 - gapX * (cols - 1)) / cols);
        const cellHeight = Math.min(420, (viewport.height - topInset - 60 - gapY * (rows - 1)) / rows);
        const gridWidth = cols * cellWidth + (cols - 1) * gapX;
        const gridHeight = rows * cellHeight + (rows - 1) * gapY;
        const startX = (viewport.width - gridWidth) / 2;
        const startY = topInset + (viewport.height - topInset - 60 - gridHeight) / 2;
        return {
            bounds: {
                x: Math.round(startX + (index % cols) * (cellWidth + gapX)),
                y: Math.round(startY + Math.floor(index / cols) * (cellHeight + gapY)),
                width: Math.round(cellWidth),
                height: Math.round(cellHeight),
            },
            presentation: "overview",
            rotateY: 0,
            scale: 1,
            opacity: 1,
            zIndex: 500 + index,
        };
    }
    if (window.collapsed) return base;
    const tabGroup = getOSTabGroup(state, blockId);
    if (state.scene.kind === "focused" && tabGroup && !getOSCarouselOrder(state).includes(blockId))
        return { ...base, opacity: 0, presentation: "collapsed" };
    let primaryBlockId: string;
    let group: OSWindowGroup | undefined;
    if (state.scene.kind === "grouped") {
        group = state.groups[state.scene.groupId];
        primaryBlockId = group?.primaryBlockId;
    } else {
        primaryBlockId = state.scene.blockId;
    }
    if (group?.blockIds.includes(blockId)) {
        const index = group.blockIds.indexOf(blockId);
        const primaryIndex = group.blockIds.indexOf(group.primaryBlockId);
        return {
            bounds: layoutOSGroup(state, group, viewport, compactDeviceBlocks)[blockId],
            presentation: index === primaryIndex ? "focused" : index < primaryIndex ? "docked-left" : "docked-right",
            rotateY: 0,
            scale: 1,
            opacity: 1,
            zIndex: 601 + index,
        };
    }
    if (state.scene.kind === "focused" && !state.windows[primaryBlockId]?.maximized) {
        const order = getOSCarouselOrder(state);
        const index = order.indexOf(blockId);
        const primaryIndex = order.indexOf(primaryBlockId);
        const offset = index - primaryIndex;
        const area = preferredFocusBounds("web", viewport);
        const count = Math.max(1, Math.min(order.length, Math.floor((area.width + OSPaneGap) / 360)));
        const start = Math.max(0, Math.min(primaryIndex - Math.floor((count - 1) / 2), order.length - count));
        const visible = order.slice(start, start + count);
        if (!visible.includes(blockId) && index >= 0) return { ...base, opacity: 0, presentation: "collapsed" };
        const tabsInset = visible.some((id) => getOSTabGroup(state, id)) ? 36 : 0;
        const row = layoutOSRow(
            visible.includes(blockId) ? visible : [blockId],
            {
                ...area,
                y: area.y + tabsInset,
                height: Math.max(1, area.height - tabsInset),
            },
            OSPaneGap,
            compactDeviceBlocks,
            (id) => getOSPaneWeight(state, id)
        );
        return {
            ...base,
            bounds: row[blockId],
            presentation: offset === 0 ? "focused" : "carousel",
            zIndex: offset === 0 ? 600 : 590 - Math.abs(offset),
        };
    }
    if (blockId === primaryBlockId) {
        return { ...base, bounds: preferredFocusBounds(view, viewport), presentation: "focused", zIndex: 600 };
    }
    // calm focused desktop: peripheral windows step aside entirely (dock, app stream, and overview reach them)
    return { ...base, opacity: 0, presentation: "collapsed" };
}

export { OSLayoutVersion };

export function recoverOSWindowBounds(
    bounds: SpatialRect,
    viewport: { width: number; height: number },
    topInset = 72
): SpatialRect {
    const minimumVisible = 72;
    const minX = minimumVisible - bounds.width;
    const maxX = viewport.width - minimumVisible;
    const minY = topInset;
    const maxY = Math.max(topInset, viewport.height - minimumVisible);
    return {
        ...bounds,
        x: Math.round(Math.min(maxX, Math.max(minX, bounds.x))),
        y: Math.round(Math.min(maxY, Math.max(minY, bounds.y))),
    };
}

const OSWindowChromeHeight = 43;
const OSWindowChromeWidth = 10;
const OSAspectTolerance = 0.02;

// Resize a window so its content area matches a stream's aspect ratio; keeps the width
// unless the result would overflow the visible world, then constrains by height instead.
export function fitOSWindowToContentAspect(
    bounds: SpatialRect,
    contentAspect: number,
    world: { width: number; height: number }
): SpatialRect | undefined {
    if (!(contentAspect > 0)) return undefined;
    const contentWidth = bounds.width - OSWindowChromeWidth;
    const contentHeight = bounds.height - OSWindowChromeHeight;
    if (contentWidth <= 0 || contentHeight <= 0) return undefined;
    if (Math.abs(contentWidth / contentHeight - contentAspect) / contentAspect < OSAspectTolerance) return undefined;
    const maxContentHeight = Math.max(160, world.height * 0.86 - OSWindowChromeHeight);
    let nextContentWidth = contentWidth;
    let nextContentHeight = contentWidth / contentAspect;
    if (nextContentHeight > maxContentHeight) {
        nextContentHeight = maxContentHeight;
        nextContentWidth = maxContentHeight * contentAspect;
    }
    return {
        x: bounds.x,
        y: bounds.y,
        width: Math.round(nextContentWidth + OSWindowChromeWidth),
        height: Math.round(nextContentHeight + OSWindowChromeHeight),
    };
}
