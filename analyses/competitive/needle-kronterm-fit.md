# Needle 2 fit for KronTerm

Date: 2026-09-06

## Decision

Run a bounded integration pilot. Use a KronTerm-tuned Needle model as an optional, local intent and toolset router in
shadow mode. Do not make it KronosCode's planner, conversational model, or direct tool executor.

The best first target is the seven-way task classification currently handled by `classifyHarnessTask()` and the mapping
from task classes to existing KronTerm toolsets. Needle should recommend a task class/toolset; the existing ACP
capability lease, tool policy, approval flow, and KronosCode planner must remain authoritative.

Strategic choice: **integrate and pin upstream**, with a narrow adapter and a kill switch. Do not fork Needle or make it a
hard dependency until the pilot clears the acceptance gates below.

## Analysis state

CPA6 (decision deferred) moving to CPA7. KronTerm already has the relevant tool taxonomy, runtime boundary, and safety
controls. The missing evidence is whether a tiny local model can beat the current deterministic router enough to justify
its packaging, evaluation, and maintenance cost.

## Job to be done

For short, unambiguous requests, choose the right task class and candidate toolset locally and quickly, reducing the
context and routing work sent to a larger model without weakening approvals or recovery behavior.

Needle is a 45M-parameter, 14 MB tool-calling model with a vendor-reported 28 MB session footprint, constrained JSON
decoding, a 256-token sliding window, confidence gating for the base weights, and built-in retrieval that exposes only
the top five tools from a larger catalogue. It produces function calls rather than general free text. These properties
fit narrow routing much better than coding-agent planning. See the
[Needle repository](https://github.com/cactus-compute/needle),
[API contract](https://github.com/cactus-compute/needle/blob/main/doc/apis.md), and
[model card](https://huggingface.co/Cactus-Compute/needle2).

## KronTerm fit

KronTerm already has:

- Seven task classes and nine named toolsets in `emain/acp/acp-harness.ts`.
- A regex classifier that maps each request to one class and then to recommended toolsets.
- Approximately 154 registered MCP tools, with many semantically adjacent workspace, widget, browser, terminal, and
  sandbox actions.
- ACP capability leases, explicit approval requirements, scoped surface policies, and a managed KronosCode runtime.
- A product boundary stating that KronosCode is the desktop's AI engine and KronosChamber must not embed another model
  runtime.

Needle therefore fits as a small internal KronosCode routing primitive, not as a second agent. A development-only shadow
adapter may live near the ACP harness for measurement, but production ownership should remain behind the packaged
KronosCode boundary.

## Alternatives and substitution evidence

| Alternative | Same job? | Strength | Limitation | Decision |
| --- | --- | --- | --- | --- |
| Current regex classifier | Yes | Deterministic, instant, inspectable | Keyword order and vocabulary are brittle | Keep as fallback and baseline |
| Needle 2 router | Yes | Local, tiny, constrained output, large-catalog retrieval | Requires domain tuning; tuned confidence is disabled | Pilot in shadow mode |
| Primary KronosCode model | Yes, plus much more | Best semantic and multi-step reasoning | More latency, context, and provider cost | Keep as fallback and planner |
| Needle as full agent | No | Cheap local calls | Cannot replace long-context planning, coding, or conversation | Reject |

## Capability assessment

| Capability | Needle fit | KronTerm implication |
| --- | --- | --- |
| Task-class routing | High after a successful tune | Best first experiment |
| Toolset retrieval | Medium | Useful second stage after task classification |
| Exact argument grounding | Low/unknown | Never trust without validation and approval |
| Multi-step coding/planning | Poor | Keep in KronosCode's primary model |
| Offline/privacy-sensitive use | High | Bundle weights/engine; disable telemetry and downloads |
| Safety policy interpretation | Poor | System facts do not act as instructions; policy remains application-owned |
| Cross-platform desktop packaging | Medium | Prefer Node/WASM for the first portable build; benchmark native runners later |
| Mobile Labs commands | Potentially high | Separate future experiment; do not present as generally available |

Needle's documentation explicitly recommends a two-pass strategy for large catalogues and says tool selection improves
with a few hundred clean examples, while argument grounding generally needs thousands. It also states that fine-tuning
does not update the confidence head; tuned weights return `confidence: None`. See the
[fine-tuning guide](https://github.com/cactus-compute/needle/blob/main/doc/finetuning.md).

## Local smoke test

Environment: Apple Silicon, `cactus-needle` 2.0.12 from the 2026-09-05 repository head, base weights, telemetry disabled.
This was a small directional probe, not a product benchmark.

| Probe | Result | Interpretation |
| --- | ---: | --- |
| Seven-way KronTerm task-class routing, one enum-valued tool | 0/10 exact | The base model often refused the abstract classifier |
| Seven task classes represented as separate route tools | 1/10 exact | Tool descriptions alone did not teach KronTerm's taxonomy |
| Five representative workspace tools | 3/8 exact tool + arguments | Simple presentation/focus calls worked; move/resize grounding did not |

The engine reported roughly 46 MB peak RAM during these probes, above the vendor's 28 MB headline but still small for
desktop use. Warm-query decoding was fast; end-to-end latency should be measured through the planned production adapter.

An independent public evaluation reported a similar pattern on a 16-tool voice-assistant catalogue: a small tune improved
tool selection more than argument grounding. This is anecdotal and predates the current quantization-aware training path,
but it reinforces the need for KronTerm-specific held-out tests rather than trusting generic benchmarks. See
[Needle issue #61](https://github.com/cactus-compute/needle/issues/61).

## Recommended architecture

```text
User request
    -> deterministic safety and scope checks
    -> Needle route recommendation (shadow mode first)
    -> task class + candidate KronTerm toolsets
    -> ACP capability lease and actual tool allowlist
    -> KronosCode primary model plans
    -> ACP approval/policy validates each side effect
    -> KronTerm MCP tool executes

On missing, invalid, unsupported, or disputed routing:
    -> current deterministic classifier or KronosCode primary model
```

Use `complete()`, not Needle's automatic `run()` loop. Treat every generated call as untrusted input. Revalidate the tool
name and arguments against the live MCP JSON Schema, apply the active surface capability, and preserve the existing ACP
approval and idempotency behavior.

For deployment, first test the published Browser/Node WebAssembly build so one adapter can cover KronTerm's desktop
targets. The model card also publishes native runners/libraries and a WASI component, but the platform matrix is not
uniform (for example, its documented macOS command-line runner is Apple Silicon). Bundle pinned model and engine assets
inside the release; never rely on a first-run Hugging Face download. Set `DO_NOT_TRACK=1` or `NEEDLE_TELEMETRY=0`.

## Fine-tuning plan

1. Freeze the output taxonomy: the seven `AcpHarnessTaskClass` values and the current `KronTermToolsetId` values.
2. Build a gold evaluation suite before training:
   - clear single-class requests;
   - ambiguous near-neighbors such as coding vs. debugging and review vs. research;
   - KronTerm workspace commands that mention code or bugs incidentally;
   - missing arguments, negation, corrections, and off-topic requests;
   - destructive/external-side-effect requests;
   - multilingual cases if they are in product scope.
3. Start with 500-1,000 reviewed examples for task/toolset selection. Include at least 15-20% refusal, ambiguous, and
   adversarial examples. Do not train on raw `history.jsonl`, prompts, file contents, secrets, or authentication data.
4. Fine-tune with LoRA and quantization-aware training, then evaluate the exported `.cact`, not only the float adapter.
5. If tool-level selection is promising, use a two-stage model: select a toolset, then select one tool from the reduced
   catalogue. Do not train argument generation until routing itself clears the gate.
6. Argument grounding, if pursued, needs several thousand varied and reviewed examples plus per-field exact-match tests.
   Keep it read-only or confirmation-required until production evidence is strong.

## Acceptance gates

Ship the router only if it meets all of these on a frozen, unseen test set:

- At least 95% task-class exact accuracy and at least 99% recall for direct workspace-control requests.
- At least 99% correct rejection/fallback on off-topic, missing-argument, negated, and ambiguous requests.
- No tool execution by Needle itself; 100% of side effects continue through existing schema, scope, and ACP approval checks.
- Measurably better end-to-end routing accuracy than the current regex baseline.
- Warm p95 routing latency below 100 ms on supported desktop hardware.
- Peak incremental memory below 75 MB and packaged incremental size below 30 MB per target.
- Clean offline startup with pinned assets, telemetry disabled, and no network attempt.
- Kill switch and deterministic fallback pass process-death, timeout, malformed-output, and model-version-mismatch tests.

If the tuned router cannot clear these gates, keep the deterministic classifier and spend effort on better tool grouping,
descriptions, and hard allowlists instead. That still captures much of Needle's proposed value without shipping another
runtime.

## Key risks

- Fine-tuned weights have no calibrated confidence score, removing one of the base model's strongest safety mechanisms.
- A 256-token window and function-call-only contract are intentionally too small for agent planning.
- KronTerm's 154 tools contain many near-neighbor names and overlapping argument shapes.
- Model/archive compatibility is tied to engine generations, so release upgrades require pinned artifacts and regression
  testing.
- Python/JAX is appropriate for training, not for KronTerm's production desktop runtime.
- The upstream project is moving quickly; pin exact source, model, engine, checksums, license, and SBOM entries.

## Final recommendation

**Yes to a measured pilot and narrow fine-tune; no to making Needle the KronTerm agent.** The most defensible product
value is instant, offline task/toolset routing that reduces large-model work while preserving KronosCode's authority.
The current base model is not accurate enough on KronTerm vocabulary, and tuned confidence is unavailable, so shadow
evaluation and application-owned safety are non-negotiable.
