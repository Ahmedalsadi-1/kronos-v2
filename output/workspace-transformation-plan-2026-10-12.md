# KronTerm workspace transformation plan

Date: 2026-10-12. Scope: planning and read-only repository inspection; no product changes made.

## Confirmed direction

- Tabs receives Orca (onorca.dev) layout and widget visual parity. Web is a separate Hermes presentation.
- Widgets receives thinner visual borders and gutters, plus collapsible tab management.
- Canvas becomes a workflow editor whose nodes can launch or reference live widgets.
- OS receives overlay correctness and desktop interaction polish. Dynamic islands share its chrome and theme.
- Hermes gets separate KronosCode and fast computer-use execution profiles, sharing model routing where supported.
- Vy is the computer-workflow reference. Comet and Cursor are additional browser/computer/environment references.
- Local and self-hosted operation is the default; no mandatory hosted desktop infrastructure.

## Existing foundations and gaps

The local `orca/` source tree carries an MIT license. Source study is preferable to decompilation; preserve notices for copied portions. Freeze a reference revision and screenshot inventory before promising parity.

`frontend/types/workflow.ts`, `emain/workflow-store.ts`, and `emain/workflow-runtime.ts` already provide dependency validation, saved revisions, queued runs, pause/cancel/resume, resource locks, checkpoints and evidence. Runtime execution currently delegates to KronosCode, and steps within a run are sequential. Hermes already exposes workflow scheduling. Missing work includes typed runnable nodes and ports, explicit schedule records, engine-neutral execution and parallel ready-node execution.

Canvas connectors and the existing task/evidence graph are visual relationships. They must remain distinct from executable dependency and data-flow edges.

Desktop and browser selection already have semantic context and screenshot support. Device tools already provide screenshots, live sessions and interaction for iOS/Android, with stale-generation checks. Device selection remains Labs.

The prior Vy inspection (`output/research/vy-taby/feature-audit.md`) recovered client capability declarations, not a reusable engine or hosted model. A supported Vy adapter is conditional; independently implement the observed workflow and computer-use behavior otherwise. Faster operation must be established by measurement.

## Agent assignments

| Agent | Owned deliverable | Acceptance gate |
| --- | --- | --- |
| A0 Integration lead | Reference revision, shared contracts, dependency order, review and integration | Every change has one owner; no overlapping shared-file edits; sessions survive mode switching |
| A1 Reference research | Orca source comparison; bounded Vy, Comet and Cursor inspection; feature/evidence ledger | Separate observed behavior, inferred behavior, reusable source and unavailable services |
| A2 Shared chrome | OS-derived tokens, navigation, island surfaces, titlebars and focus states | Consistent light/dark themes, keyboard focus, reduced motion and transparency settings |
| A3 Orca Tabs | Tabs layout, tab strip, sidebar proportions, pane headers, launch/close/reorder interactions | Matched reference states and dimensions; KronTerm widgets and sessions remain functional |
| A4 Tiles and sidebar | Thin visible separators, smaller gutters, collapsible workspace-tab manager | Invisible resize hit areas remain usable; top-left toggle occupies reserved chrome and never covers content |
| A5 OS correctness | Overlay ownership, stacking, clipping, geometry, window focus and desktop interaction | Overlapping, resized and moved windows never show another widget's overlay; stable focus and input |
| A6 Workflow contracts | Versioned typed nodes, ports, edges, validation, migration and widget references | Invalid connections/cycles rejected; old layouts preserved; stable canonical block IDs |
| A7 Canvas editor | Ports, anchored wires, inspector, grouping, undo/redo, run/evidence views | Connections survive movement, zoom, reload and mode switches; live content receives input correctly |
| A8 Runner and schedules | Typed execution, bounded concurrency, locks, retries, durable schedules and recovery | Independent branches run safely; schedule deduplication; explicit timezone/overlap/missed-run policy |
| A9 Engine and router | KronosCode/computer adapters, shared catalog and credential routing, engine selector | Each adapter exposes capabilities, streaming, cancel and recovery; unsupported models fail clearly |
| A10 Computer performance | Baseline instrumentation, warm sessions, scoped observations and verified actions | Report p50/p95 latency, success, retries and tool round trips; no speed claim based only on animation |
| A11 Selection and devices | One selection toolbar plus mobile region/semantic capture and provenance | Correct zoom/DPI/rotation mapping; capture causes no taps; stale selections rejected |
| A12 Local environment | Linked terminal/browser/files, local and SSH profiles, optional isolated Linux | No mandatory cloud; session identity is explicit; reconnect, cleanup and file-root boundaries work |
| A13 Verification | Cross-mode scenarios, runtime screenshots, workflow and device regression checks | Evidence at 1920x1080, 1440x900 and 1280x800; failures distinguished from pre-existing defects |

These are ownership roles, not fourteen simultaneous workers. Current capacity supports a coordinator and three specialists at once. Use waves and isolated patches/worktrees; inspect the large existing working-tree diff before implementation and preserve ongoing work.

## Implementation waves

1. Reference inventory and baseline: A0/A1/A13 establish current behavior and a pinned Orca comparison; A2 defines shared chrome contracts.
2. Workspace polish: A3/A4/A5 execute separate UI scopes against A2 contracts. Integrate common block chrome first. Share navigation components with islands while retaining every existing action.
3. Workflow foundation: A6 defines schema and migrations; then A7 and A8 implement editor and execution in parallel, with A9 building adapters against the same contract.
4. Computer and selection: A10 measures and optimizes the adapter; A11 adds device selection; A12 adds the lightweight environment profile.
5. End-to-end release gate: A13 exercises real workflows, recovery, target changes and all presentations. A0 integrates only passing increments.

## Canvas architecture

Keep graph definitions, canvas placement, live widget sessions and execution records separate. A workflow node references a canonical widget or a launch specification; moving a node never recreates a terminal/browser session. A run references a frozen definition revision.

Initial node kinds: manual/scheduled trigger, launch widget, terminal command, browser action, computer action, agent task, transform, condition, human review and artifact output. Use typed input/output ports and explicit bindings. Dependency edges control readiness; data edges carry validated outputs. Notes and decorative connectors stay non-executable.

Graph operations and validation are pure modules; persistence, engine adapters, scheduling and run-state projection sit outside React. Extract geometry and interaction from the large canvas component. Evaluate React Flow in a small live-widget prototype before replacing the current canvas: keyboard/input ownership, persistence and virtualization are mandatory checks.

First demonstration: scheduled trigger -> open project environment -> browser task -> write artifact -> terminal validation -> human review. Show each node's state and evidence in Canvas. Generate workflows from a prompt as editable drafts, with explicit targets and parameters visible before activation.

Schedule records include timezone, next occurrence, enabled state, overlap policy and missed-run policy. Runs have timeouts and bounded retries. Record completion and idempotency keys before recovery; do not promise exactly-once arbitrary external side effects. Local schedules need the host/runtime available; optional self-hosted runner can operate while the desktop is closed.

## Hermes and computer use

Hermes is the common interaction surface. KronosCode handles code/project tasks; Computer handles browser/native/mobile tasks. Preserve engine selection and per-node overrides. Both call a shared model catalog/router when provider capabilities permit; engine choice is independent from model choice.

Adapter contract: capabilities, start, stream events, pause/cancel, resume and dispose. Keep provider credentials out of renderer and workflow definitions. Do not silently switch an executing task between engines or lose permission/evidence state.

Measure model wait, session startup, capture, accessibility traversal, transport, input and verification separately. Reuse warm sessions, compact accessibility/DOM context, crop screenshots and bounded action sequences. Serialize input on the same target and invalidate observations after navigation, rotation or window changes. Set numerical speed targets after collecting the baseline.

## Selection settings and expansion

Toolbar: surface picker, element/region/full-view capture, screenshot toggle, semantic-context depth, annotation, multi-select, redaction and destination (chat or workflow node).

Mobile: freeze a frame; capture region/point; attach crop, full-frame context, target identity, orientation, timestamp and generation. Attach Appium/accessibility semantics when available. Clearly label pixel-only selection. Revalidate after rotation/reconnect; keep Labs labeling.

Further adapters: terminal output ranges, editor symbols and diagnostics, file/diff regions, before/after comparisons and pinned workflow evidence. A screenshot can guide an agent but does not automatically identify editable source.

## Lightweight environment

One environment groups terminal, browser and files with a shared project root, connection, browser profile and artifact list. Present a calm environment header with connection state, running task, takeover, stop and outputs.

Profiles: Local project (lowest overhead), SSH host (self-hosted runner), optional isolated Linux (container/VM when stronger isolation is needed). Call local/SSH profiles workspaces rather than isolated sandboxes. Reuse existing blocks and streams. Resolve exact task/session identity: the inspected sandbox view accepts a session ID without using it in its desktop pane.

## Reference priorities

1. Orca local MIT source: exact Tabs reference and source-backed interaction study.
2. Vy supplied binary and prior evidence: reusable workflows, demonstration capture, scheduling and computer-control interaction specification. Backend reuse remains unverified.
3. Comet: assistant/browser integration, tab context and user takeover. Inspect installed client behavior if supplied; do not infer hosted internals from local code.
4. Cursor: task, artifact, review and remote-environment presentation. Treat sandbox/cloud services as external infrastructure, not recovered client functionality.
5. React Flow: candidate graph-editor implementation; independent live-widget prototype required.
6. Activepieces and browser-use: source-study candidates for workflow/automation patterns. Verify component licenses and architectural fit before any code adoption.

No additional proprietary decompilation is needed to start shared chrome, Tabs parity, tiles polish or typed workflow foundations. Comet/Cursor/Vy investigation should answer specific implementation questions rather than attempt exhaustive source recovery.
