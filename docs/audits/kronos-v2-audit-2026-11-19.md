# KronOS V2 source audit

Audit date: November 19, 2026 (America/New_York).

## Backup and scope

Before edits, commit `f216ef4ce23e3d0e933986d84be5dc0e7dc008d1` was pushed and verified on
`origin/codex/pre-audit-checkpoint-2026-11-19` in `Ahmedalsadi-1/kronos-v2`.
It preserves 1,482 changed paths, including pending source, branding, prototypes and media.
The n8n nested worktree is preserved as a binary-capable patch plus base revision under
`.checkpoints/pre-audit-2026-11-19/`; the nested branding pages checkout is archived there.
Ignored runtime data and unrelated embedded sibling repositories were outside this checkpoint.
Remote `main` had an additional logo commit, `7e787ed27`; it was integrated on this audit branch
without overwriting the newer local website implementation.

The static import scan covered 1,876 non-test frontend and Electron source files against the
packaged main, preload and renderer entry points. It reached 1,654 and flagged 222 candidates.
It includes type imports conservatively. String-based runtime loading, plugin discovery,
external consumers, native bridges, Go code and separately built integrations need separate
classification before deleting candidates. The inventory records the scan before browser-session
wiring was repaired. Preview and test files are excluded from the graph, not from all text searches.
This is a source audit and regression run, not a claim that every product journey is bug-free.

## Findings repaired

| Priority | Finding | Change and evidence |
| --- | --- | --- |
| P1 | Browser Sessions had a frontend API declaration and tested backend, but no preload implementation or IPC registration. | Connected `browserSessions` to trusted `browser-sessions` IPC and the existing backend. Added trusted/untrusted caller coverage. Registered private partitions only after allowed webview attachment. |
| P2 | Downloads requested the same session settings every second while the panel was open. | Electron download start/progress/completion now invalidates session observers through preload. The panel subscribes before its initial read, coalesces overlapping requests, and unsubscribes on unmount. Tests cover session isolation, observer destruction, event delivery and request coalescing. |
| P2 | The brand generator still regenerated the obsolete 04-E folded cube, undoing responsive logo work. | Updated the compact/expanded masters and generator. Refreshed all PNG sizes, ICO, ICNS, docs, onboarding and website marks. Installed app and DMG use the purple center mark; the interface uses purple/light and silver/dark artwork. |
| P2 | Updating the older OS shell alone missed the current V2 canvas toolbar. | Applied compact/expanded artwork to the current `OSPenWorkspaceChrome` sidebar toggle, retaining its existing action and accessible name. Compact mark was observed in the running V2 app. |
| P2 | Two SVG component usages failed TypeScript because their declared component type accepted no props. | Converted start-page and launcher branding to image URL imports with accessible names and explicit dimensions. |
| P2 | The presentation switcher offered Tiles/Tabs even though V2 normalizes all presentation names to OS. | Derived offered presentations from the canonical active presentation list. Legacy saved names still migrate to OS. |
| P3 | Seven failing baseline tests included obsolete presentation expectations and incomplete Electron mocks. | Kept the OS-only V2 contract, made the legacy workflow test explicitly request its legacy canvas input, aligned Hybrid device expectations with the existing device-policy coverage, and isolated Android preview-server startup in IPC tests. No access policy was broadened by this repair. |

## Unused and duplicate implementation findings

1. **P2: retired AI UI remains in source.** The scan flags 55 files under `frontend/app/aipanel/`,
   including `aipanel.tsx`, `acp-chat-panel.tsx`, `kronos-chat-hub.tsx`, `ChatMessageListV2.tsx`
   and the nested `kronoscode-v2/` message renderer. This is a concrete V1/V2 layering example:
   the old ACP panel imports a second-generation message renderer, while the current desktop uses
   `frontend/app/view/hermes/` and `frontend/hermes/`. The full candidate paths are in the JSON inventory.
   These files were not bulk-deleted: secondary consumers, styles, assets and preview coverage must
   be classified as a group before removal. There is no packaged-entry import path in this scan.
2. **P2: old workspace branches remain behind an OS-only presentation facade.**
   `workspace-presentation.ts` reads/publishes only OS, while workspace components and
   `os-workspace.tsx` retain conditions for tabs, widgets, web, canvas and older canvas/design views.
   V2 is selected in `makeInitialOSModeState`. Remove unreachable presentation UI in a dedicated
   cleanup that preserves saved-layout migration and shared block ownership; do not delete data
   migration identifiers just because their old presentation is retired.
3. **P2: Builder API declarations exceed the actual preload bridge.** An AST comparison found
   `showBuilderAppMenu`, `onNavigate`, `onIframeNavigate`, `openBuilder`, `closeBuilderWindow`,
   `setBuilderWindowAppId` and optional `onBuilderInit` absent from the main preload.
   `tsunami.tsx` still calls `getApi().openBuilder(...)`; `keymodel.ts` still calls
   `closeBuilderWindow()`. These older Builder actions need either retirement in V2 or restoration
   of their complete host implementation. They were recorded rather than given no-op implementations.
4. **P3: other unreachable candidates.** The graph flags 33 component files, 22 tab files,
   17 Hermes plugin files and smaller groups. Some plugin files are expected false positives because
   plugin discovery can use runtime paths. `NativeBrowserTools` and `NativeFileWorkbench` have
   recurring model lookup timers but are themselves outside the packaged-entry graph; removing their
   timers alone would not reduce current production requests.

**Retained compatibility:** `emain/kronoscode-runtime.ts` is still imported by application lifecycle,
ACP transport/delegation and tool code. It is not dead solely because the product name is retired.
`resolveBlockView` also deliberately migrates old chat view names to Hermes. Go module names,
Wave identifiers and existing persistence keys were preserved.

## Repository and bundle findings

- **P2: incomplete embedded-repository mappings.** Git tracks `IOS-emulator`, `doop` and
  `packages/kronbotd` as gitlinks, but `.gitmodules` maps only `integrations/n8n/upstream`.
  `git submodule status` fails on the first missing mapping. A normal clone cannot initialize
  these entries through the current submodule configuration. Classify them as required V2
  dependencies or remove the obsolete gitlinks in a separate repository cleanup.
- **P3: generated media is a substantial backup cost.** Pending untracked content was about
  957 MB, predominantly promo videos and generated outputs. The checkpoint pack was 792 MiB;
  GitHub initially returned HTTP 500 and the HTTP/1.1 buffered retry succeeded. Decide which
  outputs belong in version control and which should live in release/media storage before
  future mass checkpoints.
- **P3: lazy imports do not always split bundles.** The development build reports mixed static
  and dynamic imports for Hermes `open-session`, `skills/index` and noVNC. These modules still
  enter shared eager chunks through their static consumers. Removing duplicate import paths
  needs runtime-boundary review; a `lazy()` wrapper alone does not prove a feature is deferred.

## Polling inventory and event conversion plan

The renderer/Electron text scan found 114 timer-related matches and the Go scan found 14.
These are search matches, not 128 network pollers: they include type annotations, comments,
animations, clocks, retry delays, maintenance and connection heartbeats. The snapshots include
pre-repair Downloads polling. Exact paths and intervals are in the timer inventory files.

| Surface | Existing refresh | Event path or reason to retain |
| --- | --- | --- |
| Browser Downloads | 1 second while open | Converted to Electron download events in this change. |
| HUD surface list and previews (`surface-islands.tsx`) | 1 second list, 1.5 second preview | Publish registry/focus/layout invalidations for list data; previews require capture/frame notifications, not just a generic state event. |
| Hermes surface plugin (`plugins/kronterm-surfaces/plugin.tsx`) | 1.2-3 seconds | Shares concerns with HUD list/preview polling; consolidate consumers on one invalidated query cache once a bridge event exists. |
| DeviceWorkspace | 5 seconds, plus window focus | Add main-process target lifecycle notifications and shared target state; external simulator changes still need provider observation or a bounded fallback. |
| N8nWorkflows / OSOriginalWorkflow | 5 seconds / 1.5 seconds | Runtime start/stop and native editor document changes should invalidate one shared workspace state source. Local CustomEvents alone do not cover all external runtime mutations. |
| ImageStudio / RenderComparison | 5 seconds for pending jobs / 4 seconds refresh | Subscribe to ComfyUI queue/execution WebSocket events, reconcile once on connect/reconnect, then share job state between views. Retain bounded recovery until producer events are integrated. |
| Agent terminal progress | 1 second local model lookup | Subscribe to model registration and shell-status/command atoms; agent activity itself already has a stream. This is local polling, not a data API request. |
| Browser tab thumbnails | 5 seconds while visible | Trigger on page/loading/visibility/frame changes and debounce; pages can animate without navigation events, so define a thumbnail freshness budget. |
| Logs / project files / bot section file | 5 seconds or view-aware refresh | File watching or gateway log events can invalidate consumers; reconnect must trigger a fresh snapshot. |
| Billing / OAuth / update checks / health probes | Various | Remote services may offer no client event feed. Use visibility, bounded backoff and deduplication; replacing a client timer with an upstream timer is not an event conversion. |
| WebSocket ping, SSE heartbeat, ACP keepalive | 5 seconds or protocol-specific | Keep connection liveness semantics; these are not repeated data reads. |
| UI clocks, reminders, animation, cursor-follow, cache cleanup | Various | Retain or use deadline scheduling where appropriate. They serve time-based behavior rather than waiting for data changes. |

No broad conversion was made without a producer that can actually notify every mutation.
All future conversions should establish the subscription before the first snapshot, merge or
invalidate updates while a read is pending, reconcile after reconnect, and dispose on unmount.

## Verification

- Baseline: 413 passing suites, 5 failing suites; 2,172 passing tests, 7 failing tests.
- After initial repairs: 422 suites and 2,186 tests passed. Concurrent work added independent tests
  during the run, so the increase includes more than this audit's new coverage.
- Final browser/V2 focused batch: 5 suites and 18 tests passed, including the new session IPC wiring.
- All generated PNG dimensions and transparency checked; ICNS header length and 128/256/512/1024
  chunks decoded successfully. Both expanded theme assets were rendered and inspected.
- Live V2 app inspection confirmed the compact silver mark. The app was actively being used, so
  expanded interaction was not forced while other activity was ongoing.
- `npm run check:ts` passed (exit 0).
- Development main, preload and renderer builds completed; renderer transformed 22,770 modules.
  Vite reported existing browser-externalized Electron imports and mixed static/dynamic imports.
  The build was run against a live shared checkout; subsequent Electron/preload wiring was
  covered by the focused browser tests and requires a restart to exercise in the running app.
- No Go production code was changed; no `go build` was run. Backend network/service integration,
  signed installer creation, DMG installation and published release replacement were not performed.

## Visual acceptance

Design read: existing KronOS desktop branding for workspace users, using the user's supplied
chrome artwork; ENERGY 1 / RHYTHM 1 / MOTION 1. The chrome/purple treatment is the supplied
identity, and the existing sidebar action determines compact versus expanded composition.

- Asset identity PASS: supplied three-shape artwork and center shape preserved in the integrated masters.
- Theme assets PASS: silver/dark and purple/light variants rendered and inspected.
- Accessibility PASS: sidebar action retains its accessible name, expanded state and keyboard button behavior;
  added a visible focus outline to the V2 brand button.
- Scope PASS: no new product sections, claims, decorative controls, motion or user flows were introduced.
