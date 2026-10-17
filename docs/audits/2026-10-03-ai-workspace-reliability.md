# AI and workspace reliability audit

Date: 2026-10-03. Scope: current working tree, including its existing uncommitted changes.

## Outcome

The tool manifest and model tests cover substantial functionality, but they do not establish that every workspace preserves live sessions or that every reported tool success has been observed. This audit traced MCP registration, Electron tool transport, renderer RPC, presentation providers, block lifecycle, and the Hermes plugin. It fixed a bounded set of concrete failures and records the remaining architectural gaps below.

## Fixed in this pass

| Failure | Root cause | Change | Regression coverage |
| --- | --- | --- | --- |
| OS launch/open/close reports success before completion | Provider interface and implementation are synchronous while underlying operations return promises | Allow asynchronous provider controls; await block creation/deletion, native app-stream creation, file-open, and workspace-switch operations | Deferred and rejected provider operations; existing native bridge authentication tests |
| Spatial controls fall through to tiled-layout actions while the surface is unmounted | Provider existence was part of the spatial branch condition | Reject unavailable spatial surfaces; propagate provider errors through widget focus, workspace control, and HUD paths | Unmounted provider and unsuccessful control tests |
| OS move/resize/minimize/restore/dock accepts stale IDs and reports success | Reducer silently ignores missing windows; provider did not validate targets | Validate canonical actions and compatibility aliases before dispatch; reject unknown/self docking targets and malformed geometry | Stale windows, dock targets, zero coordinates, nonfinite/negative dimensions, and stale objects |
| OS snapshots return wrong screen coordinates after zooming then focusing/grouping/overview | Snapshot advertised the saved freeform camera while those scenes render without its transform | Advertise identity camera outside freeform scenes | Camera test across freeform, focused, grouped, and overview |
| CLI fallback tools can block Electron's main event loop | WSH bridge used execFileSync with a 15-second timeout | Use asynchronous execFile, retaining timeout, authentication environment, output cap, and stderr errors | Real child-process responsiveness/error test; scoped-token native bridge tests |
| Browser picker atoms fail writable-state typechecking | Explicit `atom<T>(null)` overload inferred readonly atoms with strict null checking disabled | Declare null-backed intent/selection as `PrimitiveAtom<T>` following repository conventions | TypeScript check and adjacent browser tests |
| Four suite failures obscured reliability checks | Assertions referred to old product labels or an older HermesApp JSX invocation | Update assertions to match current behavior and settings-model wiring | Complete frontend/Electron suite |

Waiting for an operation to resolve verifies runtime acknowledgement, not final visual presentation. A fresh content/workspace observation remains necessary after mutations.

## Remaining gaps, in priority order

### P1: Presentation changes do not preserve live React mounts

Evidence: `frontend/app/tab/tabcontent.tsx` conditionally replaces `WorkspaceCanvas`, `OSModeView`, `WidgetTabsLayout`, `TileLayout`, and `WebModeView`, with distinct keys. `frontend/app/block/block.tsx` disposes and unregisters its view model on unmount. `frontend/app/view/term/term.tsx` disposes the terminal wrapper on cleanup. Browser guest DOM lives inside the replaced subtree.

Consequence: switching modes preserves database block IDs but remounts the renderer/view-model tree. Terminal backend survival does not imply preservation of terminal renderer state; browser guest identity and transient page state are especially exposed. Tabs also filters rendered panes by `mountedPaneIds` in `widget-tabs-layout.tsx`, so ordinary tab activation unmounts inactive views.

Required follow-up: one persistent owner/mount per live block, with presentation adapters supplying geometry and visibility. Do not mount duplicate browser/terminal instances in hidden alternative layouts. Acceptance must track mount/dispose counts, browser webContents identity, terminal wrapper identity, and agent conversation across mode and tab transitions in a running Electron build.

### P1: Tool success evidence is weaker than advertised

Evidence: `mcp-kron-term/src/index.ts`'s activity wrapper sets `verifiedAfter: true` for interactions outside its widget-focus verification branch. Widget interactions verify focus, not the intended result of a click, type, or drag.

Consequence: successful transport dispatch or focus can be recorded as verified completion without observing changed content. The interaction-contract unit test that rejects unverified mutations does not prove that all production callers supply meaningful verification.

Required follow-up: tool-specific postconditions for navigation, typing, selection, drag, sandbox lifecycle, and layout mutation. Return distinct acknowledged/observed/verified states. A successful transport response must not by itself assert a verified effect.

### P1: Tool routing uses a globally mutable focused context

Evidence: `emain/kronterm-tool-server.ts` maintains a singleton server and replaces its context provider when another runtime starts/ensures it. `KronTermNativeToolBridge` resolves context through that provider during routing and capability issuance.

Consequence: requests are deliberately tied to the current focused surface, rather than an immutable caller/session target. A focus/context change during a multi-step asynchronous action is a routing risk. The current tests establish provider replacement behavior; they do not exercise concurrent conversations, separate windows, or focus changes while a tool is pending.

Required follow-up: capture and validate a context lease at request entry, propagate it through the operation, and explicitly distinguish follow-focus commands from conversation-scoped commands. Add a deterministic two-context concurrency test before changing this contract.

### P2: Workspace snapshots do not describe actual visibility in all modes

Evidence: `frontend/app/store/tabrpcclient.ts` marks only the focused block visible in Tabs. `widget-tabs-layout.tsx` can render both agent and companion panes. Web mode has no dedicated snapshot/capability branch, and its screenshot handler uses the tiled container fallback despite `TabContent` replacing that container with `WebModeView`.

Consequence: agents can receive visibility/geometry that disagrees with what the user sees, and workspace screenshot can fail in Web mode. Detached HUD islands require desktop-window geometry rather than renderer-local bounds.

Required follow-up: provider-owned observation for every presentation, including Web and Tabs companion panes. Scope geometry to the window that owns the surface; explicitly represent unavailable and hidden surfaces.

### P2: OS and Canvas share names but differ in behavior

Evidence: OS `add_note` calls `addObject("note", input.text)` and ignores requested x/y/width/height/color. Canvas's provider applies those properties and collision-free placement. OS does not implement `connect_objects`, Canvas `arrange`, or directional `navigate`; OS has separate window arrangement actions.

Consequence: agents cannot transfer a Canvas action plan to OS unchanged. Some differences are intentional, but require an active-mode capability contract and accurate parameter semantics.

Required follow-up: either implement parity for shared actions or explicitly scope descriptions/schemas to the active mode. Validate optional object geometry and colors at the renderer boundary too.

### P2: Layout discovery differs between UI and tools

Evidence: `workspace-presentation.ts` recognizes Widgets, Tabs, Canvas, OS, and Web; `workspace-presentation-switcher.tsx` intentionally exposes only Canvas and Tiles. Its test explicitly locks that restriction. Several nested AGENTS documents still describe three presentations.

Consequence: internal support and user discoverability differ. This audit does not undo that existing product decision.

Required follow-up: decide supported/user-facing/internal/Labs status for each presentation, then align the picker, configuration, agent guidance, documentation, and test matrix.

### P2: Native tool diagnostics understate CLI dependencies

Evidence: `emain/kronterm-native-tool-bridge.ts` reports `cliProcessesPerNativeCall: 0`, but 21 public methods inherit WSH CLI implementations: AI append, badges, backgrounds, connections, variables, launch/list widgets, notification, command execution, secrets, and configuration.

Consequence: missing/stale packaged WSH can break a subset of tools while native RPC tools remain healthy. Async execution fixes UI blocking, but does not remove this dependency or make the diagnostic claim accurate.

Required follow-up: migrate eligible methods to native RPC or expose per-family transport/binary readiness. Add a packaged-binary integration test.

### P2: Typecheck and live validation are release gaps

The default `npx tsc --noEmit` exceeded Node's default heap. The expanded-heap run produced errors in the in-progress Mochi engine (numeric `roll` field colliding with a method, missing `draw`/`tgOy`) and browser/HUD typing. Browser/HUD source changed during the audit. A later check isolated the browser errors to readonly atom inference; that issue is fixed in this pass. The Mochi implementation still needs its rendering engine completed. Mochi was not found imported outside its own component in this inspection.

The desktop inventory reported KronTerm stopped. No updated Electron build was launched, and no live host/sandbox/browser actions were performed. Visual size/appearance acceptance, native permissions, session continuity, and external AI-client integration remain unverified.

## Workspace capability comparison

| Presentation | Current control model | Key gap |
| --- | --- | --- |
| Widgets / Tiles | Layout tree: focus, relative move/swap, proportional resize, magnify, navigation | Mode changes replace live view subtree |
| Tabs | Ordered focus/move/swap/navigation; optional agent + companion panes | Inactive pane unmounts; snapshot understates companion visibility |
| Canvas | World geometry, camera, navigation, fit/arrange, notes/objects/connectors | Live continuity across modes; pending-render observation |
| OS | Window scenes, docking, minimize/restore/maximize, placement/arrangement, resources | Shared Canvas actions have different semantics; live continuity across modes |
| Web | Full-screen Hermes browser-first shell; restricted tool families | Workspace observer/screenshot lacks dedicated integration |
| HUD | Existing widget background/restore and detached native islands | Must distinguish owner window coordinates and preserve existing mounts |

## Validation

- Frontend/Electron: final complete run passed 617 tests in 119 files after workspace fixes, CLI fallback changes, and assertion updates. Additional files/tests appeared from existing concurrent work during this audit.
- MCP: build succeeded; 50 tests passed, including actual child-process responsiveness and error propagation.
- Hermes Python plugin: 5 tests passed.
- Go: `go test ./pkg/wshrpc/wshserver ./pkg/sandbox/...` passed; sandbox tools package has no tests.
- TypeScript: default run failed from heap exhaustion. Expanded-heap check identified unfinished Mochi code and writable browser atom typing; browser atom typing was repaired. Final current-tree check has six diagnostics, all in the existing Mochi files: duplicate/noncallable `roll`, missing `tgOy`, and missing `draw`. There are no reported errors in the files changed by this audit.
- Adjacent post-atom-fix tests: 50 passed in 9 files.
- ESLint: targeted source and regression files passed.
- Runtime visual/integration checks: unverified; KronTerm was not running.

The next implementation batch should start with persistent block ownership and truthful observations, then request-scoped tool routing. Those are prerequisites for saying that AI, workspace modes, and tools work together reliably.
