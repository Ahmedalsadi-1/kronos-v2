# Computer execution and model routing

## Implemented transport improvements

The existing MCP client already retained its native subprocess, exposed warmup, and offered deterministic action sequences. The new changes validate the same-app scope and bounded sequence at the client boundary, serialize client operations to prevent other requests interleaving a sequence, and ensure initialization finishes before tool requests. Failed actions stop remaining mutations; an explicitly requested final observation still runs. Startup replacement handles old-process events without clearing the new process.

Existing `kron_computer_diagnostics` now includes bounded aggregate latency measurements: initialization/startup, warmup, cold and warm calls, queued operation wait, individual native tool transport, sequences, failures, and timeouts. Percentiles retain at most 128 durations per recognized operation. Unknown names aggregate as `other`; arguments, app identity, screenshots, result text, and model content are never retained in metrics. Timings are in memory and reset when the MCP process restarts. These are measurements, not a demonstrated speed improvement.

## Separate engine feasibility

`emain/acp/acp-types.ts` defines existing KronosCode and custom ACP backends. `emain/acp/acp-connector.ts` discovers installed backends and starts configured ACP processes. `emain/acp/acp-agent-manager.ts` uses `session/set_model` with the engine's advertised model IDs. `emain/kronterm-native-tool-bridge.ts` executes an installed non-Hermes ACP specialist by backend name and preserves workflow context and permission handling.

There is no registered Vy backend, verified Vy ACP executable, documented transport adapter, or known model-provider contract in that integration. The prior client inspection is insufficient to supply these. A separate Vy engine therefore needs a supported API or executable protocol and a capability/permission adapter. No proprietary implementation was copied.

A shared router is feasible when a second engine can select models through its advertised ACP models or consume the same configured provider endpoint. Backend-local model IDs cannot be assumed interchangeable. Map each common model selection to the engine's supported model/provider ID, validate availability, and retain a clear unsupported state rather than silently substitute a model. Current workflow computer profiles honestly use the existing KronosCode backend; they are not a separate Vy engine.

## Remaining work

Measure real task baselines and compare completion accuracy before claiming faster computer use. Native app observation timing includes the native tool's work and IPC together; model delay and screenshot encoding subphases need separate instrumentation in their own runtimes. Same-app sequences still need fresh accessibility references and cannot prevent a human or another external process changing the app between actions. Workflow node execution remains serial while the UI/runtime integration is in progress.

Independent ready-node concurrency needs a separate runtime design pass: current resource locks are run-level, code steps share one worktree/checkpoint history, and each run stores one active question. Parallel native mutations, overlapping repository edits, and simultaneous permission questions would otherwise compete. Require per-step resource claims, independent checkpoint ownership, and multiple durable active questions before enabling parallel side effects.
