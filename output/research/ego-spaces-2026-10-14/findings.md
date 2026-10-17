# ego Spaces investigation and KronTerm implementation

Latest implementation status: [October 15 completion pass](completion-2026-10-15.md). The historical notes below describe earlier shared-desktop stages; the current native path now owns a dedicated virtual display.

Investigation started October 14, 2026. Target: `/Applications/ego lite.app`, framework version `0.5.1.13`.

## Evidence and limits

- REA artifact inspection: `artifact.json`, Evidence `ev_e5d23374542ce6cf22e44e30ac854fa364fc5ddbdd6c90246dbffaa4c5886201`; underlying inventory Evidence `ev_eab94ec5192bc142f6703bd22dbce01d9b2d404a391a1d0900f89f30aaa2188a`. Bundle digest `d7184fb3fa3b2a97d07ff14b05b95b555e7a1b81f36cb7ba86c2626636384612`. Inventory is static and bounded to this installed bundle, not execution evidence.
- The installed main executable is arm64 Mach-O. Its framework contains Chromium resources, V8 snapshots, native helpers and multiple retained versions. This is a native Chromium application; an Electron ASAR reconstruction is not the appropriate route.
- `space-strings.txt` and `ego-feature-strings.txt` retain bounded string searches of framework `0.5.1.13`. Paths include `ego/browser/ui/mainland/space_restore_service.cc`, `ego/browser/ui/views/mainland/space_cleanup_menu.cc`, `ego/browser/ui/views/animation/widget_bounds_animator.cc`, and agent overlay/control classes. These establish strings in the artifact, not call relationships, timing constants or executed behavior.
- REA native procedure analysis could not launch Hopper. `space-procedures.json` records the default launcher mismatch; `space-procedures-hopper.json` records the subsequent launch failure using the installed launcher. No configuration was rewritten. No function pseudocode was recovered. Exact animation internals remain unresolved.
- Runtime: the installed `ego-browser` CLI created the investigation's task Space (ID 1) with one managed page. `runtime-task-page.json` retains the owned task-page observation. This demonstrates task-space creation, not performance or focus isolation under all conditions.
- Primary product documentation: [Space](https://lite.ego.app/document/en/docs/space). The vendor describes one shared Chromium process and one native BrowserContext per task, separate task cookies/storage, task ownership, pause/handoff, and retained tabs for review. These are vendor explanations, not independently recovered implementation. The document's illustrative resource measurements were not reproduced.

## Findings

| Question | Status | Conclusion |
| --- | --- | --- |
| What are ego's background Spaces? | Partially answered | Vendor documents in-process browser contexts, rather than independent macOS desktops. Bundle and CLI observations corroborate a Chromium/task-space product but do not reconstruct context creation or login inheritance. |
| Why is it quick? | Partially answered | Sharing a browser process plausibly avoids per-task browser startup. This is an architectural inference. No comparative performance benchmark was run. |
| What implements its browser animation? | Unresolved | Native animation implementation path appears in strings; exact functions, curves and frame timings were not recovered. KronTerm motion changes are independent design choices. |
| Can this isolate arbitrary native Mac apps? | Partially answered | BrowserContext isolates browser state. It cannot supply a separate native WindowServer/input session to arbitrary applications. Native background delivery must use application accessibility support and refuse foreground-only fallbacks. |
| Can the requested macOS swipe and desktop-tab hue be changed? | Partially implemented | A focused-window native swipe bridge opens/restores the in-app OS overview when Electron receives the event. macOS can consume the default Mission Control gesture first. The in-app active-space hue is implemented; system Mission Control thumbnail tint is not. No system gesture preference was changed. |

## Implemented direction

- OS overview: project-space strip, workspace creation/switching, active layout miniature, selected-space accent, minimized windows included below. Live window component identities remain in the existing rendering path. The miniature is schematic, not a captured live desktop.
- Browser chrome: short suggestions/menu transitions and tab selection transitions with reduced-motion support. These follow KronTerm's motion specification, not recovered ego timing.
- Linux: existing quiet managed-desktop lifecycle gains GUI app discovery/launch. The user subsequently specified native macOS apps, so this path is supplemental and does not satisfy that requirement.
- Native macOS: nine `kron_computer_background_workspace_*` tools expose start, list, launch, open_file, observe, action, reveal, resume and finish. `native/background-computer.swift` launches with activation disabled, refuses already-running apps, validates PID/bundle/launch time, and uses only window-scoped accessibility and ScreenCaptureKit. It never falls back to global pointer/keyboard input. A background native-app workspace must not be advertised as a separately isolated macOS desktop or as universally compatible with native apps.

The native implementation uses Apple's documented [launch configuration](https://developer.apple.com/documentation/appkit/nsworkspace/openconfiguration) and [single-window capture filter](https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(desktopindependentwindow:)). Launch-without-activation is a request to the OS; apps can still activate themselves. The workspace pauses when activation is observed. Accessibility actions remain app-dependent, and checking a tree does not create an atomic transaction with the target app.

## Validation

- 29 targeted OS layout tests passed; 5 browser address/menu tests passed.
- 5 native workspace controller/schema tests and 10 isolated Linux desktop tests passed. These include membership, stale snapshots, ambiguity, foreground pause, handoff, preservation of apps on finish, injection rejection and launcher failure diagnostics.
- MCP TypeScript build passed. Browser SCSS compiled. Build-script/config syntax and scoped whitespace checks passed.
- 23 native bridge tests passed, including refusal of background-session calls from workflows without a bound session capability. Ordinary desktop-agent access retains the existing computer-control policy.
- `visual-checks.json`: actual overview component/model preview rendered at 1920x1080, 1440x900 and 1280x800 in light/dark, with no document overflow. Preview workspace switching/creation, overview exit, minimized visibility and restoration were exercised. Six screenshots are retained; 1280 previews also show an explicit preview accent. This is component validation, not full Electron live-session QA.
- Full `task check:ts` was stopped after roughly 33 minutes under memory pressure (sampled footprint about 4.1 GB); exit 143 is not a passing check. Existing user work and concurrent processes were preserved.
- Native Swift build and code signing completed successfully. `native-smoke.json` records a new TextEdit launch with activation disabled, opening a task-created regular file in the same owned PID, observing 13 accessibility elements and two windows, and capturing only its window (`native-window.png`). Codex stayed foreground throughout. Existing-app adoption, wrong PID and stale-tree requests were refused. TextEdit's AXValue assignment returned `cannotComplete` (-25204); no successful background data mutation is claimed. The helper returned the failure without foreground fallback. The test-created TextEdit process was cleaned up after identity/background/unchanged-content checks; preexisting apps were preserved.

## Native design boundary

The native task-group management panel is implemented in the OS overview, with assigned/current Space and display IDs, blocked reasons, pause, review, explicit new-window approval, closed-window removal, and release. Trusted IPC derives the management scope from the sender tab and does not expose agent resume or arbitrary native actions. The overview project-space strip and native task groups remain separate objects. The default system Mission Control gesture and macOS desktop-thumbnail hue are not overridden.

The macOS implementation should launch without activation, bind app/window identity to an agent workspace, expose explicit review/handoff, and allow only actions that do not require foreground focus. A failure to perform background accessibility actions must be returned to the agent instead of falling back to global key or pointer events. Existing human-owned windows must not be adopted or closed implicitly. Finishing a task must not terminate the user's apps.

For a fully independent native desktop with unrestricted pointer/keyboard control, a separate macOS login/virtual machine and its own capture/input channel is a different product capability. A visual Space grouping alone must not be presented as equivalent isolation.

## October 15 continuation: enforced window and desktop groups

- Agent ownership is bound to a server-issued caller identity plus tab identity. Session labels supplied by an agent do not grant authority. Other callers cannot list or control the group. Legacy global computer controls and alternate native app launch routes remain denied for that caller after its group finishes.
- Enrollment records exact WindowServer window IDs, macOS Space IDs, and display IDs. The first enrolled window establishes the group desktop/display boundary. Subsequent launches and user approvals cannot expand it onto another desktop. Exact private WindowServer identity queries fail closed if unavailable; this depends on macOS implementation details.
- Observe and capture return only enrolled windows. New windows require explicit human approval. Closed windows require removal. A moved window must be moved back; approval cannot silently rebind it. Before an accessibility action or file open, the helper rechecks membership and foreground identity. No shared keyboard or pointer fallback was added.
- A main-process native up/down swipe bridge targets only the focused window's current tab. Electron's [native swipe event](https://www.electronjs.org/docs/latest/api/browser-window) depends on macOS gesture configuration; it does not intercept the default system Mission Control gesture.
- A renewed connected REA attempt opened the ego 0.5.1.13 framework using Hopper metadata, but procedure searches again failed because the provider could not launch. The session was closed. No exact ego animation curve or timing is claimed.

Validation for this continuation:

- MCP TypeScript build passed; 10 background controller tests passed. A final controller/bridge-policy run passed 14 tests.
- Seven native gesture/management IPC tests passed. Six actual-panel screenshots plus interaction checks passed at 1920, 1440 and 1280 in light/dark: `../../implementation/native-task-groups/`. These are component previews, not full Electron integration tests.
- Swift helper compiled and signed. `window-group-smoke.json` passed against a newly launched TextEdit PID: background file open, exact-window AX observation and screenshot, wrong-desktop refusal, wrong-display refusal, unapproved-window contents excluded, and mutation refusal with an unapproved window. The foreground PID remained unchanged. Test-owned TextEdit was cleaned up only after identity/background/unchanged-fixture checks. This does not claim successful AXValue mutation or simulate physically dragging a window between desktops; mismatch checks supplied incorrect expected IDs.
- The first final full TypeScript attempt exhausted Node's default 4 GB heap (exit 134). A retry uses the repository's configured 8 GB limit; its result is recorded separately below.

These restrictions govern KronTerm computer-use calls. They do not sandbox independently granted shell execution or other external automation capabilities. A task group is still within the shared native macOS session. Creating a separate native desktop/session for unrestricted background mouse/keyboard work remains unimplemented.

Final full TypeScript retry completed with exit 2. Its only diagnostics were preexisting test typing errors in `emain/computer-workflow-engine.test.ts:13` and `frontend/app/tab/workspace-canvas-lineage.test.ts:5-7`. No diagnostics remained in the window-group, IPC, gesture, or panel implementation. These unrelated files were preserved.

Final bridge verification: all 23 `kronterm-native-tool-bridge` tests passed. The adjacent `kronterm-tool-server` suite could not initialize because its existing productivity-runtime import reaches `emain-platform` with no Electron `app` mock (`app.setName`); no tests ran in that suite. This is not counted as a passing suite.
