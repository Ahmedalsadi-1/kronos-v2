# Phase 00 — Archived Architecture Audit + Motion Research

> **Status:** Archived. Perspective, edge-rail, and Cover Flow proposals in this audit were rejected by the current System UI direction. Follow `CORE_CONTEXT.md`, `UI_RULES.md`, and `MOTION_SPEC.md` for implementation.

---

## 1. Real Files, Components, and Stores

### Presentation system

| File | Role |
|------|------|
| `frontend/app/tab/workspace-presentation.ts` | Defines `WorkspacePresentations = ["widgets", "tabs", "canvas", "web"]` and `getAdjacentWorkspacePresentation()`. OS Mode will add `"os"` here. |
| `frontend/app/workspace/workspace.tsx` | Root workspace component. Reads `readWorkspacePresentation()` from `window.__krontermLayoutMode` / localStorage. Renders `KronarchyShell`, `TabContent`, `Widgets`, `WorkspaceWallpaper`. This is where OS Mode presentation will be mounted. |
| `frontend/app/workspace/kronarchy-shell.tsx` | Full-screen shell overlay with launcher, workspace switching (1-4), presentation switcher, clock, app dock. Reads/writes `LayoutModeStorageKey` and `KronarchyEnabledStorageKey` in localStorage. Calls `RpcApi.SetConfigCommand` for `app:layoutmode`. **This is the closest existing analog to the OS Mode shell.** |
| `frontend/app/workspace/workspace-layout-model.ts` | Singleton `WorkspaceLayoutModel` managing AI panel, vtab panel, widgets panel, side panel mode. Uses Jotai atoms + `globalStore`. |
| `frontend/app/tab/workspace-surface-runtime.ts` | Defines `WorkspaceSurfaceControlAction` (focus, move, resize, navigate, fit, arrange, add_note, update_object, delete_object, connect_objects) and `WorkspaceSurfaceModeProvider` with snapshot/control interface. **This is the existing control surface that OS Mode spatial actions should extend.** |

### Canvas / spatial engine

| File | Role |
|------|------|
| `frontend/app/tab/workspace-canvas.tsx` (3381 lines) | Full infinite-canvas implementation. Manages world coordinates, camera (pan/zoom), block positioning, drag, resize, momentum scrolling, snap guides, context menu, agent activity cards, composer context. Uses `WorkspaceCanvasRect` for block geometry. **This is the existing spatial engine to extract/refactor.** |
| `frontend/app/tab/workspace-canvas-utils.ts` | Canvas rect types and utility functions. |
| `frontend/app/tab/workspace-canvas-drift.ts` | Camera momentum, velocity decay, edge panning, directional rect finding, viewport rect computation, cluster finding. |
| `frontend/app/tab/workspace-canvas-agent.ts` | Agent activity cards on canvas, composer context nodes, request card management. |
| `frontend/app/tab/workspace-canvas-context.ts` | Composer context atoms and events for canvas. |
| `frontend/app/tab/workspace-canvas-task-graph.ts` | Aggregates agent runs into task graph visualization. |

### Block / session model

| File | Role |
|------|------|
| `frontend/app/block/block.tsx` | `BlockRegistry: Map<string, ViewModelClass>` — registers all view types (term, preview, web, waveai, kronoschat, chathubv2, help, tips, sysinfo, kronsettings, kronoschamber, kronoscanvas, launcher, vdom, appstream, installedapps, sandbox, warpagent, hermes, aifilediff). `makeViewModel()` instantiates from registry. `BlockInner` / `SubBlockInner` render blocks. |
| `frontend/app/block/blocktypes.ts` | `BlockNodeModel` interface: `blockId`, `isFocused`, `isMagnified`, `isFolded`, `onClose`, `focusNode`, `toggleMagnify`, `toggleFold`. `BlockProps`, `SubBlockProps`, `BlockFrameProps`. |
| `frontend/app/block/blockutil.tsx` | `blockViewToIcon()`, `blockViewToName()`, `resolveBlockIcon()` — view type to display name/icon mapping. |
| `frontend/app/store/tab-model.ts` | `TabModel` — per-tab state including block IDs, layout state. `useTabModel()` hook. |
| `frontend/app/store/global.ts` | `createBlock()`, `refocusNode()`, `focusedBlockId`, `getBlockComponentModel()`, `registerBlockComponentModel()`. Main store for block operations. |
| `frontend/app/store/wos.ts` | WOS (Wave Object Store) — `makeORef()`, `getWaveObjectAtom()`. Object identity management via atoms. **This is how session identity persists across presentation changes.** |

### View models (session types)

| File | View Type | ViewModel |
|------|-----------|-----------|
| `frontend/app/view/term/term-model.ts` | `term` | `TermViewModel` — PTY session, scrollback, shell state |
| `frontend/app/view/webview/webview.tsx` | `web` | `WebViewModel` — webview tag, URL, history, media state |
| `frontend/app/view/hermes/hermes-model.ts` | `hermes` | `HermesViewModel` — Hermes agent chat session |
| `frontend/app/view/chathubv2/chathubv2-model.ts` | `chathubv2` | `ChatHubV2ViewModel` — KronosChamber chat session |
| `frontend/app/view/preview/preview-model.ts` | `preview` | `PreviewModel` — file preview/editor |
| `frontend/app/view/kronoscanvas/kronoscanvas-model.ts` | `kronoscanvas` | `KronosCanvasViewModel` — tldraw-based canvas (separate from workspace canvas) |
| `frontend/app/view/sandbox/sandbox-model.ts` | `sandbox` | `SandboxViewModel` — isolated Linux desktop |
| `frontend/app/view/appstream/appstream-model.ts` | `appstream` | `AppStreamViewModel` — live native/remote app stream |

### Layout engine (widgets/tabs)

| File | Role |
|------|------|
| `frontend/layout/lib/layoutModel.ts` | `LayoutModel` — tree-based split layout for widgets/tabs. Manages panel sizes, split orientations, node positions. |
| `frontend/layout/lib/layoutModelHooks.ts` | `useLayoutModel()`, `useTileLayout()`, `useNodeModel()`, `useDebouncedNodeInnerRect()`. Layout model singleton per tab (`layoutModelMap`). |
| `frontend/layout/lib/types.ts` | `NodeModel`, `LayoutNode`, `TileLayoutContents`, `ContentRenderer`, `PreviewRenderer`. |
| `frontend/app/tab/widget-tabs-layout.tsx` (654 lines) | Tabs presentation. Renders blocks in browser-style tab strip with pane splitting. Agent workbench pairing, widget picker, drag tabs. |

### Persistence

| File | Role |
|------|------|
| `pkg/wstore/wstore_dbops.go` | `DBGetBlockViewCounts()` — block persistence queries. Blocks stored in SQLite `db_block` table with JSON metadata. |
| `frontend/app/workspace/workspace-layout-model.ts` | Layout persistence via `debouncedPersistSidePanelMode()`, panel sizes saved to tab metadata. |

---

## 2. State Ownership Graph

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main (emain)                    │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ PTY Manager  │  │ Webview Mgr  │  │ KronosCode Runtime │  │
│  │ (Go process) │  │ (Electron)   │  │ (managed process)  │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘  │
│         │                 │                     │             │
│         └─────────────────┼─────────────────────┘             │
│                           │ IPC (wshrpc)                      │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│              Renderer (React/Jotai)                           │
│                           │                                    │
│  ┌────────────────────────┼────────────────────────────────┐  │
│  │                   WOS (Wave Object Store)               │  │
│  │           Object identity via Jotai atoms               │  │
│  │  block:{id} → Atom<Block>  (meta.view, position, etc.)  │  │
│  │  tab:{id}   → Atom<Tab>    (blockIds, layout state)     │  │
│  └────────────────────────┼────────────────────────────────┘  │
│                           │                                    │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────────────┐ │
│  │ WorkspaceLay │  │  LayoutModel  │  │  WorkspaceCanvas     │ │
│  │ outModel     │  │  (per tab)    │  │  (canvas mode)       │ │
│  │ (singleton)  │  │               │  │                      │ │
│  │ - panels     │  │ - split tree  │  │ - camera {x,y,zoom}  │ │
│  │ - AI panel   │  │ - node rects  │  │ - block rects        │ │
│  │ - vtab panel │  │ - magnify     │  │ - momentum/drift     │ │
│  │ - widgets    │  │ - fold        │  │ - snap guides        │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              BlockRegistry (Map<view, ViewModelClass>)  │  │
│  │  term → TermViewModel    web → WebViewModel              │  │
│  │  hermes → HermesViewModel  chathubv2 → ChatHubV2VM      │  │
│  │  preview → PreviewModel  sandbox → SandboxViewModel     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │           WorkspaceSurfaceModeProvider                  │  │
│  │  snapshot() → { presentation, selectedblock, camera,    │  │
│  │                 rects, objects, contextids }             │  │
│  │  control({ action, blockid, x, y, w, h, direction })    │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

**Key insight:** WOS provides object identity. Blocks have stable ORefs (`block:{id}`). When a block moves from widgets → tabs → canvas, the same `block:{id}` atom and the same `ViewModel` instance survive. The presentation layer only changes *where* the block is rendered, not *what* it is.

---

## 3. Reusable Canvas Pieces

The existing `workspace-canvas.tsx` (3381 lines) contains reusable spatial primitives:

| Piece | Location | Reusability |
|-------|----------|-------------|
| Camera state `{x, y, zoom}` | workspace-canvas.tsx | Extract to `SpatialCamera` — shared by canvas + OS mode |
| World ↔ screen coordinate transforms | workspace-canvas-utils.ts | Extract to `SpatialEngine.worldToScreen()` / `screenToWorld()` |
| Block rect model `WorkspaceCanvasRect` | workspace-canvas-utils.ts | Reuse directly for OS mode window bounds |
| Momentum/velocity scrolling | workspace-canvas-drift.ts | Reuse for OS mode pan/drift |
| Snap guides | workspace-canvas.tsx | Reuse for OS mode window snapping |
| Drag handling | workspace-canvas.tsx | Extract drag logic to shared `SpatialDragController` |
| Resize handling | workspace-canvas.tsx | Extract resize logic to shared `SpatialResizeController` |
| Focus / z-order | workspace-canvas.tsx | Extract to `SpatialFocusManager` |
| Block rendering | `Block as BlockView` from block.tsx | Reuse directly — blocks render the same way in any presentation |
| Agent activity cards | workspace-canvas-agent.ts | Reuse for OS mode agent overlay |
| Composer context | workspace-canvas-context.ts | Reuse for OS mode agent context |

---

## 4. Extraction / Refactor Needs

### Step 1: Extract `SpatialEngine` interface

```typescript
// frontend/app/spatial/spatial-engine.ts

interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SpatialEngine {
    getViewport(): Viewport;
    setViewport(viewport: Viewport): void;
    worldToScreen(point: { x: number; y: number }): { x: number; y: number };
    screenToWorld(point: { x: number; y: number }): { x: number; y: number };
    moveNode(id: string, point: { x: number; y: number }): void;
    resizeNode(id: string, size: { width: number; height: number }): void;
    focusNode(id: string): void;
    getBounds(id: string): Rect;
    getZOrder(): string[];
    setZOrder(ids: string[]): void;
}
```

### Step 2: Implement `CanvasSpatialEngine`

Wrap the existing workspace-canvas.tsx camera/transform/drag/resize logic behind this interface. Do not rewrite the canvas — wrap it.

### Step 3: Implement `OSSpatialEngine`

OS Mode's spatial engine. Shares the same interface but adds:
- Scene state machine (freeform / focused / grouped / overview)
- Window grouping (WindowGroup)
- Edge carousel transforms
- Cover Flow transforms
- Per-app preferred focus geometry

### Step 4: Register `"os"` in WorkspacePresentations

```typescript
// frontend/app/tab/workspace-presentation.ts
const WorkspacePresentations = ["widgets", "tabs", "canvas", "os", "web"] as const;
```

### Step 5: Mount OS Mode in workspace.tsx

Add a conditional branch in `frontend/app/workspace/workspace.tsx` that renders the OS Mode shell when `presentation === "os"`.

---

## 5. Session Identity Model

**Canonical identity:** A KronTerm session is a **Block** identified by its ORef (`block:{id}`).

```
Block {
    blockId: string         // stable UUID
    meta: {
        view: string        // "term" | "web" | "hermes" | "chathubv2" | "preview" | ...
        [key: string]: any  // view-specific metadata (url, cwd, connection, etc.)
    }
    // Position/size is presentation-specific, NOT part of identity
}
```

**What survives presentation changes:**
- Block ORef (identity)
- Block metadata (view type, URL, cwd, connection, Hermes session ID)
- ViewModel instance (if the same block is re-rendered)
- Terminal PTY process (managed by Go backend, keyed by block ID)
- Browser webview state (managed by Electron, keyed by block ID)
- Hermes conversation (managed by Hermes runtime, keyed by session ID in block metadata)

**What changes between presentations:**
- Position/size (stored per-presentation in tab metadata or canvas rects)
- Visual chrome (frame, title bar, dock representation)
- Z-order/focus state

**Rule:** OS Mode must never create a new Block to represent an app that already exists in another presentation. It reads the same `tab:{id}` block list and renders those blocks in spatial windows.

---

## 6. OS Scene State Machine

```typescript
type OSScene =
    | { kind: "freeform" }
    | { kind: "focused"; sessionId: string }
    | { kind: "grouped"; groupId: string; primarySessionId: string; sideSessionId: string; side: "left" | "right" }
    | { kind: "overview"; selectedSessionId?: string };

type OSWindowPresentation =
    | "freeform"      // independently positioned
    | "focused"       // centered, dominant
    | "docked-left"   // side panel of a WindowGroup
    | "docked-right"  // side panel of a WindowGroup
    | "edge-left"     // perspective card in left rail
    | "edge-right"    // perspective card in right rail
    | "overview"      // Cover Flow card
    | "collapsed";    // minimized, not visible

interface OSWindowState {
    scene: OSScene;
    windows: Record<string, {
        blockId: string;
        presentation: OSWindowPresentation;
        bounds: Rect;           // world-space position/size
        zOrder: number;
    }>;
    groups: Record<string, {
        primarySessionId: string;
        leftPanelSessionId?: string;
        rightPanelSessionId?: string;
        dividerRatio: number;   // 0-1, position of divider
    }>;
    camera: Viewport;
    workspaceId: string;
}
```

**Transitions:**

```
freeform ──────click window──────▶ focused
focused ──────click background───▶ freeform
focused ──────drag Hermes to app─▶ grouped
grouped ──────detach Hermes──────▶ focused
grouped ──────collapse side──────▶ focused (solo)
focused ──────"show all"─────────▶ overview
overview ─────select + Enter─────▶ focused
focused ──────edge card click────▶ focused (swap)
freeform ──────edge card click───▶ focused
```

---

## 7. Motion Findings (Warmwind Research)

### What Warmwind demonstrates (from public demos and blog posts)

1. **Visible agent activity** — The AI's clicks, typing, and navigation are visible in real-time. The user can watch the agent work inside live applications.

2. **Teaching mode** — The AI observes the user's clicks and cursor to learn workflows. This is a recording/playback pattern, not a spatial motion pattern.

3. **Background persistence** — Closing the browser window does not stop the worker. The cloud desktop continues running. This maps to KronTerm's session persistence — closing a presentation does not destroy the session.

4. **App-centric workspace** — The workspace shows live applications (browser, email, spreadsheets) that the AI interacts with. The primary object is the live app, not a chat transcript.

5. **No proprietary motion assets to copy** — Warmwind's public demos show standard window management (open, focus, switch) without distinctive spatial transitions. The Cover Flow / edge carousel / 3D perspective motion language in our reference images is original to KronTerm OS Mode.

### Motion principles for OS Mode

| Principle | Implementation |
|-----------|----------------|
| Spatial continuity | Transitions use `transform` + `opacity`, never remount/fade |
| Camera-like movement | Freeform → Focused feels like the camera moves forward, not the window resizing |
| Spring physics | Use spring easing (not linear/ease) for primary transitions |
| 1:1 pointer drag | While grabbed, window follows pointer exactly (no easing) |
| Reduced motion | `prefers-reduced-motion` → instant transitions, no perspective transforms |
| No hidden remounts | The same DOM node (webview, terminal, hermes) persists through all scene changes |

### Recommended animation approach

Use Framer Motion's `layoutId` + `AnimatePresence` for spatial transitions. The `layoutId` pattern keeps the same DOM element mounted while animating its position/size between containers. This is critical for webview and terminal session continuity.

Alternatively, use CSS transforms with a shared transform context. The OS Mode root would be a single 3D-perspective container, and each window would be positioned with `transform: translate3d() scale() rotateY()`.

---

## 8. Performance Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Multiple live webviews in 3D perspective | High | Webviews are heavy. Limit visible webviews to 1-2. Edge carousel cards should be lightweight previews (scaled-down screenshots or reduced-rate renders), not full webviews. |
| Terminal rendering during perspective transform | Medium | xterm.js uses WebGL canvas. 3D transforms on canvas elements can cause rendering artifacts. Test with `will-change: transform` and `backface-visibility: hidden`. |
| 60fps animation with multiple blocks | Medium | Use `transform` and `opacity` only. Avoid animating `width`/`height`/`top`/`left`. Use `requestAnimationFrame`-throttled updates. |
| Memory from keeping all sessions mounted | High | OS Mode may show 5-10 windows. Each webview/terminal consumes significant memory. Consider a virtualization strategy: only render full-fidelity for focused + edge-visible windows. Collapsed/overview-distant windows render as cached snapshots. |
| Camera/world coordinate precision | Low | Use integer world coordinates. Avoid sub-pixel transforms. |
| Canvas vs OS mode dual engine | Medium | If both canvas and OS mode run simultaneously, they share camera state. Ensure only one is active per tab. |

---

## 9. Exact Implementation Sequence

### Phase 00 (this document) — COMPLETE

### Phase 01 — Spatial Desktop Baseline

**Files to create:**
- `frontend/app/view/osmode/osmode-model.ts` — `OSModeViewModel` implementing `ViewModel`
- `frontend/app/view/osmode/osmode.tsx` — main OS Mode view component
- `frontend/app/view/osmode/osmode-shell.tsx` — screen-space shell (dock, workspace selector, clock)
- `frontend/app/view/osmode/osmode-window.tsx` — world-space window wrapper for blocks
- `frontend/app/view/osmode/osmode.scss` — glass, borders, shadows, wallpaper
- `frontend/app/spatial/spatial-engine.ts` — `SpatialEngine` interface
- `frontend/app/spatial/canvas-spatial-engine.ts` — wrapper over existing canvas camera/transforms

**Files to modify:**
- `frontend/app/tab/workspace-presentation.ts` — add `"os"` to `WorkspacePresentations`
- `frontend/app/workspace/workspace.tsx` — add OS Mode rendering branch
- `frontend/app/block/blockutil.tsx` — add `blockViewToName("os")` mapping
- `frontend/app/block/block.tsx` — register `OSModeViewModel` in `BlockRegistry`

**Architecture:**
- OS Mode reads the tab's block list (same blocks as widgets/tabs/canvas)
- Renders each block in an `OSModeWindow` wrapper
- OS shell is screen-space (fixed position, no pan/zoom)
- Windows are world-space (absolute positioned within a transform context)
- Camera state {x, y, zoom} controls the world-space container transform

### Phase 02 — Browser + Hermes Docking

**Files to create:**
- `frontend/app/view/osmode/osmode-group.tsx` — `WindowGroup` component with divider
- `frontend/app/view/osmode/osmode-dock-zone.tsx` — docking preview overlay

**State additions:**
- `groups` map in `OSWindowState`
- Drag detection for Hermes → Browser docking

### Phase 03 — Framed Workspace

**Files to modify:**
- `frontend/app/view/osmode/osmode.tsx` — add peripheral window rendering with initial depth transforms
- `frontend/app/view/osmode/osmode-window.tsx` — add peripheral presentation mode

### Phase 04 — Visual Polish

**Files to modify:**
- `frontend/app/view/osmode/osmode.scss` — all visual properties
- `frontend/app/view/osmode/osmode-shell.tsx` — dock sizing, workspace number spacing

### Phase 05 — Terminal Focus

**Files to modify:**
- `frontend/app/view/osmode/osmode.tsx` — add per-app preferred focus geometry
- `frontend/app/view/osmode/osmode-window.tsx` — add focused vs peripheral presentation

### Phase 06-07 — Sheets + Hermes / Solo Browser

**Files to modify:**
- `frontend/app/view/osmode/osmode-group.tsx` — prove generic docking
- `frontend/app/view/osmode/osmode.tsx` — solo focus state, reclaim animation

### Phase 08 — Edge Carousels

**Files to create:**
- `frontend/app/view/osmode/osmode-edge-rail.tsx` — vertical perspective rail component
- `frontend/app/spatial/edge-transform.ts` — card transform function based on offset

### Phase 09 — Cover Flow Overview

**Files to create:**
- `frontend/app/view/osmode/osmode-overview.tsx` — Cover Flow overview component
- `frontend/app/spatial/coverflow-transform.ts` — Cover Flow layout function

**RPC additions:**
- `spatial.showOverview` action in workspace surface control

### Phase 10 — Agent Control + Regression

**Files to modify:**
- `frontend/app/tab/workspace-surface-runtime.ts` — add typed spatial actions
- `frontend/app/view/osmode/osmode.tsx` — observable activity display

---

## 10. Regression Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Adding `"os"` to WorkspacePresentations breaks presentation switching | All modes | Test `getAdjacentWorkspacePresentation()` with 5 presentations |
| OS Mode shell conflicts with Kronarchy shell | Visual | OS Mode shell should replace Kronarchy shell when active. Ensure only one shell renders at a time. |
| Block rendering in OS Mode breaks block focus/magnify | Focus system | OS Mode windows must call the same `focusNode()` / `toggleMagnify()` as other presentations |
| Canvas mode camera state leaks into OS Mode | Camera | Camera state must be per-presentation. Store OS Mode camera separately from canvas camera. |
| Webview reparenting loses session | Critical | Use React portal or `layoutId` to keep webview DOM node alive during scene transitions. Never unmount/remount. |
| Terminal PTY disconnects during window move | Critical | Terminal PTY is managed by Go backend keyed by block ID. Moving a window in the renderer does not affect the PTY. Verify this. |
| Hermes session lost during dock/undock | Critical | Hermes session ID is in block metadata. Docking changes presentation, not block ID. Verify HermesViewModel survives reparenting. |
| `task check:ts` fails due to new types | Build | Add types incrementally. Run typecheck after each file creation. |
| `npm test -- --run` fails | Tests | Add workspace-presentation test for `"os"` value. Add OS Mode specific tests. |
| Production build OOMs | Build | Use `task build:prod` not `npm run start` (known OOM issue with `npm run start`) |

---

## Summary

The KronTerm codebase is well-structured for OS Mode addition:

1. **WOS provides stable session identity** — blocks survive presentation changes
2. **WorkspaceCanvas provides reusable spatial primitives** — camera, transforms, drag, resize
3. **WorkspaceSurfaceModeProvider provides the control surface** — typed actions for agent control
4. **KronarchyShell provides the shell pattern** — screen-space UI overlay
5. **BlockRegistry provides view model resolution** — blocks render consistently in any container

The main work is:
- Extracting the `SpatialEngine` interface from workspace-canvas.tsx
- Building the OS Mode shell and window components
- Implementing the scene state machine (freeform/focused/grouped/overview)
- Implementing perspective transforms for edge carousels and Cover Flow
- Ensuring session continuity through all transitions (no remounts)

**Ready to proceed to Phase 01.**
