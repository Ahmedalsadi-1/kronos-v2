# Hermes bridge connection reuse and task tracing

The comparison uses managed Hermes 0.22.5 (`bf0203a7`) and its Python 3.14.2
on macOS 26.1 arm64. The baseline is the local pre-sharing snapshot taken
after the worker-slot change. Both variants used the same native harness
binary. The current build ran with tracing disabled and with its opt-in
SQLite trace enabled. Each sample started a fresh process with a temporary
Hermes home, fixture credentials and local endpoints.

The baseline and current bridge plugin SHA-256 prefixes were
`54557431f69e` and `e2e198638ee3`. The current trace module was
`aef0e16f55e8` and the shared native harness was `9bdea5b3b6c4`.

## Reproduce

Use the managed Hermes Python interpreter, the pre-sharing Hermes snapshot,
and a frozen copy of the current plugin if the working tree is changing.
The full-agent run requires the release native harness next to each plugin
root at `../harness/target/release`. The bridge-only run requires Node.js
(`v24.13.0` here).

```sh
"$hermes_python" agents/hermes/tests/benchmark_bridge_reuse.py \
    --baseline "$baseline_hermes/plugins" --repetitions 6

"$hermes_python" agents/hermes/tests/simulate_harness.py \
    --baseline "$baseline_hermes/plugins" --sharing --repetitions 3
```

Both scripts accept `--current` to override the default current plugin root.
The bridge-only benchmark alternates variant order. The full-agent benchmark
rotates baseline, current and current with tracing so each appears once in
each position.

## Bridge-only

The real Python plugin sent 110 successful authenticated POSTs to a Node
HTTP/1.1 fixture per process. The fixture checked the five alternating session
IDs on every request. Socket counts include ten warmup requests. Timing covers
the remaining 100 requests. RSS is for the Python process, with the Node
fixture running separately.

| Metric | Baseline | Connection reuse |
| --- | ---: | ---: |
| Accepted sockets per 110 requests | 110 | 1 |
| Request p50 (ms) | 5.632 | 0.532 |
| Request p95 (ms) | 14.819 | 1.241 |
| Time across 100 timed requests (ms) | 802.652 | 65.806 |
| Ready RSS (MiB) | 32.85 | 32.95 |
| Settled RSS (MiB) | 101.00 | 33.34 |
| Peak RSS (MiB) | 101.48 | 33.34 |

Six runs per variant. Each latency percentile is the median of the six
per-run percentiles.

The benchmark isolates transport, including HTTP client bookkeeping. Its
results describe a small sequential loopback workload and exclude model
calls, Electron tool execution and concurrent agent scheduling.

[Raw bridge samples](hermes-sharing-bridge-2026-11-10.jsonl).

## Full Hermes process

The pinned `AIAgent` talks to deterministic model and native bridge endpoints
in the same process. The native bridge uses HTTP/1.1 with explicit content
length and TCP_NODELAY for every variant. The scripted model service uses the
same responses and delays. No paid provider, Electron workspace, or VM runs.

In accuracy, the bridge returns an HTTP 500 after committing a write.
The agent verifies the write executed once and reads back the result. Inline
exercises the delegation tool, child model execution, evidence return and lease cleanup. Each traced run uses a
fresh database, queried after the latency and RSS snapshots. Accuracy records
one start and end, four model executions and three tool executions. Inline
records two starts and ends, three model executions, one tool execution and
a child start and stop.

| Scenario | Variant | Bridge sockets | Parent turn, median (range), ms | Ready RSS (MiB) | Settled RSS (MiB) | Peak RSS (MiB) |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Accuracy | Baseline | 13 | 461.9 (456.2 to 682.1) | 140.45 | 180.98 | 180.98 |
| Accuracy | Reuse, trace off | 2 | 422.8 (402.0 to 506.9) | 139.47 | 171.72 | 171.73 |
| Accuracy | Reuse, trace on | 2 | 450.9 (426.7 to 504.2) | 141.12 | 172.83 | 172.83 |
| Inline | Baseline | 11 | 638.1 (621.2 to 643.1) | 140.39 | 177.64 | 177.64 |
| Inline | Reuse, trace off | 1 | 552.5 (545.1 to 562.7) | 140.22 | 172.34 | 172.44 |
| Inline | Reuse, trace on | 1 | 566.5 (555.8 to 609.3) | 141.23 | 173.25 | 173.34 |

All 18 runs passed. RSS values are medians across three runs per variant and
scenario. Accuracy used a second socket after the fixture's HTTP 500. Inline
reused one socket for all 11 bridge requests. The loopback comparison
observed lower turn and settled RSS medians in both scenarios with reuse.

Within each round, enabling the trace added a median 24.7 ms in accuracy
(range -2.7 to +28.1 ms) and 10.7 ms in inline (range +3.8 to +56.8 ms).
Median paired settled RSS increased by 1.11 MiB and 0.91 MiB, respectively.
With three rounds and variable host timings, the latency differences are
observations of the fixture rather than a stable estimate of trace cost.

Parent latency starts after agent initialization. RSS snapshots include the
fixture server's threads and shared process pages. Reported memory is OS
resident memory, so it does not isolate private allocations. The scripted
scenario results do not extrapolate to paid models or production RSS.

[Raw full-agent samples](hermes-sharing-loopback-2026-11-10.jsonl).
