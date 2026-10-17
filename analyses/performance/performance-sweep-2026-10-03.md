# KronTerm performance sweep - 2026-10-03

Three subagents investigated canvas interaction, Electron icon loading, and terminal/view lifecycles. The changes below reduce verified unnecessary work. They do not establish a 90% improvement in total app latency, CPU usage, startup time, or frame rate.

## Verified improvements

| Workload | Before | After | Evidence |
| --- | --- | --- | --- |
| Canvas geometry with 600 pointer samples over 60 display frames | 600 geometry updates | 60 updates | Deterministic scheduler regression: 90% fewer updates |
| Ten unchanged native app artwork requests | 10 PNG decodes and 10 plist subprocesses | 1 decode and 1 plist subprocess | Reproduced failing baseline, then passing regression: 90% fewer operations |
| Three overlapping requests for identical artwork | 3 conversions | 1 conversion | Reproduced failing baseline, then passing regression |
| Idle work from 100 closed terminals over one simulated minute | Recursive timers could continue indefinitely, roughly 1,200 callbacks/minute when idle callbacks run promptly | Zero remaining timers or cache callbacks | Fake-timer lifecycle regression |
| Canvas dimension resets for 360 same-size AppStream screenshots | 720 assignments | 2 initial assignments | Regression verifies all 360 frames still draw: 99.7% fewer resets |

These workloads are synthetic operation counts, not measured end-to-end speedups. Canvas gains depend on the input event rate relative to display refresh. The native icon cache retains at most 512 entries and still validates bundle/icon metadata. Terminal benefits accumulate as terminals are opened and closed.

## Implementation

- `frontend/app/tab/workspace-canvas.tsx` and `workspace-canvas-frame.ts`: coalesce geometry work to animation frames, retain the latest pointer position, flush before completion, and remove listeners/cancel frames on teardown. Freehand drawing retains every sample; pan momentum uses the original input sampling time.
- `emain/emain-app-icons.ts`: cache decoded artwork, share overlapping requests, and refresh changed bundles using asynchronous metadata checks. Generic fallback icon behavior is preserved.
- `frontend/app/view/term/termwrap.ts`: cancel recursive timers, pending idle callbacks and debounced resize; unsubscribe shared file events; guard initialization after disposal; settle writes if xterm drops queued callbacks at teardown.
- `frontend/app/view/appstream/appstream.tsx` and `appstream-canvas.ts`: reuse same-size canvas backing buffers, clear before drawing to preserve transparent frame correctness, and resize only dimensions that actually change.

## Validation

Validation passed 67 tests across eleven suites (64 in a combined ten-suite run plus 3 in the adjacent AppStream suite), covering the new regressions and adjacent canvas/terminal/stream behaviors. Targeted lint passed with configured rules retained and `parserOptions.project` disabled to avoid duplicating the whole-project TypeScript program. Terminal lint reported two existing empty-catch warnings and zero errors.

Prettier checks passed for the new helpers/tests, terminal implementation, and icon implementation/tests. Changed integrations passed diff whitespace checks.

The default `npx tsc --noEmit` exhausted Node's approximately 4 GB heap. A retry with `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false` completed with six errors in untouched Mochi files: duplicate `roll` identifiers and non-callable `roll` uses in `frontend/app/view/hermes/mochi/bot-engine.ts`, missing `tgOy` in that file, and missing `draw` in `frontend/app/view/hermes/mochi/mochi-canvas.tsx`. No diagnostics referenced these performance changes. Full-project type validation remains unsuccessful; the unrelated files were left untouched.

```sh
npx vitest run emain/emain-app-icons.test.ts \
  frontend/app/tab/workspace-canvas-frame.test.ts \
  frontend/app/tab/workspace-canvas-utils.test.ts \
  frontend/app/tab/workspace-canvas-drift.test.ts \
  frontend/app/tab/workspace-canvas-agent.test.ts \
  frontend/app/tab/workspace-canvas-task-graph.test.ts \
  frontend/app/view/term/termwrap-lifecycle.test.ts \
  frontend/app/view/term/focusreportguard.test.ts \
  frontend/app/view/term/controller-errors.test.ts \
  frontend/app/view/appstream/appstream-canvas.test.ts \
  frontend/app/view/appstream/appstream.test.ts
```

## Remaining measurement

A read-only three-second native sample of the running Electron main process and one renderer showed mostly native wait stacks; it did not provide useful JavaScript attribution or a controlled before/after baseline. The running app was not restarted, and its process snapshot is not evidence that these source edits have reached the packaged app.

To establish the overall benefit, compare the same built app and saved workspace before and after these changes. Measure startup-to-interactive time, frame intervals while dragging and streaming, terminal-output latency, and CPU/memory after repeatedly opening and closing terminals. Record display refresh rate, input rate, active agents, and open surfaces. Use median and p95 values from repeated runs. An overall 90% target remains unverified.
