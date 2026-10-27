# Agent tool reliability audit — 2026-10-17

## Scope and evidence

Audited the browser/widget RPC path, native desktop MCP client, managed Linux VM queue and driver, shared execution/evidence contract, native stdio proxy, and Hermes Python adapter. The live manifest contains 205 tools: 29 browser/widget tools, 23 native desktop tools, 17 managed VM/task tools, and 136 tools in other families. This is an inventory, not a quality score.

The baseline passed 137 MCP tests and 56 selected app tests. Passing those tests did not rule out the failures below. New regressions reproduced mutable native arguments, stale VM screenshots, mutable VM arguments, missed failure envelopes and mismatched deadlines before their fixes.

Existing user changes to cursor appearance, notch presentation and OS chat were preserved. No commits, VM provisioning, user-desktop input, or external publishing were performed for this audit.

## Findings and implemented changes

| Priority | Finding | Change and evidence |
| --- | --- | --- |
| P1 | Outer 10/30-second deadlines could expire before a 120-second native operation or 80-second VM guest command. Some standalone VM starts had only 45 seconds. | Shared budgets now distinguish native, VM execution, VM observation, start and cleanup. Native proxy, Linux transport and Hermes adapter include matching grace periods. Budget tests cover these paths. |
| P1 | Native calls cloned arguments but sent the original object after waiting in the queue. | The native transport sends the bound clone. A subprocess fixture proves later caller edits cannot change the app or text. |
| P1 | Cancelled native operations could execute after waiting in the queue, continue a sequence, or publish a late success. | Cancellation is checked before and after startup, between native calls and after native results. Queue and late-completion regressions pass. Already-delivered native input is not rolled back. |
| P1 | VM screenshot coalescing could share a frame across an intervening queued click. | Input invalidates screenshot sharing; the next observation queues behind that input. The ordered `screenshot → click → screenshot` regression verifies distinct results. |
| P1 | VM queued actions retained mutable caller arguments and could start after cancellation. | VM inputs are cloned at enqueue and execution rechecks cancellation and authority. System idle cleanup runs outside an expired agent operation context. |
| P2 | VM driver responses with `success:false` could be treated as accepted input. | Explicit failure-envelope detection is shared with the tool runtime. Malformed input responses fail; the original driver message is retained where available. |
| P2 | VM keyboard modifiers accepted `ctrl` but not canonical `Control` or `Meta`; scroll origins were not checked. | Common modifier aliases are normalized and scroll coordinates are checked before sending guest input. Input completion rechecks cancellation and the lease. |
| P1 | Browser waits ignored snapshot `data-wave-ref` IDs. | Snapshots, click targeting, field actions, element inspection and waits use the same reference resolver. IDs with CSS-special characters are escaped. |
| P2 | A hidden wait could never complete after its element was removed. `exists` was confused with visibility. | Removed elements satisfy `hidden`; DOM existence, computed visibility, enabled state, focus and text/value conditions have separate checks. |
| P2 | Open shadow-root controls were absent from DOM observations and reference lookup. | Observation and lookup traverse bounded open shadow roots, respect hidden/inert hosts, resolve shadow-local labels, and descend hit tests. Field events cross component boundaries. Closed roots and frame coordinate mapping remain out of scope. |
| P2 | Offscreen controls could consume a limited snapshot; accessibility enrichment could discard visible DOM-only controls. | DOM observations prioritize viewport controls, include drawing canvases and preserve refs. Chromium names/roles enrich the DOM list without replacing its visible targets or geometry. |
| P2 | One stale accessibility node could discard a whole capture; a hung CDP command could keep the debugger attached. | Stale nodes are skipped and capture has a five-second internal deadline. Cleanup tracks its own debugger attachment and does not detach a replacement session. |
| P2 | Browser typing could report success with no writable field focused; missing renderer scroll targets also reported success. | These cases now fail before insertion/scrolling. Browser setters and clear/select actions reject disabled or read-only controls where applicable. |
| P1 | Explicit `ok:false`, top-level `met:false`, or structured-content failures could escape normalization. Wait failures could carry contradictory verified evidence. | Failure envelopes are recognized before verification. The runtime preserves normal page/command text rather than guessing errors from prose. A failed wait cannot be marked verified. |
| P2 | Native click calls allowed no target or simultaneous indexed and coordinate targets. | Such calls fail before desktop control. Screenshot coordinates are finite and non-negative. |
| P2 | Native typing/scrolling evidence implied a prior observation that the wrapper had not made. Exhausted retries were off by one. | Native evidence no longer invents prior observations. Attempt counts and failed preflight evidence are accurate; contradictory verification status is rejected. |
| P1 | The stdio proxy read whole bodies before applying a cap and did not consistently catch body-stream failures. Transport failures could lose mutation uncertainty. | Streaming reads are bounded, readers are cancelled, errors are structured, and interrupted dispatched mutations retain uncertainty. There is no automatic mutation replay. |
| P1 | Proxy and Python bridge endpoint/redirect handling was less strict than the device/VM transports. | Local HTTP `/native` endpoints only, no URL credentials, no redirects; Python also bypasses ambient proxy settings for this local bridge. Native/Python response limits allow the same 28 MiB envelope as VM/device transport. |
| P2 | Guidance incorrectly claimed task finish never stops an already-running reserved VM. A parity ledger still advertised retired sandbox execution. | Guidance now states the actual reserved-desktop cleanup behavior and names managed `linux_desktop_*` / `sandbox_task_*` tools. Runtime cleanup authority rules remain unchanged. |

## Repeatable Chromium smoke test

`scripts/verify-browser-tools.ts` opens its own hidden, isolated Electron profile and local fixture. It uses actual Chromium accessibility, native page input and canvas pointer events. It does not operate the user's desktop or signed-in browser.

```bash
npx esbuild scripts/verify-browser-tools.ts --bundle --platform=node --format=cjs --external:electron --outfile=/tmp/kron-verify-browser-tools.cjs
./node_modules/.bin/electron /tmp/kron-verify-browser-tools.cjs
```

Observed result: all seven checks passed, including a 30-point canvas drag with the button released. Checks cover accessibility, shadow-root snapshot/click, native page click, text insertion, paced canvas drag, removed-target wait and viewport capture.

## Validation

- Complete MCP suite and build: 150 tests passed.
- Selected Electron/renderer/VM suites: 76 tests passed across eight files.
- Hermes adapter: 22 tests passed in an isolated temporary Python environment.
- Chromium smoke: seven checks passed.
- Full `task check:ts`: both runs passed.
- Targeted ESLint: zero errors; three pre-existing warnings in VM readiness and unrelated TabClient code.
- `git diff --check`: passed.

## Remaining limits and next verification

1. Browser snapshots are a bounded control inventory enriched from Chromium accessibility, not a complete cross-frame accessibility tree. Cross-origin iframe coordinates and closed shadow roots need separate adapters.
2. Cancellation prevents queued work and rejects late success; it cannot undo a click, key or guest command already delivered. After an interrupted mutation, inspect the target before repeating it.
3. Native desktop tests use a subprocess fixture. Actual Accessibility/Screen Recording permissions, duplicate app identities, multiple displays and OS window movement need a real-device acceptance pass.
4. VM tests exercise queue/driver/lease behavior with fixtures. No VM was provisioned or booted for this audit, and no user reservation was invented. Actual guest boot, reconnect, resolution changes and driver recovery still need an assigned VM.
5. Browser smoke covers native input and straight continuous canvas dragging. A dedicated multipoint freehand stroke tool is not implemented.
6. Acknowledged input is not proof of the user's intended outcome. Content-level verification remains necessary after actions; evidence distinguishes acknowledgment, observation and verification.
7. Automatic native-app re-resolution or blind replay on transport failure was deliberately not added: it could operate on the wrong window or repeat an external action.
