# HUD and agent tool reliability — October 16, 2026

## Contract

Tool discovery must advertise names the agent can actually call. HUD operations must retain the exact tab/block/renderer and leave the hidden workspace hidden. Read-only route recovery must not cross into another renderer; mutations must not be replayed when delivery is uncertain. Assigned native desktops retain their stricter window-group policy.

## Concrete causes and fixes

1. Hermes aliases `browser_navigate` and `tool_search` to protect its own built-ins, but discovery results and the status guide still returned canonical server names. The adapter now translates search queries back to server names and translates discovery/status/workflow results and schema descriptions to the actual exposed names. Ordinary page/widget content is untouched.
2. A ready native notch with collapsed chat was incorrectly reported as inactive HUD mode. HUD detection now follows the live companion even when its chat window is hidden, and resets on HUD exit. Native tool readiness switched the main workspace tab before HUD mutations and screenshots. Mounted HUD tabs now stay in place. An unmounted assigned HUD fails explicitly rather than revealing/switching the workspace. A stale detached island no longer falls back to another renderer's tab route.
3. Native background operations had a 45-second helper budget but general server deadlines of 10/30 seconds and client deadlines of 15/35 seconds. Background-workspace operations now have a 120-second server deadline and 125-second native proxy/Hermes transport budgets. Cancellation/timeout is still bounded; uncertain results require inspection rather than replay.
4. Transport loss or a malformed response after a mutation could lose uncertainty metadata. The Python adapter now retains explicit non-retryable uncertainty for those outcomes. Invalid timeout arguments reach server schema validation rather than crashing Python's timeout calculation.
5. The MCP guide incorrectly said `browser_open_tab` preserves the current page. It is an in-place navigation alias. Both agent guides now explain the one-page widget model, explicit separate-surface creation, HUD recovery rules, and assigned native background-workspace routing.

## Validation

- 89 tests passed across native bridge, native HUD IPC/lifecycle, HUD actions, renderer surface controller and workspace observations.
- 14 MCP execution, manifest and capability-policy tests passed.
- 19 Python adapter tests passed.
- The actual server manifest contains 205 tools. A cross-runtime contract check registered all 205 through the Python adapter, verified unique exposed names, identical input schemas, canonical handler forwarding and capability checks. That check performed zero live actions; it does not certify every application workflow.
- Strict MCP TypeScript build passed. Whole-repository TypeScript result is recorded below.

Artifacts: `hud-tool-catalog-contract-2026-10-16.json`; test logs are under `/tmp/kronterm-hud-*`.

These checks exercise routing, schemas and adapter behavior. They do not establish that a model will always select the correct tool, or that every native app supports every accessibility operation. No external publishing, destructive app actions or live HUD changes were performed during this pass. Already-running Hermes processes need to reload the plugin and system prompt before receiving the Python/prompt changes.

The final whole-repository pass also exposed five current-tree typing errors in HUD workflow navigation, an asynchronous preview guard, a synchronous Python-discovery spawn option and an unreachable workflow-profile comparison. They were corrected with targeted changes; the expanded HUD/runtime/workflow suites passed after those repairs.

Final verification: 122 HUD/runtime/workflow/renderer tests across eight suites, 19 Python adapter tests and 14 MCP catalog/execution/policy tests passed (155 tests total). The final full-repository TypeScript check passed with exit 0 and no diagnostics. The combined rerun initially hit ENOSPC; after deleting only this task's disposable compiler/catalog files it passed. No unrelated files were removed. Restart KronTerm/its managed agent runtime to load the new adapter and prompt in an already-running process.
