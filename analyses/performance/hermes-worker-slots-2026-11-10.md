# Hermes worker slots: RSS and request latency

The full process measurement runs the pinned Hermes `AIAgent` against scripted
HTTP endpoints on loopback. Every run starts a fresh process with a temporary
home, test credentials and the same prompt, provider script and bridge. No paid
provider, production agent, Electron session or VM is used. Both variants must
pass the same scenario checks. In each pair the variant order alternates.

The process reports resident memory in KiB after the agent is ready, when the
first worker reaches the provider, when the parent response returns, and after
its worker and lease settle. These are snapshots of actual process RSS from
the OS, including the fixture's own
loopback server and shared pages. They do not estimate private memory. A separate
high-water mark captures peaks between snapshots. Parent latency is timed
inside the already initialized process and includes fixture HTTP delays.

The worker slots benchmark isolates the actual adapter lifecycle in a fresh
Python process. Its synthetic load holds thousands of batches simultaneously
so small allocations become visible above page granularity. It shares
preallocated worker identities and a stub budget across batches and excludes
Hermes, timers and HTTP. Setup includes constructing each batch and starting
its workers; completion covers returning each worker result. It validates
every completion and final batch state. Those times describe the integrated
bookkeeping cost, including Python/native boundary crossings.

## Reproduce

Keep a copy of the pre-change `agents/hermes` tree, including its Rust harness.
Build its release library and the current release library using the same toolchain.
The plugin resolves a library from its own directory or from
`<hermes>/harness/target/release`.

```sh
cargo build --release --manifest-path "$baseline_hermes/harness/Cargo.toml"
cargo build --release --manifest-path agents/hermes/harness/Cargo.toml

"$hermes_python" agents/hermes/tests/simulate_harness.py \
    --baseline "$baseline_hermes/plugins" --repetitions 5
for batches in 1 128 8192; do
    "$hermes_python" agents/hermes/tests/benchmark_worker_slots.py \
        --baseline "$baseline_hermes/plugins" --batches "$batches" --slots 4 --repetitions 11
done
```

Set `hermes_python` to the Python executable in the managed Hermes 0.22.5
environment. Set `baseline_hermes` to the pre-change Hermes snapshot. Both
commands accept `--current` to point to a frozen copy of the current plugins.
For loopback comparisons, verify `native_slots` is false for the baseline and
true for the current run.

## Isolated worker bookkeeping

Eleven fresh samples per variant on macOS 26.1 (arm64), with pinned Hermes's
Python 3.14.2. Both variants load their native library before RSS is measured.
Each workload uses four workers per batch. The 8,192-batch case is a synthetic
stress test outside production concurrency; 128 matches the scheduler limit.

| Batches | Baseline/current active RSS (KiB) | Baseline/current RSS increase (KiB) | Baseline/current setup (ms) | Baseline/current completion (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 32,784 / 32,976 | 16 / 112 | 0.013 / 0.068 | 0.015 / 0.021 |
| 128 | 32,944 / 33,424 | 80 / 304 | 0.093 / 1.028 | 0.201 / 0.403 |
| 8,192 | 37,824 / 42,112 | 5,008 / 9,360 | 5.471 / 43.040 | 7.893 / 26.650 |

All figures are medians. The RSS increase is measured per sample before taking
the median. Rust slot ownership increased bookkeeping time and memory in the
isolated test. At one batch, the extra time was tens of microseconds and the
RSS difference is on the scale of a few OS pages. Even the 128-batch workload
added about one millisecond of setup across all batches; this result alone
does not establish an end-to-end Hermes speed or memory change.

[Raw bookkeeping samples](hermes-worker-slots-micro-2026-11-10.jsonl).

## Full Hermes loopback process

Five fresh samples per variant and scenario on the same macOS arm64 machine.
Baseline used the pre-change adapter and its native deadline library. Current
used a frozen copy of the updated adapter and the rebuilt worker slot library.
All 50 runs passed the same functional checks. RSS is shown in MiB and parent
turn time in ms; each cell is the median baseline → current.

| Scenario | Parent turn (ms) | Ready RSS | Parent return RSS | Settled RSS | Peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| accuracy | 1051.5 → 1190.9 | 133.7 → 132.4 | 147.8 → 161.6 | 147.8 → 161.6 | 163.1 → 161.6 |
| delegate | 493.4 → 476.4 | 136.5 → 138.2 | 176.9 → 177.6 | 177.7 → 176.3 | 177.7 → 178.2 |
| inline | 626.7 → 609.0 | 140.3 → 138.9 | 177.8 → 173.8 | 177.8 → 173.8 | 177.9 → 173.9 |
| deadline | 505.2 → 602.4 | 134.7 → 135.1 | 170.0 → 166.6 | 173.1 → 169.8 | 180.5 → 176.2 |
| stop | 386.6 → 398.6 | 140.4 → 140.4 | 179.6 → 179.7 | 181.2 → 181.3 | 181.2 → 181.3 |

The workload exercises the full Python Hermes agent loop, including imports,
HTTP and worker threads. Its measurements describe these fixtures on this
host. RSS and response times vary across repetitions; the comparison does
not isolate an effect from slot ownership or establish an overall Hermes
speed or memory improvement.

[Raw loopback samples](hermes-worker-slots-loopback-2026-11-10.jsonl) include
RSS at the worker's first provider request, worker duration, Stop response
time and endpoint counts.
