# KronTerm system experience audit

Date: 2026-10-03

Status: Historical audit. The subsequent user decision removes KronosChamber entirely.
The missing Chamber runtime described below is resolved by retiring that feature, not restoring it.
Hermes remains the chat surface; KronosCode remains available as an ACP engine.

## Direction

Make KronTerm feel like one persistent place to do work. The notch gives a glance
at the current task, Hermes handles conversation and decisions, and the workspace
shows the objects being worked on. All three should agree about the conversation,
context, running work, and result.

The highest-value journey is: select a file, browser page, or terminal; ask for a
task; watch the agent work; answer any required question; inspect the result;
continue that same conversation from the notch or workspace.

## Evidence and limits

- Opened the installed `dev.kronterm` application and inspected its screenshot,
  accessibility tree, and agent selector. It runs from
  `make/mac-arm64/kronterm.app`, rather than the current development renderer.
- The installed canvas showed a KronosChamber widget in an error state because
  its server copy was missing. A Hermes-backed side chat remained available.
- The installed screenshot showed a large mostly empty canvas, a central repair
  widget, and a right chat inspector. Its compact composer exposes agent/model
  controls plus four voice-related controls in the same row.
- Reviewed the current native Coucou bridge/views, Electron HUD lifecycle,
  preview producers, Hermes engine selection, session status, handoff, canvas
  context, workspace panel layout, and build-output checks.
- Ran eight existing Vitest files: 50 tests passed. These tests verify specific
  integration behavior; they do not establish visual quality, runtime packaging,
  accessibility completeness, energy use, or end-to-end conversation continuity.
- Did not render the current native companion or send an agent task. Native
  appearance and live task behavior therefore remain unverified.
- Existing working-tree changes were preserved. This audit adds no product code.

## Priority 0: reliable first launch and recovery

Observed: the installed KronosChamber widget reports a missing runtime, presents
repeated path diagnostics, and asks the user to retry or open settings. The same
screen also offers another chat surface, making availability hard to understand.

Source evidence: `scripts/check-build-output.mjs:29` makes Chamber artifacts
conditional on the source tree being present. This allows the artifact check to
omit Chamber requirements; it does not establish the cause of this installed
build's failure.

Improve:

- Define a packaged capability manifest: required runtimes must exist and become
  healthy; intentionally omitted runtimes must not appear as ready launchers.
- Validate the actual packaged application, not just files in `dist/`.
- Show one short recovery message with the failed capability and a useful next
  action. Put paths and logs behind a diagnostic disclosure.
- Explain which agent remains available and offer a deliberate route to it.
- Retry only failures that retry can resolve; distinguish missing installation,
  startup failure, disconnected service, and model/provider failure.

Acceptance: a fresh packaged launch can complete a task through each advertised
agent; a deliberately missing optional runtime has a clear unavailable state;
retry cannot loop indefinitely without changed evidence.

## Priority 1: preserve task meaning across every surface

Source evidence: `emain/coucou-hud.ts:112` maps success/cancellation to `Stop`,
failure to `StopFailure`, and every other phase to `PreToolUse`. Every source is
identified as `kronoscode`; every non-thinking action becomes `Bash`. The core
activity type already supports queued, awaiting-approval, running, verifying,
degraded, failed, cancelled, and paused. Hermes has a shared status reducer in
`frontend/hermes/store/session-dot-state.ts` that handles attention, quiet turns,
background work, unread completion, and session lineage.

Improve:

- Carry a typed task snapshot over the private native bridge, retaining source,
  session/run identity, phase, target, short action label, and verification state.
- Keep upstream hook compatibility in an adapter; do not make its smaller
  vocabulary the authoritative task model.
- Resolve competing task signals once, then adapt their presentation for Hermes,
  notch, shell, task cards, and overlays without importing core atoms into Hermes.
- Give user-required action precedence. Keep background work distinct from a
  foreground response, and cancellation distinct from successful completion.
- Separate a finished tool call from a finished task.

Acceptance: awaiting approval displays a named action in every surface; pause is
quiet; checking a result reads as verification; cancellation never celebrates
success; two concurrent sessions cannot overwrite each other's status.

## Priority 1: give the notch a focused job

Source evidence: native overview content is primarily categories and settings.
`hudSections()` combines workspace pages, settings, and plugin configuration.
`syncNativeNotch()` normalizes all non-plugin category kinds to `setting`, losing
the distinction between a workspace destination and a setting.

Improve:

- Default overview: current task title, short action, target, elapsed time, and
  the next useful action. Show an attention count when another task needs input.
- Keep a compact idle state, an expanded task glance, and a conversation view.
  Keep routine updates passive; expand for a user request or required action.
- Put settings and plugin inventory behind a secondary destination. Use distinct
  names/icons for workspace pages and configuration.
- Retain stop/take-control and open-result actions within easy reach.
- Preserve the companion's playful presence while keeping status understandable
  without animation or character expression.

Acceptance: a user can answer what is running, where it is working, and whether
  they need to act from one glance; settings remain reachable by keyboard.

## Priority 1: make Hermes handoff invisible to the conversation

Source evidence: `frontend/hermes/app/hud/handoff.ts` documents a gateway session
event stream bound to one socket. Moving into HUD transfers that binding; leaving
requires resume/hydration and draft synchronization. This is a working recovery
mechanism, with a significant continuity boundary worth testing.

Improve:

- Explicitly coordinate which renderer owns the live stream, with acknowledgment
  and reconnect handling. Alternatively, evaluate runtime-owned fan-out so views
  can observe the same session while one owns submission.
- Preserve transcript position, draft, attachments, pending approval, session
  identity, and in-flight turn when moving among inspector, widget, and notch.
- Make engine choice explicit: existing conversation versus default for new
  conversations. The current pill already makes this distinction in its menu;
  improve the compact surface so the distinction is discoverable before opening it.
- Keep Send and Stop dominant. Group dictation, conversation voice, wake word, and
  read-aloud into a labeled voice control with visible active-mode feedback.
- Replace generic empty-chat promises with context-aware starters such as
  "Explain this terminal error" or "Review these selected files" when applicable.

Acceptance: switch surfaces during streaming, approval, voice, and reconnection
without duplicate submission or losing a draft/attachment; focus returns to the
expected composer; unavailable engines explain their next useful action.

## Priority 1: make context visible before execution

Source evidence: `frontend/app/view/hermes/hermes-canvas-context.ts` already
creates bounded attachments with stable object/block identity, task status, and
verification metadata. Existing selection-to-agent behavior should be extended
and made legible, rather than rebuilt.

Improve:

- Show a compact "Working with" strip for attached objects and the current
  repository/workspace. Let users remove or inspect each item.
- Distinguish selected content, an explicitly attached snapshot, and a live
  resource reference. Define when each refreshes and what happens if it disappears.
- Let users drag a file/page/window to chat and see the exact attachment produced.
- Before an action, show the actual target when it matters. Revalidate stale
  identities before acting on a changed or closed surface.
- On completion, attach result objects and verification evidence to the task:
  changed files, relevant preview, check results, and remaining failures.

Acceptance: two same-named files remain distinguishable; closing a target does
not redirect actions elsewhere; removed context stays removed; result links open
the relevant object and the user can distinguish completed from verified work.

## Priority 2: adapt preview work to visibility

Source evidence: `use-native-notch-preview.ts` captures eligible stream/sandbox
frames every 1,000 ms while enabled, across discovered blocks. The Electron
consumer selects a single preview on a 750 ms timer and skips work when native
chat is closed. Browser capture uses `stayAwake: true`. There is an opportunity to
avoid producing frames the consumer will not use; energy impact is not measured.

Improve:

- Feed selected preview and visibility back to the producer. Capture only the
  selected surface when it is actually needed.
- Lower refresh rate for unchanged content; suspend on closed/hidden states and
  resume with a fresh frame. Preserve any explicitly requested monitoring mode.
- Add frame age/source identity and clear stale/unavailable labels.
- Bound dimensions, capture cost, queue length, and update backpressure.

Acceptance: hidden notch produces no unnecessary frame work; switching preview
shows the correct source promptly; stale imagery cannot imply an action succeeded.
Measure idle CPU, memory, captures/minute, and energy before setting budgets.

## Priority 2: one workspace system with predictable presentations

The existing OS UI rules already specify content-first composition, live mounts,
flat overview, off-screen recovery, system accessibility, and a connected shell.
Implement and verify that contract across widgets, tabs, canvas, OS, and the newer
web presentation rather than adding another navigation layer.

Improve:

- Keep resource/session identity stable when a presentation changes.
- Share commands for focus, open, move, minimize, restore, and inspect; expose the
  same vocabulary to keyboard navigation and typed agent surface actions.
- Keep a reliable route home, to active work, and to recovery controls at every
  canvas zoom and workspace size.
- Make Activity Center the cross-session place for running, needs-input,
  completed, and failed work, with direct links to the corresponding conversation.
- Give an empty project a short task-oriented setup rather than a mostly blank
  canvas. Restore previous projects and running work intentionally.

Acceptance: presentation changes preserve terminal process, browser state, chat,
and editor buffer; keyboard users can find every live window; windows remain
recoverable after monitor removal; desktop performance stays stable with many
live blocks.

## Priority 2: finish native accessibility and geometry

Source evidence: launcher targets are 28 by 24 points; pager dots use 8 by 14
point frames; category text is 10 points. Explicit accessibility labels are
present for launchers, pager, and previews; voice icons primarily use help text.
The bridge emits fixed chat content height of 364 and uses a chosen notch screen.
The build script already injects reduced-motion handling; retain and test it.

Improve:

- Enlarge hit regions independently of the visible icons. Give all voice controls
  explicit accessible names and state values, and verify their actual AX output.
- Honor increased contrast and reduced transparency alongside reduced motion.
- Test keyboard focus transitions between SwiftUI header and Electron transcript.
- Derive content geometry from the actual panel and validate it across notch and
  non-notch screens, scaling, negative display coordinates, hot-plug, and small
  usable heights.

Acceptance: every action is keyboard/VoiceOver reachable; focus is visible and
returns after collapse; text remains legible; no control depends on color or
motion alone; chat stays within usable display bounds.

## Implementation order

1. Package/runtime health and capability availability. Add a packaged smoke flow.
2. Shared task snapshot and native status adapter, then task-focused notch UI.
3. Conversation handoff tests, visible context, and simplified compact composer.
4. Preview visibility/backpressure, measured performance, native accessibility.
5. Workspace restoration and consistent commands across presentations.

Use a small set of complete journeys as release gates: selected file to reviewed
result; browser task to verified preview; approval in notch to resumed chat;
streaming chat moved across surfaces; crash/reconnect with draft retained;
monitor disconnect with windows recovered. Exercise Hermes and KronosCode, plus
keyboard-only and reduced-motion modes. Keep phone control and other Labs work
explicitly labeled.

## Product and distribution note

`native/coucou/README.md` describes the current Coucou bundle as a personal local
build excluded from release packaging and records separate restrictions for
upstream character/branding/assets. A release-ready KronTerm notch needs an
original asset identity or permission under those terms. The interaction work
above can proceed within the existing personal integration.

## Reference

Apple's feedback guidance recommends consistent, proportionate feedback that
helps people understand state, outcomes, and available recovery actions:
https://developer.apple.com/design/human-interface-guidelines/feedback
