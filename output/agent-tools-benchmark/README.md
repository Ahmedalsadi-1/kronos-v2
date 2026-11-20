# Agent tools and VM history validation

Measured November 17, 2026 on the current Apple Silicon development host. These are local transport/tool timings, not model-token latency or a claim about all workloads. No working VM was restored or restarted. Browser tests used a separate temporary guest tab, which was closed afterward.

## Measurements

| Operation | Result |
| --- | --- |
| Warm VM SSH command | 8.3 ms median, 5 samples |
| VM screenshot | 57.2 ms median, 5 samples |
| 99,780-byte source transfer, previous implementation | 2,031 ms median, 50 commands, 3 samples |
| Same transfer, compressed adaptive chunks | 201 ms median, 2 commands, 3 samples |
| Browser nested-container scroll, both axes | 82 ms median, 5 samples |
| Android PNG screenshot | 359.74 ms median, 7 samples |
| Android raw screenshot experiment | 415.66 ms median, before host encoding |
| iOS simctl screenshot baseline | 276.3 ms median, 5 samples |
| Existing iOS live stream | First frame 10 ms; subsequent frames approximately 396 ms apart |

The final source transfer was approximately 10x faster for this compressible fixture, with identical SHA-256 hashes. Adaptive chunks reduce round trips while preserving the command-size limit. Host load affects these measurements; the JSON files retain every sample. Raw Android transport was slower and was not adopted. A compressed-raw experiment was also inconclusive (356 ms median before host PNG encoding), so PNG remains the default.

Browser scrolling requested 37 horizontal and 83 vertical CSS pixels. Chromium applied 37.5 and 82.5 at the guest's current scale, and the tool reported those actual values. The test also verified text filling and no movement at the scroll boundary. Desktop wheel input remains line-quantized; use the browser scroll tool for precise web scrolling.

The iOS changes remove helper CLI launches for taps, remove the fixed 50 ms gesture tail delay, reject premature socket closure, and require a new frame after input. No end-to-end live tap speedup is claimed: the measured stream itself still updates at approximately 2.5 FPS on this host.

## Implemented behavior

- Guest file edits require the SHA-256 returned by read and a unique old-text match; replacements are atomic and preserve permissions.
- Compressed file transfers remain byte-exact for Unicode and incompressible data.
- Guest commands return exitCode, stdout, stderr, durationMs, timedOut and truncation status, including failing tests. Execution is bounded to 55 seconds and 3,000 output bytes per stream; larger logs can be redirected to files.
- Browser tools support exact page selection, unique-selector click/fill, condition-based wait, and nested scrolling with actual before/after positions.
- Selected-VM desktop inputs return an after-image by default. A capture failure after delivery explicitly instructs the agent to observe instead of repeating the action.
- Android capture sharing is invalidated by input. iOS pre-input frames cannot be reused as after-images.
- Agent guidance now specifies conflict recovery, condition-based browser waits, scroll-boundary handling, and observation after uncertain action delivery.

## VM history

The VM viewer has a History panel and the agent has sandbox_vm_history. Named checkpoints retain parent relationships. Restore saves the departing state automatically, allowing forward navigation to that saved state. Restore invalidates the old control generation and queued actions even if the monitor reply is lost.

QEMU live checkpoints include disk and memory; stopped checkpoints include disk only. Restore memory checkpoints while running, and disk-only checkpoints while stopped. VMs launched before this update need one normal stop/start to expose the local QMP monitor. History is QEMU-only, not a container or emulator snapshot implementation. External website actions are not undone.

Verified using disposable real QEMU instances: disk pattern rollback, automatic pre-restore backup, forward restore, and live HVF memory save/restore. The working VM was not used for rollback tests. Snapshot semantics follow the [QEMU monitor documentation](https://www.qemu.org/docs/master/system/monitor.html).

## Validation

- 93 focused tests passed across 13 suites, followed by passing tests for restore-outcome fencing and failed-command diagnostics (95 distinct tests total).
- Real guest-browser scroll/fill/boundary checks passed.
- Live guest failed-command stdout/stderr/exit-code check passed.
- MCP TypeScript build passed.
- Changed-file lint completed with zero errors; its existing unused-catch warning was subsequently removed.
- Full workspace TypeScript check completed with one error in existing edits: frontend/app/view/webview/webview.tsx:1802, `os:chatdock` not assignable to the accepted setting-key union. See typecheck.log.

Reproduction scripts are alongside this report. They contain this host's VM/device paths and should be reviewed before running against a different machine. Tests create disposable disks or a temporary browser tab; the transfer fixture uses /tmp files and removes them.
