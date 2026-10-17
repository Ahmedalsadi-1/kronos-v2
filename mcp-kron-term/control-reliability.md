# Agent control reliability

The shared tool registry serves Hermes, KronosCode, and native MCP clients. Workspace,
widget, browser, terminal, file, and HUD tools accept optional `targetWorkspaceId` and
`targetTabId`. A widget's `blockId` resolves its owner automatically. Conflicting IDs
fail before execution. Restricted web surfaces retain their original scope.

Use `workspace_inventory` to discover owners and the user's viewing context. The
caller workspace can differ from the visible workspace. `viewEvidence` distinguishes
current focus from the last known focus; inactive-app state is not proof that the user
is looking at that workspace. Native HUD windows and islands have their own geometry.

Use `workspace_snapshot` for presentation, visibility, and geometry. `uservisible`,
`visiblefraction`, `clipped`, and `centeroccluded` describe rendered evidence.
`visualassessment` flags small or clipped content and possible occlusion. Overlap can
be intentional in OS mode. Verify visual quality with `workspace_screenshot` before
claiming that a layout looks good. World coordinates and viewport CSS pixels differ.

Model reads do not activate the workspace. Mounted background renderer reads preserve
its active tab; input and screenshots may activate the explicitly targeted tab.
Read-only widget inspections preserve widget focus. Routed operations in one workspace
are serialized to avoid agent tab-switch races; independent workspaces can proceed
concurrently. Inventory requests share in-flight work, with no persistent topology
cache to survive closures or restarts.

Ordinary reads have a 10-second server budget; actions have 30 seconds. Explicit waits,
sandbox startup, and delegation use longer bounded budgets. Client socket budgets
include a grace period. Cancellation reaches RPC and CLI operations. Only stale-route
reads receive one automatic recovery attempt. Mutations are never blindly replayed.
A cancelled or timed-out mutation can have an uncertain outcome: inspect state first.
Embedded unsuccessful results and unmet wait conditions are errors.

`tool_diagnostics` returns the last 100 samples and median/p95 latency by tool,
transport, and observed presentation, plus failure counts. Samples contain identities
and timings, not tool arguments, widget contents, or credentials.

## Validation and measurement

Run the MCP and Hermes adapter suites plus the affected Electron/renderer tests:

```sh
npm --prefix mcp-kron-term run test
uv run --with pytest python -m pytest agents/hermes/tests/test_kronterm_tools.py -q
npm run check:ts
node --import tsx mcp-kron-term/test/control-transport.bench.ts
```

The transport benchmark isolates subprocess overhead with a local fixture. In one
50-iteration run, CLI median/p95 were 4.50/6.73 ms and resident execution was
0.013/0.046 ms. This is not a live renderer or model benchmark and does not establish
the planned 30% end-to-end p95 improvement.

Validation passed: 77 affected Electron/renderer tests, 62 MCP tests, 7 Hermes
adapter tests, TypeScript checks, and the affected Go packages. The development
renderer, main process, and preloads built successfully. Workspace RPC discovery
also includes unnamed workspaces while the saved-workspace selector keeps its
existing filtering.

An isolated development profile exposed an SDK mixed-Zod schema failure during
native discovery. That failure was fixed and added as a regression test. Restarted
native discovery then correctly reported a missing attached agent surface instead
of success. The configured Hermes model provider returned HTTP 403, preventing a
complete live agent workflow. No provider credentials or settings were changed.

The full live matrix and before/after p95 comparison remain unverified. Exercise
creation, focus, movement, resize, terminal input, browser navigation, and widget
interaction across widgets/tabs/canvas/OS and another workspace. Inspect screenshots
and `tool_diagnostics`, require no wrong-target actions or false success, and compare
latency with the same workflow on the baseline build. Keep test widgets separate from
user work. Synthetic transport measurements do not meet this live acceptance gate.
