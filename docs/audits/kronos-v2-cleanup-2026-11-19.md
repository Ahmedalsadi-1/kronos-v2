# KronOS V2 unused-source cleanup

Date: November 19, 2026 (America/New_York).

## Result

Reviewed all 222 paths from the first audit. Removed 120 source files containing 23,001 lines.
Kept 102 because a consumer still exists, the file supports tests/previews, or runtime discovery
and standalone entry points make deletion unsafe. No tests were deleted or weakened.

The old audit is a historical snapshot. The authoritative per-file decisions, reasons and
incoming references for this cleanup are in `kronos-v2-cleanup-decisions-2026-11-19.json`.

## Removed groups

- 52 files from the retired AI panel, ACP chat UI and `kronoscode-v2` message renderer.
- 30 duplicate application components, mostly the old `components/hermes-ui` copy and UI wrappers.
- 9 unreferenced element components.
- 3 older tab/canvas implementation files: `workspace-canvas.tsx`, `tabgroup.tsx`, `tabbar-model.ts`.
- 26 unused helpers, prototypes, barrel exports and superseded interface pieces across other folders.

Only the reviewed source files were removed. Shared agent logos, compatibility models,
persisted layout migration, backend runtimes and shared styles were not treated as unused
merely because a retired UI once used them. File-picker preview examples were updated to point
to the current Hermes implementation, and active directory guides no longer point to deleted files.

## Why 102 candidates were retained

The original packaged-entry graph was deliberately a candidate finder, not a deletion list.
The follow-up resolved actual runtime paths, considered type declarations, scanned sources beyond
the packaged entry graph and checked explicit runtime-discovery mechanisms. Examples:

- `frontend/hermes/contrib/plugins.ts` discovers plugins with Vite's `import.meta.glob`.
  Bundled Kanban, bots, surface and tapflow plugins and their dependencies are retained.
- `frontend/hermes/computer/upstream/computer-viewer.js` is used by the computer widget.
  Resolving runtime JavaScript must not stop at its TypeScript declaration file.
- Browser Sessions, Electron events and preview/history helpers have current live consumers.
  Several uses were added after the initial audit.
- Standalone Hermes bootstrap, debug tools and pet/quick-entry/wake-indicator roots remain protected.
- Preview and test-supported code remains, including native file workbench, project/environment
  helpers, tab layouts, workflow utilities and the three legacy ACP utilities with direct tests.
  They are not represented as confirmed live V2 UI just because tests reference them.

A file with only test or preview consumers was kept conservatively. Retiring those surfaces
and their dedicated tests would be a separate decision; deleting an implementation while leaving
its test or preview imports broken is not a safe cleanup.

## Safety checks

1. Verified the pre-cleanup source commit on GitHub at
   `codex/pre-dead-code-cleanup-2026-11-19` (`672c5df50822ddd856e62608df705d5d98800208`).
2. Checked that every removed file was tracked and unchanged before deletion. Concurrent edits
   elsewhere in the shared checkout were excluded from this cleanup.
3. Examined imports and literal module paths in current renderer/main code, declarations,
   previews, tests, configuration, scripts, mobile, MCP, integrations and agent/backend sources.
   External integration checkouts and generated distribution outputs were excluded; embedded
   JavaScript adapters inside `frontend/` and `emain/` were included after the plugin check below.
4. Protected plugin globs and standalone entry points, then propagated retention through their
   dependencies. The removed files form a closed group: no retained scanned source imports one.
5. Repeated the reference check after deletion, resolving retired paths even though they no longer
   exist. Result: zero remaining import/literal-module-path consumers of the 120 removed files.
6. Full test suite before cleanup: **424 suites, 2,193 tests passed**.

The first post-cleanup run found a real missed dependency: the bundled bots plugin imports
`bot-sections.tsx` from its embedded JavaScript adapter. That screen was restored and the
reference scan expanded to include embedded adapters rather than excluding every folder named
`upstream`. The renderer build then found that the Artifacts UI, in a gitignored source directory, still
uses the pagination component. That component was also restored; the reference scan now includes
gitignored renderer/main source explicitly. The same run also hit timing failures under concurrent
builds/checks. No failing test
was removed or loosened. Final post-cleanup test, TypeScript and build results are recorded when
verification completes.
No Go production source, database migration, saved workspace data or published installer was changed.
