# Rust and runtime performance pass

Date: 2026-11-09

This pass improves the existing KronOS Agent implementation. It does not convert
KronOS, the guest operating systems, or third-party emulators entirely to Rust.

## Implemented boundaries

| Layer                                        | Implementation                        | Work in this pass                                                                                  |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Agent action fencing and deadlines           | Rust library, Python FFI              | Indexed fence expiry; one shared deadline queue instead of one waiting thread per delegation batch |
| Agent conversations and provider integration | Managed Hermes, Python                | Correct worker-slot completion and shared native deadline dispatch                                 |
| Tool and screenshot presentation             | Electron/React/TypeScript             | Bounded history and image retention; coalesced preview work; hidden-view capture suppression       |
| Linux guest automation                       | Existing Rust `cua-driver`            | Retained; not replaced with a new control stack                                                    |
| Linux VM engine                              | QEMU using macOS HVF                  | Coalesced readiness checks and safer viewer/shutdown lifecycle                                     |
| Android and iOS integration                  | Platform engines with KronOS adapters | Inventory, capture, and stream work reviewed separately from engine replacement                    |
| Desktop shell and backend                    | Electron/TypeScript and Go            | Remain in their existing languages                                                                 |

## Evidence and limits

- The native scheduler keeps a bounded, monotonic queue and preserves the old
  native timer ABI. The adapter caps outstanding and cleaning batches and uses
  one dispatcher for successful batches. Expired batches can require separate
  cleanup work.
- The Rust action-fence table can reclaim an expired entry at capacity without
  scanning all 4,096 entries under its mutex.
- A deterministic VM test verifies that eight simultaneous cold status requests
  share one PID check and one SSH readiness probe. These are simulated command
  counts, not a measured eightfold VM speedup.
- Activity history retains at most 64 recent run buckets, 120 entries per bucket,
  and a conservative 32 MiB of image-string payloads. This is a history budget,
  not a bound on total renderer or decoded-image memory.
- QEMU guest RAM remains 2,048 MiB and the Android launch setting remains 1,536 MiB.
  Reducing these blindly can increase guest swapping or cause failures. No live
  guest RAM or boot-time improvement is claimed.
- No paid model provider or live VM/device was exercised by these changes' tests.
- Emulator discovery no longer schedules shutdown of machines merely because
  they appear in the inventory. This prevents stopping an externally started or
  actively used simulator. The tradeoff is explicit cleanup: running simulators
  keep consuming memory until the user shuts them down.
- Named Android AVDs remain excluded from swarm target assignment until the
  control grant can pin an exact emulator transport instance. A stable AVD name
  alone does not prove that the same emulator instance is still running.

## Reproduce the measurements

Build the native library with `npm run build:agent-harness`, then run:

```sh
python3 agents/hermes/harness/scripts/benchmark_deadlines.py
node --experimental-transform-types scripts/benchmark-mjpeg-parser.mts
```

The parser command uses Node 24. The timer benchmark compares the retained legacy
native ABI with the shared scheduler, using fresh processes. The frame benchmark
checks byte equality and frame counts before timing.

Observed on the development machine during this pass:

| Isolated workload                                 | Before     | After    |
| ------------------------------------------------- | ---------- | -------- |
| Watcher threads for 64 pending delegation batches | 64         | 1        |
| Median timer setup for those 64 batches           | 2.627 ms   | 0.167 ms |
| Parser time for 300 fragmented 512 KiB frames     | 221-224 ms | 15-17 ms |

Timer peak-RSS differences use the process high-water mark. A zero measured
increase means it did not exceed an earlier peak; it does not mean zero memory
usage. None of these numbers measure end-to-end model latency or guest RAM.

Validation included 112 desktop/frontend tests, 45 Python adapter tests, six Rust
tests, and 15 pinned-Hermes loopback runs (five scenarios, three repetitions).
The loopback scenarios cover duplicate actions, inline results, background work,
deadline expiry, and Stop with a scripted local provider. Native loading was
also checked using a plugin-local library in an isolated temporary directory.
The final full TypeScript check, Rust Clippy with warnings denied, Electron
main-process bundle, and whitespace checks passed.

Older native libraries retain the previous native timer ABI. If the native
library is entirely unavailable, the adapter still has its existing optional
no-budget compatibility behavior; this pass does not make every execution path
Rust-only. Packaged/development runtime setup must build and ship the native
library to use the measured scheduler improvements.

## Rust VM migration

The existing QEMU configuration already uses hardware acceleration. QEMU documents
HVF support on macOS for x86 and Arm in its
[system introduction](https://www.qemu.org/docs/master/system/introduction.html).
Android likewise documents platform hypervisor and graphics acceleration in its
[emulator acceleration guide](https://developer.android.com/studio/run/emulator-acceleration).
Changing an orchestration wrapper's language does not change guest RAM allocation.

[libkrun](https://github.com/libkrun/libkrun) and
[krunkit](https://github.com/libkrun/krunkit/blob/main/docs/usage.md) are candidates
for a separate Rust VMM experiment on Apple Silicon. They have not been installed
as the default VM engine. [Firecracker's prerequisites](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md)
require Linux KVM, so it is not a direct macOS replacement.

A replacement needs the same guest workload and memory allocation for comparison:
measure boot-to-ready, peak and idle resident memory, CPU while idle, screenshots,
input latency, browser correctness, disk migration, shutdown, recovery, and signed
application packaging. Preserve existing VM disks and platform simulator support
until the candidate passes those checks.
