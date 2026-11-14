# MACU swarms, tool reliability, and performance

Date: 2026-11-09. Investigation of the current working tree by six GPT-6.1 Sol researchers plus the parent review. Existing application changes were preserved. This document proposes implementation; no swarm runtime or UI changes were made.

## Recommendation

Use the actual MACU planner, graph validation, and replanning implementation behind a versioned Python sidecar. Keep execution, authority, scheduling, persistence, and verified outcomes in KronOS. Pin the upstream source and retain its Apache notices. This is an extraction and adapter project: MACU does not expose a ready-made KronOS coordinator API.

MACU's current runner is coupled to OSWorld and VM workers. Its research semantics allow failed, timed-out, or cancelled predecessors to release dependent work. Initial plan validation can also exhaust retries and continue with a warning. Those behaviors must not become production effect semantics. Preserve MACU's useful planning logic while validating every initial/revised graph at the KronOS boundary.

Adopt selected patterns from BrowserMesh, Galaxy, AutoCua, and Cua. Adding all five runtimes would duplicate target ownership, transport, and lifecycle management. Existing KronOS browser, device, VM, ACP, and Hermes adapters are substantial reuse points.

## Research coverage

| Researcher | Scope | Evidence |
| --- | --- | --- |
| MACU integration | Planner, graph revisions, OSWorld coupling, local workflow seams | [Detailed report](./macu-swarm-research-2026-11-09/macu.md) |
| Browser tools | BrowserMesh, widget sequences, observation, target isolation | [Detailed report](./macu-swarm-research-2026-11-09/browser.md) |
| Runtime reliability | Hermes/ACP delegation, admission, deadlines, persistence | [Detailed report](./macu-swarm-research-2026-11-09/runtime.md) |
| Galaxy coordination | Device registry, scheduling, disconnect and outcome handling | [Detailed report](./macu-swarm-research-2026-11-09/galaxy.md) |
| Emulator execution | AutoCua, Android/iOS identities, lifecycle and capture | [Detailed report](./macu-swarm-research-2026-11-09/emulators.md) |
| VM execution | Cua/Lume, existing QEMU/Tart paths, pools and resource limits | [Detailed report](./macu-swarm-research-2026-11-09/vms.md) |

Pinned upstream sources:

| Repository | Reviewed commit | Relevant license |
| --- | --- | --- |
| [MACU](https://github.com/kohjingyu/multi-agent-computer-use/tree/5b1b8f91dfc5dc66a2f06af4b443b3009a9cd105) | `5b1b8f91dfc5dc66a2f06af4b443b3009a9cd105` | Apache-2.0 |
| [BrowserMesh](https://github.com/scrollDynasty/BrowserMesh/tree/a70271ed3abd164b2f2858ce36c8b138a60b4f4a) | `a70271ed3abd164b2f2858ce36c8b138a60b4f4a` | Apache-2.0 |
| [UFO Galaxy](https://github.com/microsoft/UFO/tree/eae3c0a8d168c47cb10df0652e293e092eda1078) | `eae3c0a8d168c47cb10df0652e293e092eda1078` | MIT |
| [AutoCua](https://github.com/ComputerUseAgent/AutoCua/tree/f104c6d5343dd80b64bb02276446131602311970) | `f104c6d5343dd80b64bb02276446131602311970` | MIT |
| [Cua](https://github.com/trycua/cua/tree/6285c481d2d867eb954a6e6c5531ba8a88182832) | `6285c481d2d867eb954a6e6c5531ba8a88182832` | Component-specific; see VM report |

## Fix before increasing concurrency

These are source-level findings, not claims of observed production incidents. The linked research reports include precise paths and regression scenarios.

1. **Stop widget sequences on failed actions.** `mcp-kron-term/src/index.ts:2940` records raw action results and advances. The renderer can return `success: false` without throwing (`frontend/app/store/tabrpcclient.ts:785`), and the native bridge preserves that response. A failed click can be followed by typing or pressing a key. Normalize action envelopes and return completed steps, failure index, and whether an effect is uncertain. Test a failed click followed by an action that must never execute.
2. **Align worker and tool-access deadlines.** Electron grants a fixed 300 seconds (`emain/delegation-policy.ts:10`); the Python harness accepts different budgets. The Python active-child timer can finish between child startups, and an expired model hook still reaches its next call (`agents/hermes/plugins/kronterm-tools/delegation.py:233`, `:240`, `:273`). Use the accepted grant deadline throughout, account for admitted-but-not-started children, and reject late startup/model dispatch.
3. **Reserve capacity atomically.** Delegation checks capacity before asynchronous readiness and counts leases rather than workers (`emain/delegation-policy.ts:59`). Python's completed-turn marker is set after results, so concurrent same-turn calls can both be admitted. Introduce atomic worker-slot reservations, stable batch IDs, and separate admission/completion state. Capacity returns only after effect settlement or fenced target invalidation.
4. **Make outcome evidence explicit.** A completed marker can suppress repair without a usable summary or complete batch result (`delegation.py:216`). Require validated per-node outcomes and postconditions; represent partial, failed, cancelled, and uncertain outcomes separately. MACU dependencies normally release only after verified success; explicit failure branches can inspect failures.
5. **Fence browser and widget effects.** A pending-promise set is not a mutation queue. Hold an exclusive lease across a sequence on the actual resource: guest page, renderer focus, native desktop, device display, or VM. Browser partitions may share authentication state even when block IDs differ. Opaque refs must bind to document/target generations rather than accepting a page-controlled attribute as authoritative.
6. **Separate response timeout from effect settlement.** A local WSH timeout can reject before the renderer's effect is known. Revoking authority prevents new input but does not undo dispatched input. Mark uncertainty, keep the resource fenced, and reconcile before retry or reassignment.
7. **Give Android instances unique identities.** Discovery currently uses `android-avd:<name>` when it resolves an AVD name (`emain/device-simulator/android/android-simulator-service.ts:120`). AutoCua-style parallel copies of one AVD would share that ID. Separate template identity from launched instance ID, serial, and generation before enabling clone swarms.

## Performance work with measurable value

| Change | Current evidence | Measurement and constraint |
| --- | --- | --- |
| Semantic-only observations when vision is unnecessary | Widget snapshots always add a screenshot; native and CLI paths make separate calls | Compare p50/p95 latency, payload bytes, RPC/process count, and task success. Keep fresh visual evidence available. |
| Structured image results and bounded batches | Widget sequence snapshots embed base64 inside JSON text | Return image content or evidence references. One bounded renderer batch can reduce transport overhead without skipping per-step failure checks. |
| Per-target health checks and coalesced discovery | Assigned device actions can enumerate the fleet twice | Instrument discovery count/action and backend time. Cache inventory, not authorization or control generation. |
| Shared preview producer per visible target | Android captures via ADB per frame; iOS already retains streamed frames | Bound frame queue to latest frame, stop producers with no subscribers, measure CPU and capture latency. Observation for action verification remains fresh. |
| Durable transitions separated from UI progress | WorkflowStore synchronously serializes/writes/clones the whole journal on the main thread (`emain/workflow-store.ts:202`) | Measure event-loop delay, bytes written, and subscriber payloads under realistic history. Preserve ordered durable commits and crash recovery. |
| Ready-branch scheduling | WorkflowStore runs one step at a time per run, although independent runs can overlap (`:598-632`) | Run independent branches on distinct leased targets; preserve success-gated dependencies and resource budgets. |
| Global device/VM budgets and optional warm pools | Device farm allows four batches of up to four launch workers, without a unified host budget | Limit boot slots separately from resident memory/CPU and model concurrency. Measure cold/warm readiness and foreground UI responsiveness. |
| Bounded activity retention | Activity timeline caps events per run but not the number of runs | Parent check retained 10,000 completed-run events with a per-run limit of two. Add global retention/TTL and a latest-by-target/session index. |

There is no measured end-to-end speedup yet. MACU's published benchmark results do not establish performance on KronOS. Avoid a universal worker-count default: browser workers and full VMs have very different costs.

## Proposed runtime contract

```text
User task + scoped target inventory
  -> MACU planning sidecar: plan / revise / aggregate proposal
  -> KronOS graph and capability validator
  -> Durable node/attempt ledger + ready queue + resource admission
  -> Existing ACP / Hermes workers
  -> Browser | widget | Android | iOS | Linux VM | macOS VM adapters
  -> Verified observations/artifacts -> ledger -> MACU replan + UI projection
```

Use stable `swarmId`, `nodeId`, `attemptId`, `workerId`, `planRevision`, `targetId`, `targetGeneration`, `operationId`, `deadline`, and evidence IDs. The host maps opaque lease grants to allowed operations. A model-provided target identifier alone never grants control.

Node states should distinguish pending, ready, reserving, running, verifying, succeeded, failed, blocked, cancelling, cancelled, and uncertain. An empty ready queue needs an explicit reason and wake condition. Replanning runs asynchronously so waiting for a model does not block cancellation, completed-result processing, or independent ready work.

Replan patches use a revision check, validate acyclicity and target grants, and preserve running/completed attempt identity. Bound attempted planner calls, cost, and time, not only accepted graph edits. Persist dispatch intent and verified results. After restart or disconnect, reconcile uncertain effects before replaying a mutation.

## Surface integration

- **Browser widgets:** keep the existing Electron guests. Bind block, guest, document generation, and partition; isolate storage only when the task calls for separate sessions. Borrow BrowserMesh's explicit IDs, per-session FIFO, and bounded observations. A separate headless BrowserMesh service is optional for work that does not need an embedded widget.
- **Other widgets:** prefer typed widget/terminal/file operations with postconditions. Share the existing persistent block owner; do not mount another live widget just to show an agent preview. Serialize operations that depend on renderer focus.
- **Native desktop:** grant exclusive interactive ownership of a shared display/input resource, respecting user takeover. Different app windows are not automatically independent input targets.
- **Android:** unique instances, exact ADB serials, reserved console/ADB port pairs, task-owned ephemeral copies, and bounded cleanup. AutoCua supplies useful launch patterns, not a durable warm pool.
- **iOS:** retain the existing per-UDID serve-sim integration and attach coalescing. Add managed reservations/prewarmed disposable devices where useful. Track whether the task booted a device so cleanup does not shut down a user's pre-existing simulator.
- **VMs:** KronOS's singleton HVF QEMU path already runs pinned CUA Driver in its Linux guest. Generalize that instance boundary for independent guest disks, SSH/viewer endpoints, queues, and generations. The Tart macOS path is currently an owner-scoped VNC viewer without the Linux-style agent lease/guest protocol; add and verify that adapter before advertising macOS swarm control. Retain existing runtimes until a measured provider gap justifies another backend. Borrow Cua's remove-before-claim pool admission, token rotation, finite warm count, and TTL. Lume saved-memory restore needs distinct machine/network identities and is separate from disk cloning. Device and VM support remains Labs until validated.

## Subagent UI: existing foundation and pending idea

The user's visual idea is still pending. No new appearance was chosen.

`frontend/hermes/app/agents/subagent-theater.tsx` already supplies agent tabs, selected-agent screenshots, bounded activity, model/goal, and a stop action. `frontend/app/view/hermes/subagent-surface-source.ts` captures only the selected child every two seconds, rejects captures from an old block generation, and stops polling on close. Completed agents use recorded evidence. Existing status-stack and OS presence hooks are reusable.

Extend the data contract before choosing visuals: stable worker identity, target name/type, node/attempt, truthful lifecycle, waiting reason, evidence freshness, and stop/inspect/take-over outcomes. Add lease/target generation to preview attribution; block equality alone cannot prove ownership after reassignment. Preserve selected-only full-resolution capture, optional low-rate visible thumbnails, and no hidden preview polling. Show concise activity and outcomes rather than raw internal reasoning.

Parent review reproduced unbounded cross-run timeline retention. `getAll()` currently flattens and sorts every retained run when opening a surface subscription (`frontend/types/agent-activity.ts:109-127`; `subagent-surface-source.ts:49`). Index latest evidence and bound completed history before expanding the viewer to many workers.

## Delivery slices and acceptance gates

1. **Tool and delegation correctness:** regression tests for failed sequence steps, deadline alignment, late starts, atomic admission, missing evidence, stale targets, and cancelled/uncertain effects. Keep behavior changes small and independently reviewable.
2. **MACU browser/widget pilot:** pin/extract the planner, add typed plan/replan protocol, durable per-node attempts, and two workers on independent targets. Test same-target exclusion, failed prerequisites, replan revision conflicts, crash recovery, and user takeover.
3. **Device and VM Labs adapters:** unify target identity/lease contract, global resource admission, readiness, owned cleanup, and incremental worker dispatch. Test same-AVD copies, serial/port reuse, disconnect, and cancellation during boot.
4. **Subagent presentation:** incorporate the user's visual idea using the established runtime event contract. Verify agent switching, stale-frame rejection, stop acknowledgements, keyboard/reduced-motion behavior, and bounded capture/render cost.
5. **Measured rollout:** compare 1/2/4 workers on reproducible browser/widget/device/VM tasks. Record verified completion rate, unintended/repeated effects, critical-path and p50/p95 task/tool latency, cancellation drain, model cost, CPU/RAM, and event-loop delay. Gate concurrency increases on results.

## Validation and limits

- Runtime researcher: 7 existing Python delegation tests and 66 existing Vitest tests passed.
- Parent: 17 existing tests passed across activity normalization, OS presence, subagent surface capture, and the subagent viewer. Viewer tests emitted React act-environment warnings.
- Total: 90 existing targeted tests passed. These tests do not cover every new finding and are not an end-to-end swarm certification.
- Parent bounded-retention probe: 10,000 distinct completed runs retained 10,000 events despite a per-run cap of two. This establishes retention shape, not observed UI latency or heap size.
- No app restart, emulator/VM launch, runtime installation, provider task, or benchmark was performed. Existing working-tree changes remain in place. Vitest wrote its configured ignored report.
- Detailed reports contain pinned upstream versions and source references. Static findings need targeted reproduction/regression tests before fixes; expected speedups require measurement.
