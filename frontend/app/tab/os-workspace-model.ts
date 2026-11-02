import { resolveBlockView } from "@/app/block/retired-chat-view";
// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { SpatialRect, SpatialViewport } from "@/app/spatial/spatial-engine";
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
    sideBlockId: string;
    side: "left" | "right";
    dividerRatio: number;
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
    | "connector"
    | "workflow-node";
export type OSCanvasColor = "amber" | "blue" | "green" | "rose" | "slate";

export type KronTermOSView = "canvas" | "file";

export type OSCanvasObject = SpatialRect & {
    id: string;
    kind: OSCanvasObjectKind;
    text?: string;
    color?: OSCanvasColor;
    fromObjectId?: string;
    toObjectId?: string;
    resource?: string;
    appId?: string;
    agentSessionId?: string;
    artifactId?: string;
};

export type OSModeState = {
    version: number;
    camera: SpatialViewport;
    windows: Record<string, OSWindowState>;
    zOrder: string[];
    sceneOrder?: string[];
    groups: Record<string, OSWindowGroup>;
    tabGroups?: OSTabGroup[];
    objects: OSCanvasObject[];
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
    | { type: "spatial.setDivider"; groupId: string; dividerRatio: number }
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
            width: Math.max(24, Number(object.width) || 240),
            height: Math.max(24, Number(object.height) || 176),
            text: object.text,
            color: object.color,
            fromObjectId: object.fromObjectId,
            toObjectId: object.toObjectId,
            resource: object.resource,
            appId: object.appId,
            agentSessionId: object.agentSessionId,
            artifactId: object.artifactId,
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
        groups: stored.groups ?? {},
        objects: stored.objects == null ? undefined : normalizeSeedObjects(stored.objects),
        scene: stored.scene ?? { kind: "freeform" },
        view:
            stored.view === "file" || (stored as { widgetPresentation?: string }).widgetPresentation === "file"
                ? "file"
                : "canvas",
    };
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
            tabGroups: stored?.tabGroups ?? [],
            objects: stored?.objects ?? normalizeSeedObjects(seed.objects),
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
            view:
                stored?.view === "file" || (stored as { widgetPresentation?: string })?.widgetPresentation === "file"
                    ? "file"
                    : "canvas",
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
    const groups = Object.fromEntries(
        Object.entries(state.groups).filter(
            ([, group]) =>
                blockIds.includes(group.primaryBlockId) &&
                blockIds.includes(group.sideBlockId) &&
                !windows[group.primaryBlockId]?.collapsed &&
                !windows[group.sideBlockId]?.collapsed
        )
    );
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
        const keepCanvas =
            action.type === "os.window.focus" && state.scene.kind === "freeform" && state.desktopLayout === "freeform";
        return {
            ...state,
            scene: keepCanvas ? state.scene : { kind: "focused", blockId: action.blockId },
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
            groups: Object.fromEntries(
                Object.entries(state.groups).filter(
                    ([, group]) => !ids.includes(group.primaryBlockId) && !ids.includes(group.sideBlockId)
                )
            ),
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
        const groups = Object.fromEntries(
            Object.entries(state.groups).filter(
                ([, group]) => ![action.blockId, action.targetBlockId].includes(group.sideBlockId)
            )
        );
        const groupId = `group-${action.targetBlockId}-${action.blockId}`;
        groups[groupId] = {
            id: groupId,
            primaryBlockId: action.targetBlockId,
            sideBlockId: action.blockId,
            side: action.side,
            dividerRatio: 0.31,
        };
        return { ...state, groups, scene: { kind: "grouped", groupId }, selectedEntityId: action.targetBlockId };
    }
    if (action.type === "spatial.detach") {
        const current = Object.values(state.groups).find((group) => group.sideBlockId === action.blockId);
        const groups = Object.fromEntries(
            Object.entries(state.groups).filter(([, group]) => group.sideBlockId !== action.blockId)
        );
        return {
            ...state,
            groups,
            scene: current ? { kind: "focused", blockId: current.primaryBlockId } : state.scene,
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
        const containingGroup = Object.values(state.groups).find(
            (group) => group.primaryBlockId === action.blockId || group.sideBlockId === action.blockId
        );
        const groups = minimizing
            ? Object.fromEntries(
                  Object.entries(state.groups).filter(
                      ([, group]) => group.sideBlockId !== action.blockId && group.primaryBlockId !== action.blockId
                  )
              )
            : state.groups;
        let scene = state.scene;
        if (
            minimizing &&
            containingGroup &&
            state.scene.kind === "grouped" &&
            state.scene.groupId === containingGroup.id
        ) {
            const remainingBlockId =
                containingGroup.primaryBlockId === action.blockId
                    ? containingGroup.sideBlockId
                    : containingGroup.primaryBlockId;
            scene = { kind: "focused", blockId: remainingBlockId };
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
        return { ...state, scene: state.previousScene ?? { kind: "freeform" }, previousScene: undefined };
    }
    if (action.type === "spatial.freeform") {
        return { ...state, scene: { kind: "freeform" }, desktopLayout: "freeform", previousScene: undefined };
    }
    if (action.type === "spatial.setDivider") {
        const group = state.groups[action.groupId];
        if (!group) return state;
        return {
            ...state,
            groups: {
                ...state.groups,
                [action.groupId]: { ...group, dividerRatio: Math.min(0.42, Math.max(0.22, action.dividerRatio)) },
            },
        };
    }
    if (action.type === "os.view.set" || action.type === "spatial.setWidgetPresentation") {
        const view = action.type === "os.view.set" ? action.view : action.presentation;
        if (state.view === view) return state;
        return { ...state, view };
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
    const height = Math.max(1, viewport.height - shellHeight - margin - 64);
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

export function computeOSWindowLayout(
    state: OSModeState,
    blockId: string,
    view: string,
    viewport: { width: number; height: number; rightInset?: number },
    phoneAspect?: number
): OSWindowLayout {
    const layout = computeOSWindowLayoutBase(state, blockId, view, viewport);
    if (!(phoneAspect > 0)) return layout;
    const bounds = layout.bounds;
    const width = Math.min(bounds.width, bounds.height * phoneAspect);
    const height = width / phoneAspect;
    return {
        ...layout,
        bounds: {
            x: bounds.x + (bounds.width - width) / 2,
            y: bounds.y + (bounds.height - height) / 2,
            width,
            height,
        },
    };
}

function computeOSWindowLayoutBase(
    state: OSModeState,
    blockId: string,
    view: string,
    viewport: { width: number; height: number; rightInset?: number }
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
    if (group && (blockId === group.primaryBlockId || blockId === group.sideBlockId)) {
        const outerWidth = Math.min(1540, viewport.width * 0.92);
        const outerHeight = Math.min(860, viewport.height * 0.78);
        const outerX = (viewport.width - outerWidth) / 2;
        const outerY = 72 + (viewport.height - 72 - outerHeight) / 2;
        const sideWidth = Math.max(280, outerWidth * group.dividerRatio);
        const gap = 8;
        const isSide = blockId === group.sideBlockId;
        const sideX = group.side === "left" ? outerX : outerX + outerWidth - sideWidth;
        const primaryX = group.side === "left" ? outerX + sideWidth + gap : outerX;
        return {
            bounds: {
                x: Math.round(isSide ? sideX : primaryX),
                y: Math.round(outerY),
                width: Math.round(isSide ? sideWidth : outerWidth - sideWidth - gap),
                height: Math.round(outerHeight),
            },
            presentation: isSide ? (group.side === "left" ? "docked-left" : "docked-right") : "focused",
            rotateY: 0,
            scale: 1,
            opacity: 1,
            zIndex: isSide ? 602 : 601,
        };
    }
    if (state.scene.kind === "focused" && !state.windows[primaryBlockId]?.maximized) {
        const order = getOSCarouselOrder(state);
        const offset = order.indexOf(blockId) - order.indexOf(primaryBlockId);
        const bounds = preferredFocusBounds("web", viewport);
        const peek = order.length > 1 ? Math.min(48, Math.round(viewport.width * 0.035)) : 0;
        const width = Math.max(1, bounds.width - peek * 2);
        return {
            ...base,
            bounds: {
                x: bounds.x + peek + offset * (width + 20),
                y: bounds.y + (tabGroup ? 36 : 0),
                width,
                height: Math.max(1, bounds.height - (order.length > 1 ? 44 : 0) - (tabGroup ? 36 : 0)),
            },
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
