# Workflows on the KronTerm OS canvas

Status: shared-world implementation in the working tree, 2026-10-30. Model checks and the native component build pass; mixed-object Electron interaction gates remain pending.

## Outcome and ownership

The integration uses the original n8n node, handle, edge, picker, parameter-editor, and workflow-action components. KronTerm owns the desktop background, camera, viewport gestures, scene selection, and application ordering. The engine owns the executable graph and execution state. Hermes remains the regular conversation controlling that graph.

Workflow nodes have stable OS object identities derived from workflow ID and node ID. They are not blocks, widgets, iframes, or webviews. Their positions are persisted in the executable workflow, while OS layout storage retains presentation state.

## Implemented composition

The original Vue application initializes its existing providers, stores, router, dialogs, and components. Its native layout branch replaces the standalone application shell with named OS slots. It does not display a second application sidebar or editor background.

The original VueFlow Viewport subtree now mounts through Vue Teleport into a named
world target beneath `.os-mode-world`. The engine/providers and viewport-fixed
chrome remain outside that world. The earlier sibling graph layer with mirrored
camera transforms did not provide individual interleaving with OS objects and is
superseded by this source change.

The OS ancestor supplies the sole painted world transform. Native world carriers
use `display: contents` rather than establishing a graph-wide stacking context.
An explicit VueFlow geometry adapter reads the OS viewport bounds and camera for
projection, drag calculations, and handle measurement; its own background and
D3 pan/zoom controller are disabled. This is a Vue-managed mount with an external
geometry contract, not a raw DOM reparent.

Windows, notes, and original workflow-node wrappers share `sceneOrder` ranks.
Legacy `zOrder` remains window-only for focused/carousel behavior. Scene selection
raises the selected entity without changing the camera; explicit window commands
also update the shared order. Ordinary window clicks in freeform remain in that
scene, while explicit focus/maximize retain their existing presentation behavior.
Workflow records and their ordering are excluded from persisted OS layout state.
The node's executable graph remains its position/document authority.

These changes describe source ownership and interfaces. They do not establish
that the new bundle has passed rendered mixed-object acceptance.

| Section                                       | Current placement and behavior                                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nodes and connections                         | Original Viewport content in the shared OS world; node wrappers use the same per-object depth order as notes and windows, while graph editing remains upstream.                                    |
| Workflow actions and canvas controls          | Original action/control groups in viewport-fixed OS chrome slots. Camera controls request OS changes; save, execute, stop, and publish retain engine behavior. Chrome respects the dock safe area. |
| Workflow folders                              | Left Sessions/Workflows selector. The session tree remains mounted when hidden, preserving its state. Workflow selection and management navigation use scoped backend commands.                    |
| Node picker                                   | Original picker in the right Nodes inspector. Canvas Add and picker requests use the same target.                                                                                                  |
| Node editor                                   | Original editor in the OS detail slot, with an expand action. Its parameter, input, and output components remain upstream.                                                                         |
| Executions                                    | Explicit right Executions tab, eligible after the selected workflow has execution history. Switching to it replaces the active inspector section rather than covering Nodes.                       |
| Hermes                                        | Existing HUD or explicitly docked Side chat. Original Assistant actions invoke the existing Hermes conversation. There is no separate workflow-builder chat form.                                  |
| Credentials and data tables                   | Original page bodies and dialogs in the OS detail slot, with the editable graph kept mounted behind them.                                                                                          |
| Evaluations, insights, users, roles, API keys | Workflow/account navigation opens the related original management content in the detail slot. Upstream permission and feature checks remain in force. Templates remain disabled.                   |
| Managed workflow session                      | Workflow access inherits the Hermes desktop session, with a private loopback capability exchange and automatic session renewal in Electron main. No separate workflow login is required. |

The implementation removes the earlier right-panel launcher dashboard. Files remains the file browser on workflow routes; Nodes and Executions are explicit inspector choices. It also removes the earlier hand-built React node cards from the active OS integration.

## Document and runtime behavior

- The original editor, OS object commands, and Hermes tools target the same versioned workflow. Dirty-state acknowledgements and document mutation checks protect local edits before an agent write.
- Agent edits update the existing original document through its hydration adapter instead of remounting the entire application. The adapter checks workflow identity and rejects refreshes over unsaved local changes.
- Explicit workflow-open actions activate the OS canvas. Polling and document revisions must not change the user's current OS scene.
- Original UI requests and Hermes tools use the managed authenticated runtime. Session cookies and bridge tokens stay in Electron main; the renderer uses a scoped API bridge.
- The bridge supports upload/binary transport, cancellation, session renewal, and the push reference needed for live execution updates. WebSocket request grants are restricted to the managed endpoint and authorized renderer and are revoked on teardown.
- The runtime remains attached to its originating workspace and tab. Stops and scope changes preserve the database while removing runtime capabilities.
- Session connection failures surface in KronTerm UI. The workflow runtime exchanges a private desktop capability for a browser-bound session; it does not request or store the user's Hermes password.

## Source map

- OS projection, lifecycle, slots: `frontend/app/tab/os-original-workflow.tsx` and `os-workflow-host.ts`.
- OS scene registry, shared order, and gestures: `frontend/app/tab/os-workspace.tsx`, `os-workspace-model.ts`, and `os-scene-order.ts`.
- Original component build and native layout adapters: `integrations/n8n/build-native-editor.mjs` and `integrations/n8n/editor/`.
- Left navigation and right inspector: `frontend/hermes/app/workflows/` and `frontend/hermes/app/contrib/`.
- Managed session adapter: `integrations/n8n/session-hook.cjs` and `integrations/n8n/managed-session.cjs`. Production Hermes identity-provider integration remains separate work.
- Scoped runtime, authenticated transport, and document commands: `emain/n8n-*.ts`, `emain/workflow-account.ts`, and `emain/authkey.ts`.
- Hermes graph tools: `mcp-kron-term/src/n8n-tools.ts`.

## Evidence and limits

The shared-order/model run completed with 40 passing tests across two files. It
covers mixed node/note/window depth, raising through explicit window commands,
selection boundaries, live identity reconciliation, persistence exclusion, and
existing OS model behavior. These checks verify the model, not DOM painting or
pointer geometry.

An earlier targeted integrated Vitest run completed with 82 passing tests across 16 files. It covers runtime/tool boundaries, authentication and renderer grants, shared account gating, OS camera contracts, and sidebar/inspector behavior. Additional development-navigation checks passed separately. These are automated checks, not a substitute for rendered interaction verification.

The shared-world original-component fixture was inspected through the UI. Its
Viewport content is under the OS world target, with no carrier transform. At
100% and 200%, original nodes and an OS note scaled together; edge path bounds
met the visible port boundaries. At 50%, dragging an original node updated its
canonical position and attached edge. Executing through the original button and
opening the original node editor showed output `answer: 42`. This is fixture
verification, not a complete native OS overlap test.

The final adapter suite passes 13 tests, including mount serialization, stale
disposer isolation, retry registration, projection, and hidden host/carrier
styles. The root host/surface/model checks pass 55 tests across four files.
Sender/runtime connection checks pass 85 tests. The final root TypeScript check also passes. The native component build
succeeded after the visibility fix.

The interaction regression fix adds shared input routing for persistent live
widgets, including a Hand-only capture surface above guest webviews. Ordinary
widget input and scrolling remain with the widget. Detached widget content clips
against higher-ranked OS notes, original node wrappers, and bounded workflow
panels, while retaining the same live block mount. Invisible chrome carriers no
longer intercept the whole canvas; the OS authoring toolbar is visible again.

A plain node body click now selects the OS object before opening its original
parameters in a right-aligned pane (760px maximum). Source drag, port, control,
and modifier gestures keep their existing behavior. Switching focus to an OS
widget or note closes the node editor through the original store without
modifying parameters. The workflow header clears the connected OS shell.

The final frontend run passes 63 tests across seven files; the final adapter run
passes 20 tests. TypeScript passes. The production-slot fixture verifies widget
text/click input, original node dragging, node-to-widget-to-node parameter focus,
right pane bounds, and actual Execute step output `answer: 42`. The engine smoke
also passes Generated widget -> Hermes Agent -> Widget -> Tool through the
authenticated deterministic test bridge. This does not exercise a paid provider
or mutate the user's live workspace through workflow tools.

Workflow navigation now reconnects a configured account's stopped runtime on
explicit entry and reloads saved rows. Hidden navigation and polling do not start
an engine, and pending signup does not bypass account setup. Eight additional
navigation/sidebar regressions pass; reconnect does not emit a camera-fit event.

Native Electron verification remains partial. Actual widget text input and the
restored Add note tool were exercised with original nodes present. The app was
restarted and the final bundle loaded after a slow renderer startup. Native
automation then reported offscreen/invalid targets and click success without
reliable node activation; the user was asked to verify the final single-click
node parameters and widget focus handoff. Do not infer a native pass from the
fixture or automated model tests. A complete TypeScript check passed before the
last small navigation/focus changes; the final rerun is in progress.

## Remaining acceptance gates

- Build and load the new shared-world native bundle. A workflow node, OS note, and terminal must retain their relative world positions during pan, pinch zoom, fit, inspector resize, and workspace restore. Confirm one background, one gesture plane, and no double transform.
- Overlap a node with a note and terminal, then alternately select/drag each. Each selected object must move in front independently, including the original node's hit target and window content; no graph-wide stacking layer may remain.
- Click and drag an ordinary window in freeform without hiding the workflow. Explicit maximize/focus remains a separate operation. Verify hand/middle-button panning over both original nodes and OS objects, while inspector/detail controls retain their own interaction.
- At zoom 0.5, 1, and 2, a 100-pixel screen drag maps to 200, 100, and 50 world units, with connector endpoints remaining attached.
- Verify node drag, connection drag, dynamic AI ports, labels, menus, tooltips, keyboard selection, and OS object move/delete against the actual Electron renderer.
- Reopen the right picker and execution history repeatedly. Check portaled content cleanup, search continuity, correct workflow context, and focus return.
- Verify original node editing and management dialogs in light/dark themes; scrolling must stay in the active panel, with the dock and Hermes accessible.
- Exercise local edits followed by Hermes edits, undo/redo, save conflicts, navigation during initial loading, retries, stop/restart, and session expiry. Confirm no lost draft, stale document, scene activation, or second login.
- Select a historical execution and return to the editable draft without silently replacing it.
- Inspect the actual OS workspace at 1920x1080, 1440x900, and 1280x800, including keyboard-only interaction, reduced motion/transparency, clipping, contrast, and dock/HUD access.

## Docked workflow tools and live widget nodes — 2026-10-31

The workflow controls now occupy a sibling panel frame outside the OS scene
viewport. The original header, node parameters, management pages, execution logs,
and bottom controls report their occupied bounds; the OS viewport reserves those
bounds rather than painting widgets behind the panels. Left navigation and the
existing right inspector remain outside both frames. Opening a panel preserves
the same world, camera, block identities, and persistent live DOM mounts. The
legacy shell clip is disabled for the already inset workflow viewport to avoid
clipping its first row twice.

The node picker lists the current tab's live widgets. Adding one uses the original
node insertion machinery and binds `CUSTOM.kronTermWidget` to its actual block ID;
it does not create a duplicate widget. The node exposes its target ID and supports
state, snapshot, click, typing, and key commands through the existing tool bridge.
Old workflows with targets stored in Arguments JSON remain compatible. Failed or
not-yet-ready insertion returns a scoped error and allows retry.

Layout intent: use the existing OS typography and materials, keep the shared
canvas as the main work surface, and reserve bounded tool areas so editing a node
and operating a widget remain understandable. Original components retain their
own controls and data. This is a calm desktop tool composition, with ENERGY 1,
RHYTHM 1, MOTION 1; no decorative animation or new visual identity is introduced.

Validation so far: 74 frontend tests across ten files pass, covering live mount
preservation, input ownership, scene ordering, navigation, node picker binding,
and inspector behavior. Eighteen main-process tests and six executable widget
node tests pass, including an authenticated local HTTP exchange returning widget
state. The main/preload build passes. Final source build, typecheck, and native
panel interaction verification are still pending at this entry's creation.

### Verification update — 2026-11-01

The final native component build and full TypeScript check pass. The latest
focused checks comprise 76 distinct frontend regressions, 25 source adapter
checks, 18 main-process checks, and six executable node checks. Durable logs are
in `.tmp/workflow-verification/`.

Rendered source-component checks exercised single-click parameters, live widget
text/button input and focus return, insertion of a bound widget through original
node creation, and execution returning the test bridge response. Credentials and
the credential creation dialog opened without another login. Canvas, detail
pane, picker, and modal bounds were measured for disjoint areas; node details
stayed within the viewport at 1280x800, 1440x900, and 1920x1080 across light/dark
checks. These checks use the source-component fixture, not the complete native
workspace. The fixture's synchronous picker callback recursion was corrected.

The rendered check also exposed imported document CSS assigning 100% width and
height to shadow hosts. Chrome and detail hosts now explicitly use auto bounds
so their top/bottom and left/right docking constraints determine their size.
Narrow original node editors scroll internally. A selected node is panned into
the remaining stage after selection or resize, preserving its position and zoom.

Native DevTools revealed a separate Vite dependency-optimization failure: lazy
Hermes imports received 504 Outdated Optimize Dep responses and React cleared
the workspace. The renderer config now prebundles those dependencies at startup.
The native workspace still requires a successful post-restart interaction check;
the fixture results do not establish that acceptance gate.

Hermes import failures are now isolated at both lazy chat hosts. Five additional
regressions verify failed-import containment and preservation of an unrelated
live widget, its unsaved draft, and a healthy chat instance across parent renders.
Native observation confirmed the OS remains visible with a local recovery action
after a Hermes load failure. A clean single-server startup is being verified;
concurrent renderer starts had also touched the same optimizer cache. The dev
renderer port is now exclusive to avoid silently starting another instance on 9125. The final non-interactive engine chain passes with the UI fixture's tool
calls separated from the CLI chain assertions.

Native verification also exposed two canonical-selection defects. Legacy canvas
polling could override the native selection, and opening a workflow URL did not
synchronize the saved selection before the original editor mounted. Both are
fixed; all 21 workspace controller tests pass, including opening canvas,
executions, and evaluations without a renderer route acknowledgement. Backend
errors include method and pathname, with query values omitted.

Workflow activation now uses the existing freeform reducer so its durable
layout preference agrees with its scene. A restore regression checks activation,
widget selection, and reopening without returning to Carousel. The renderer
ignores compiler/test artifacts and backend/build outputs, preventing those
writes from repeatedly reloading the live workspace. The original add-controls
rail has a dedicated 64px gutter outside the shared scene.

### Native interaction acceptance — 2026-11-01

The running Electron workspace now passes the live-widget execution check. In
the dedicated `OS canvas integration check` document, Start connects to a bound
browser widget node. Executing the original workflow returns one successful item
containing the actual widget ID, view type, bounds, and bridge acknowledgement.
The original node editor displays that output in its right-hand dock. Opening
details automatically compacts the otherwise empty Nodes rail; its prior width
is restored when appropriate without overriding an explicit user choice.

Widget focus now raises a window within an existing freeform OS scene instead of
switching to Carousel. Explicit legacy `spatial.focus` behavior remains available.
Forty-five model, scene-order, and tab-group checks cover this behavior. Four
inspector tests cover scoped detail events and user overrides. Native checks
also exercised shared panning, browser address input/navigation, OS note creation
and removal, and a second successful workflow execution while remaining in Canvas.

Port dragging exposed a separate shadow-root boundary defect. Its original hit
testing stays inside the workflow shadow root, while the native drag lifecycle
now listens on the owner document in capture phase and checks the release point.
This keeps a connection alive over ordinary OS blank space and live widgets.
The generated original handle controller regression verifies connection, outside
cancellation, listener cleanup, offset/zoom, and unchanged ordinary-flow behavior.
After rebuilding and reloading, native drag-to-connect successfully recreated the
test edge. All 25 source adapter checks and six executable widget-node checks pass.

These results verify the shared canvas, controls, and local widget bridge. They
do not assert that every external integration or provider credential has been
configured or exercised. Provider-specific credentials remain user configuration.

The final Fit all check found that a stable rendered graph could remain absent
from the OS object registry when canonical node IDs hydrated afterward. The
source watcher now observes both graph geometry and canonical nodes, publishes
immediately, and rejects stale canvas publishers. An executable Vue reactivity
regression covers hydration, position updates, removal, and stale publishers.
Selected-node visibility also reserves 72px above a node for the OS tool strip;
four layout regressions pass. All 26 source adapter checks pass after this fix.
The native bundle rebuild passes. The final native reload/Fit all recheck was
interrupted by changes to the active window, so that last visual check remains
outstanding; the earlier native execution and connector results are unaffected.

### Control placement update — 2026-11-01

Workflow identity and Editor/Executions/Evaluations navigation now occupy a
compact upper-left group below the OS shell. OS drawing tools and original
workflow add/focus/assistant controls share one vertical rail at the right edge.
Zoom and Execute occupy the lower-left corner, with Logs in the lower-right;
the footer sits above the centered OS dock. The native header/footer no longer
reserve the former full-width header and 140px footer area. The stage retains
the OS shell and a compact bottom safe area; expanded data panels reserve their
actual space separately.

Workspace widget entries are inside the original picker results and use its
search query and scrolling. A scoped Vue slot/React portal preserves the existing
insertion acknowledgement. Original picker width and height follow the inspector.
Execution history has an independent bottom drawer: the header Executions action
opens it without changing the Nodes inspector selection, and Close history
closes only that drawer. Outside OS mode, existing inspector placement remains.

Native screenshots confirmed the compact navigation, combined right rail,
full-height picker with integrated widgets, and removal of the large viewport
cutoff. A final spacing correction raises the footer above the OS dock. Source
and React tests cover the integrated search, target cleanup, insertion, drawer
close, and preservation of Nodes selection. Live native reload checks for that
last footer spacing and independent history drawer are pending while the active
window is being changed by the user.

### Compact OS controls and composer placement — 2026-11-01

The bottom application DockNav is removed from OS mode. Applications remain
available through the existing top-shell app and command-center controls. The
original zoom/tidy button group now shares the right-hand canvas rail. Logs uses
a compact 28px header at the bottom black frame; Execute remains fully visible
immediately above it. The focus sidebar is bounded to a 340px by 280px card,
with its actual bounds included in native panel measurement. OS workspace chrome
uses a narrower 220px sidebar and compact controls without scaling the canvas.

Regular Hermes chat has a persistent top/bottom composer preference. Embedded OS
HUD chat exposes the same control with its own position preference, preserving
the original top default. Switching does not remount the composer or transcript.
Native verification caught and corrected the HUD shell's former top-only portal
anchor: bottom placement now anchors above Logs and places the transcript above
the composer. Switching back restores the top-shell composer. Floating popouts
retain their existing placement behavior.

Native Electron checks confirm dock removal, both HUD positions, compact focus
panel, combined tool rail, Logs at the bottom frame, and an unclipped Execute
button. Nineteen targeted React regressions and 28 source adapter checks pass;
the original-component bundle build and full TypeScript check pass. The position
regressions cover persistence, draft/attachment retention, and stable thread DOM.

### Floating-card hit area and shared selector — 2026-11-01

The compact focus card no longer reserves a full-height right inset. Its visible
rectangle still occludes widgets; canvas and widget content below it remain
interactive. A geometry regression checks that only the 340x280 card clips a
live widget, and a source regression distinguishes floating cards from docked
node editors and management panels.

The existing white UI selector now carries all sixteen canvas actions through
its official toolbar plugin API. Right-click its Copy icon to open those actions.
Choosing an action runs it immediately and restores Copy as the selector default.
The duplicate canvas rail is hidden while the selector owns the controls. A
bottom-center white tool tray remains available when the selector is disabled or
unavailable. Native workflow controls remain mounted and their original handlers
are invoked; the node components and shared camera are unchanged.

The integration reuses ReactGrab's existing global API because importing the
package initializes it automatically; a second init returns a no-op API. Owner
state follows selector visibility and browser ownership, with scoped listeners
and HMR cleanup. Native verification confirmed all actions appear in the selector
menu, Pan activates immediately, and a gesture directly below the focus card
moves both original nodes and the browser widget together. The camera and Select
mode were restored afterward. The original-component build and all 29 source
adapter checks pass.
