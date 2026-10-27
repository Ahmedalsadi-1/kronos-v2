# KronTerm performance architecture audit - 2026-10-18

## Decision

Keep the current languages and framework for now. This audit found avoidable startup work, process creation, synchronous I/O, and queue scheduling costs. None establishes a need for a whole-application rewrite or demonstrates that Rust would improve the user's actual workflows.

The constraint is feature and behavior parity: preserve workspace presentations, live block ownership, terminal sessions, browser integration, agent tools, editor intelligence, visual quality, cancellation, security boundaries, and recovery. Labs remains Labs.

## Evidence and limits

Reviewed current source for Electron startup/runtime preparation, LSP queries, workflow persistence, renderer bootstrap, model polling, terminal output, canvas scheduling, and WebSocket reconnect. Inspected existing build artifacts and ran targeted regression suites. Existing local changes were included in the inspection and left untouched.

This is an architecture and regression audit, not a completed runtime profile, exhaustive correctness audit, security audit, or release certification. No controlled cold-start, interaction latency, sustained terminal throughput, Go CPU/heap, or multi-hour memory measurements were collected. A read-only process snapshot cannot attribute latency or establish a useful baseline.

The existing renderer entry artifact was modified on October 14, 2026. Its sizes describe that build, not a freshly rebuilt current checkout or necessarily the running app. Sizes below are uncompressed JavaScript bytes on disk, not memory use or time saved.

## Findings

Priority is investigation/fix order, not a claim of measured user latency.

### 1. Startup pulls substantial optional renderer code into the bootstrap graph

Evidence: `frontend/app/element/streamdown.tsx:9` statically imports `shiki/bundle/web`. `frontend/app/block/block.tsx:16` and subsequent imports register many view implementations eagerly. In the existing build, `dist/frontend/index.html` preloads the Shiki chunk, and the desktop bootstrap imports a seven-file static JavaScript closure totaling 57.05 MiB. That closure contains Monaco (19.55 MiB), Shiki (19.04 MiB), the Wave renderer (7.68 MiB), and graph/diagram/shared chunks. The complete assets directory contains 85.15 MiB across 172 JavaScript files, including workers and optional code that should not all be counted as startup work.

Implication: chunk separation alone does not make a dependency lazy. These artifacts show eager loading, but do not quantify parsing, initialization, or startup latency on current source.

Preserving fix: separate lightweight view registration/model contracts from heavy UI implementation; load editors, grammars, diagram engines, and optional studios when needed. Keep every language, theme, feature, and workspace restoration path. Measure first-use latency as well as startup so deferred loading does not merely move an unacceptable stall to the first interaction.

### 2. Disconnected commands accumulate without a queue budget and replay at ten per second

Evidence: `frontend/app/store/ws.ts:246` appends offline commands to `msgQueue` without a count/byte/age limit. `runMsgQueue()` at line 180 shifts one item and schedules the next after 100 ms. Shutdown clears the queue, but a continuing disconnected session has no local admission bound. Per-message size validation happens during send, after retention. New messages can send immediately while older queued messages are draining.

Implication: sustained producers during an outage can retain increasing memory. A 1,000-item backlog requires roughly 100 seconds of scheduled draining even with an otherwise fast connection; this is derived from the scheduler, not a measured network benchmark. Caller timeouts and cancellation may mitigate some workloads and require tracing before implementation.

Preserving fix: introduce explicit admission/backpressure, cancellation-aware expiry, and a bounded drain budget with ordering rules. Never silently drop tool commands, replay cancelled mutations, or coalesce non-idempotent operations. Report rejection/failure to callers and test reconnect ordering, outages, and sustained producers.

### 3. Agent LSP queries pay a new server lifecycle for every request

Evidence: `emain/emain-lsp.ts:276` reads the file synchronously, spawns a language server, initializes it, opens the document, executes one query, then shuts down/exits the process. `emain/emain-wsh.ts:37` exposes this path to agent requests. The renderer editor has a separate managed session path.

Implication: repeated symbols, hover, definition, references, or diagnostics requests repeatedly incur process and workspace initialization. Parallel requests can create overlapping server work. Actual initialization cost depends on the language and repository.

Preserving fix: investigate a bounded reusable query-session pool keyed by workspace, language, server configuration, and connection identity. Preserve document freshness, correct workspace isolation, diagnostics semantics, request cancellation, crash recovery, idle eviction, and shutdown. Do not blindly reuse an editor session whose unsaved document state differs from the agent's disk query.

### 4. Hermes preparation blocks Electron's main thread

Evidence: `emain/hermes-runtime.ts:161` probes Python with `spawnSync` and a 5,000 ms timeout, enumerates and replaces plugin links, then recursively copies the adapter with `fs.cpSync`. `start()` invokes this at line 618 before launching Hermes. Executable resolution also has a synchronous PATH lookup fallback.

Implication: the main event loop cannot handle other JavaScript callbacks while those operations run. The probe timeout is a possible blocking window, not evidence of a five-second stall on every launch.

Preserving fix: asynchronous probing and filesystem preparation, with generation/cancellation checks and staging before publishing a complete plugin tree. Cache only with adapter/runtime identity validation. Preserve plugin parity, permission modes, startup errors, delegation readiness, and restart behavior.

### 5. Workflow persistence copies and rewrites the entire history per commit

Evidence: `emain/workflow-store.ts:202` synchronously serializes and writes the full snapshot, renames it, clones it for rollback, then produces a fresh full snapshot for each listener. Runs are appended at line 456; this store does not impose a history retention bound.

Implication: individual step updates become more expensive as retained history and subscribers grow, with disk and serialization work on the main thread. No production history sizes or commit durations were measured.

Preserving fix: measure realistic large histories; consider a serialized asynchronous writer or transactional incremental journal/database with paginated reads. Preserve acknowledgement-after-persistence behavior, rollback, ordering, approvals, interrupted-run reconciliation, and crash recovery. Do not gain speed by deleting history or weakening durability.

### 6. Model discovery continues polling after discovery

Evidence: `frontend/app/workspace/native-browser-tools.tsx:19` and `native-file-workbench.tsx:58` look up models every 250 ms while mounted. The file workbench skips this when an explicit preview model is supplied. Existing cleanup clears intervals on unmount. Same-object React state updates may bail out, so four callbacks per second does not imply four rendered frames per second.

Implication: avoidable wakeups scale with the number of participating mounted surfaces; this is a lower-priority cost until measured.

Preserving fix: publish registry/model lifecycle changes or subscribe through an atom. Preserve late registration, model replacement, block-ID changes, and removal, rather than stopping after the first successful lookup and retaining stale state.

### 7. Build checks do not enforce a measured startup budget

Evidence: `scripts/check-build-output.mjs:17` reads an optional build-log file or stdin. Chunk-size checks parse log lines; invoking `npm run check:build-output` with empty stdin passes artifact checks without checking any chunk sizes. The script checks individual chunks, not the aggregate startup import graph or measured time-to-interactive.

Preserving fix: inspect actual output assets/import graphs, explicitly report absent build-size input, and add reproducible startup and first-use budgets. Preserve current packaging checks. A passing packaging check should not be interpreted as performance evidence.

## Existing strengths to preserve

- Canvas pointer work already coalesces geometry updates by animation frame. Earlier regression coverage protects final flush and sample retention.
- Native artwork already uses caching and overlapping-request sharing.
- Terminal teardown has regression coverage for pending timers, subscriptions, and writes. xterm already has accelerated renderer paths; replacing it requires evidence and a demanding parity evaluation.
- AppStream backing-buffer reuse has regression coverage that preserves drawing behavior.
- Go already exposes opt-in localhost pprof, and RPC work has profiling labels (`cmd/server/main-server.go:444`, `pkg/wshutil/wshrpc.go:280`). Use these before considering backend language migration.
- Hermes includes interaction profiling support in `frontend/hermes/debug/perf-live.ts`. Verify how it is enabled in the current build before relying on it.

## Verification

111 tests passed across 12 suites in this checkout:

- Hermes runtime, LSP lifecycle, native artwork, workflow store.
- Canvas frame scheduling, canvas utilities, canvas drift, workspace layout model.
- Terminal lifecycle, AppStream canvas, native file workbench, WebSocket lifecycle.

Machine-readable results: `/tmp/kronterm-performance-audit-tests.json` and `/tmp/kronterm-performance-audit-adjacent-tests.json`. These are behavioral regressions, not performance measurements. Some suites exercise existing uncommitted work.

`npm run check:build-output` passed the existing artifact checks with empty build-log input; the limitation is finding 7.

`npm run check:ts -- --pretty false` passed. No fresh production build was generated, and no application restart or workspace mutation was performed.

## Required runtime baseline before implementation decisions

Use an identified production build and a disposable copy of a representative saved workspace. Record hardware, display refresh, build revision, workspace contents, active agents, and connection state. Compare identical fixtures with repeated runs and report median/p95 plus raw samples.

| Journey | Measurements | Parity requirement |
| --- | --- | --- |
| Cold/warm launch and restore | Time to interactive, main-thread stalls, loaded JS | Same blocks, sessions, focus, and restoration |
| First editor/diagram/code-block use | First-use latency and later-use latency | Same languages, themes, tools, and output |
| Widgets/tabs/canvas/OS switching and drag | Frame intervals, long tasks, interaction latency | Live state and native/browser alignment retained |
| Sustained terminal output and application streams | Output latency, frame delivery, CPU, queue growth | No dropped terminal bytes or reduced stream quality |
| Repeated agent code queries and cancellation | p50/p95 latency, process count, peak memory | Correct workspace/document results and cancellation |
| Disconnect/reconnect with active producers | Queue bytes/count/age, completion order | No silent loss, duplicate mutation, or stale replay |
| Large workflow histories | Commit latency, main-thread stall, recovery | History and persistence semantics retained |
| Repeated open/close and long idle | Process-tree CPU, memory trend, listeners/timers | Sessions and background work retain intended behavior |

Run Go CPU/heap profiles only for the workload that shows backend cost. A native module is justified only if profiles attribute material CPU time to a bounded operation that survives algorithm, batching, and allocation improvements. Evaluate the cost of IPC/copying and cancellation as part of that decision.

Recommended first implementation batch: establish the baseline, remove eager heavy bootstrap dependencies, and make Hermes preparation asynchronous. Address reconnect queue semantics and LSP reuse as separate changes because their correctness risks are higher. No application source was modified by this audit.
