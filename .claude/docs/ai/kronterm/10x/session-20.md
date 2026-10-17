# 10x Analysis: KronTerm's Persistent Agent HUD

Session 20 | Date: 2026-10-03

## Current Value

KronTerm combines persistent terminal, browser, file, preview, sandbox, and native-app surfaces. Widgets, tabs, canvas, OS, and HUD are presentations of work. The recent direction is a compact Coucou/Hermes notch that lets the user supervise background tasks and reveal the same working window without losing its session.

The initial target user is someone doing substantial work across browsers, terminals, and files who wants to delegate tasks while keeping immediate control. This is a product hypothesis, not validated customer segmentation. The strongest evidence here is this user's repeated requests: faster interaction, fewer selectors and panels, automatic previews, continuity across OS/HUD, and agents that can actually control their widgets.

The core action should become: **give Hermes an outcome, continue your own work, inspect the relevant live surface when needed, then receive a verified result.** We have no usage telemetry establishing where other users spend their time.

### Evidence and maturity boundaries

- [HUD state controller](/Users/albsheralsadi/kronterm/frontend/app/workspace/kronterm-hud-controller.ts) and [HUD surface actions](/Users/albsheralsadi/kronterm/frontend/app/workspace/kronterm-hud-surface-actions.ts) already preserve widget identities and support revealing/backgrounding existing surfaces. Extend these primitives; do not introduce a second session system.
- [Hermes previews](/Users/albsheralsadi/kronterm/frontend/hermes/app/hud/surface-islands.tsx:28) poll the surface list every three seconds and the selected preview every 1.5 seconds. [Notch publishing](/Users/albsheralsadi/kronterm/frontend/app/workspace/use-native-notch-preview.ts) scans rendered blocks each second; [native HUD capture](/Users/albsheralsadi/kronterm/emain/emain-hud.ts:297) has a separate 750ms refresh loop. These are concrete optimization candidates, not proof of a measured bottleneck.
- [Hermes runtime](/Users/albsheralsadi/kronterm/emain/hermes-runtime.ts) already has health checks and capability refresh. [KronosCode runtime](/Users/albsheralsadi/kronterm/emain/kronoscode-runtime.ts:251) checks protocol and capabilities. A running process and a usable widget tool route are different readiness conditions.
- [Interaction contract](/Users/albsheralsadi/kronterm/mcp-kron-term/src/interaction-contract.ts:100) permits optional verification and defaults evidence to `verifiedAfter: true` when no verifier is supplied. This deserves a call-site audit before treating generic success evidence as reliable.
- [Session 19](/Users/albsheralsadi/kronterm/.claude/docs/ai/kronterm/10x/session-19.md) proposes Hermes as the persistent parent and KronosCode as its coding specialist. The [bundled-agent README](/Users/albsheralsadi/kronterm/agents/kronoscode/README.md) still describes KronosChamber/default-engine boundaries differently. Resolve this product contract rather than present the planned architecture as finished.
- The previous implementation pass reported passing focused tests, but no live restart validation or performance baseline. It also reported unrelated Mochi typecheck failures. Tests do not establish release readiness or a 90% speed gain. Mobile remains Labs.

## The Question

What makes a quiet notch indispensable rather than merely attractive?

**One trustworthy task can continue across every presentation, survive interruption, stay inexpensive in the background, and give the user control in one gesture.** The interface should hide unnecessary chrome while making execution state and recovery easier to see.

## Massive Opportunities

### 1. Persistent task runtime across surfaces

**What:** One durable task identity ties together Hermes conversation, KronosCode delegation, browser sessions, terminals, files, evidence, and checkpoints. Move a task from OS to notch to detached island without recreating its tools. After a restart, reconcile surviving processes and clearly mark unavailable ones.

**Why 10x:** Users delegate outcomes instead of managing a collection of unrelated windows and recovering context after every interruption.

**Unlocks:** Long-running research, coding, and cross-app work that can be supervised intermittently.

**Effort:** Very High. **Risk:** Duplicate ownership or automatic replay of an external action. Presentation restoration must be separated from execution resumption; uncertain mutations must never be silently replayed.

**Score:** 🔥 Must do as the architectural direction; build one vertical slice first.

### 2. Reusable outcome recipes learned from successful work

**What:** After a verified task, offer “Save this workflow.” Preserve steps, required capabilities, input slots, and acceptance checks. Start with developer workflows such as reproduce bug → fix → test → preview → review.

**Why 10x:** Successful work becomes reusable operational knowledge instead of disappearing into transcripts.

**Unlocks:** Repeatable local workflows and eventually portable team recipes.

**Effort:** High. **Risk:** Memorizing brittle coordinates, credentials, or accidental steps. Store semantic targets and reviewable inputs; distinguish deterministic recipes from open-ended agent planning.

**Score:** 👍 Strong, after task identity and verification work.

### 3. Portable task handoff

**What:** Export a task capsule containing intent, artifacts, checkpoints, and required environment. A colleague can inspect and resume compatible work with their own credentials. Begin with an artifact/evidence package before live collaboration.

**Why 10x:** KronTerm could become a place where work is handed over, not just performed individually.

**Unlocks:** Team review, asynchronous continuation, and eventually remote supervision.

**Effort:** Very High. **Risk:** Environment incompatibility, permission differences, and unclear demand.

**Score:** 🤔 Maybe. Validate actual handoff demand before building a platform.

## Medium Opportunities

### 1. End-to-end agent readiness and bounded repair

**What:** Show “Can observe,” “Can act,” and “Coding available” based on actual scoped tool-route probes, not process uptime. Diagnose missing wsh, unavailable KronosCode artifacts, expired capabilities, and stale widget routes. Offer a precise repair action and retry only operations known to be safe.

**Why 10x:** Eliminates the current failure where the agent sounds capable but cannot operate the visible workspace.

**Impact:** A user sees the failing boundary and recovery path without reading daemon logs.

**Effort:** Medium. **Score:** 🔥 Must do. Extend existing health/capability checks.

### 2. One adaptive preview service

**What:** Consolidate selected-surface previews into a shared scheduler. Capture the selected visible preview at a useful rate, update idle thumbnails on change, and pause hidden preview consumers. Keep agent execution independent from visual frame rate. Track capture cost and stale-frame age.

**Why 10x:** The notch can remain responsive as background work grows without every window paying the same rendering cost.

**Impact:** Lower idle overhead and predictable input response across multiple widgets.

**Effort:** Medium to High. **Score:** 🔥 Must do after measurement.

**External support:** Electron recommends measuring resource use and avoiding blocking main/renderer work; this supports profiling and scheduling rather than guessing which visual effects to remove. [Electron performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance).

### 3. Human/agent control ownership with immediate takeover

**What:** Every actionable surface exposes its current controller. A single shortcut pauses agent input to that surface, transfers control to the user, and lets the user return it explicitly. Background execution cannot steal foreground focus. Conflicting agents queue behind a surface lease.

**Why 10x:** Users can trust automation while continuing their own work.

**Impact:** Prevents input collisions and makes “let me do this step” effortless.

**Effort:** Medium to High. **Score:** 🔥 Must do before expanding cross-app autonomy.

### 4. Completion receipts backed by observed results

**What:** Every completed task has a compact receipt: changed items, observed outcome, checks run, unresolved limits, and links to evidence. Distinguish action accepted, result observed, and task verified. Missing verification must remain unknown.

**Why 10x:** Users review evidence rather than rerun the task to learn whether it worked.

**Impact:** More trustworthy coding and browser completion claims; faster handoff to review.

**Effort:** Medium. **Score:** 🔥 Must do. Audit the interaction-contract fallback first.

### 5. Semantic task context and bounded specialist routing

**What:** “Use this window” binds the selected surface and current task context. Hermes delegates repository work to KronosCode through a run card with status, evidence, budget, and cancellation. Capability failures stay attached to that run; users are not sent to another competing chat.

**Why 10x:** Removes repeated explanation and makes specialist work understandable.

**Impact:** Faster start, less wrong-window activity, clearer ownership.

**Effort:** Medium to High. **Score:** 👍 Strong. Resolve the Hermes/KronosCode contract first.

**External support:** Anthropic distinguishes predefined workflows from autonomous agents and recommends choosing the simplest suitable orchestration pattern. This supports explicit routing and bounded recipes before an unrestricted agent fleet. [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).

## Small Gems

| Move | What and why powerful | Effort | Score |
|---|---|---|---|
| Return to my last working window | Persist the selected block ID across notch/HUD/OS; dots and expanded preview address the same identity. Removes repeated navigation. | Low–Medium | 🔥 Must do |
| Attention-only notch | Show working, waiting for you, failed, or verified done; expand only for meaningful attention or explicit user action. Keeps the HUD useful without competing with work. | Low–Medium | 🔥 Must do |
| Preview freshness | Display a quiet stale/unavailable state when capture stops. A frozen image should never imply a live view. | Low | 🔥 Must do |
| Rescue shortcut | One discoverable shortcut restores the task window and agent chat after hiding the side panel and toolbar. Verify keyboard and pointer access in every presentation. | Low | 🔥 Must do |
| Fit, resize, background | Contextual controls on the actual window replace global panels. Remember geometry per presentation and respect display bounds. | Low–Medium | 👍 Strong |

## Ruthless Evaluation

Scores below are product judgments on a 1–5 scale, not measured user research. Reach is estimated relative reach within the initial target audience, not a percentage of customers. Feasibility 5 means easiest.

| Opportunity | Impact | Reach | Frequency | Differentiation | Defensibility | Feasibility |
|---|---:|---:|---:|---:|---:|---:|
| Persistent task runtime | 5 | 5 | 5 | 5 | 4 | 2 |
| Outcome recipes | 5 | 3 | 4 | 4 | 4 | 2 |
| Portable handoff | 5 | 2 | 2 | 4 | 4 | 1 |
| End-to-end readiness | 5 | 5 | 5 | 3 | 2 | 4 |
| Adaptive previews | 4 | 5 | 5 | 3 | 2 | 3 |
| Control ownership | 5 | 4 | 5 | 4 | 3 | 3 |
| Completion receipts | 5 | 5 | 4 | 4 | 4 | 3 |
| Semantic routing | 4 | 4 | 5 | 4 | 3 | 3 |
| Last working window | 4 | 5 | 5 | 3 | 2 | 4 |
| Attention-only notch | 4 | 5 | 5 | 4 | 2 | 4 |
| Preview freshness | 3 | 5 | 5 | 2 | 1 | 5 |
| Rescue shortcut | 4 | 5 | 5 | 2 | 1 | 5 |
| Contextual window controls | 3 | 5 | 5 | 2 | 1 | 4 |

## Recommended Priority

### Do Now

1. Validate the running build end to end: Hermes observes a real widget, performs an authorized reversible action, and reports observed evidence; KronosCode completes a small repository task with a test result. Unit tests alone do not satisfy this gate.
2. Establish a performance baseline for 1, 5, and 10 surfaces: idle CPU, memory, input latency, mode-switch latency, preview age, and capture time. Define what “90% faster” measures before making that promise.
3. Add last-window continuity, freshness state, attention-only notch behavior, and a rescue shortcut. These make the recent removal of panels usable.
4. Check the compact dock geometry: its column is now 72px while item buttons still declare 78px in [OS dock styles](/Users/albsheralsadi/kronterm/frontend/app/tab/os-desktop.scss:246). The smaller container needs a visual overflow check and coordinated control sizing.

### Do Next

1. End-to-end readiness and bounded repair.
2. Adaptive preview scheduling, with performance results compared against the baseline.
3. Surface control ownership and takeover.
4. Verified completion receipts and explicit Hermes → KronosCode run routing.
5. A persistent-task vertical slice that survives mode changes and an app restart.

### Explore

1. Save a successful developer task as a parameterized recipe. Upside: compounding usefulness. Risk: brittle replay.
2. Portable handoff for evidence/artifacts before execution. Upside: collaboration. Risk: premature infrastructure.

### Backlog / Pass for now

- Broad connector marketplace: later, once the supported browser/terminal workflow is dependable.
- General live multiplayer desktop: later, pending handoff demand and ownership semantics.
- More themes, decorative canvas markers, celebratory motion, or another chat surface: ❌ Pass as the next strategic move; the user's current evidence points toward less chrome and more dependable execution.
- Phone supervision: retain Labs status until the desktop task/control contract is stable.

## Category Coverage

Speed: adaptive previews. Automation: reusable recipes. Intelligence: semantic routing. Integration: verified surface capabilities. Collaboration: task handoff. Personalization: remembered task windows and geometry. Visibility: readiness and attention states. Confidence: takeover and evidence. Delight: quiet continuity without focus theft. Access: keyboard rescue, accessible controls, and eventual Labs supervision.

## Questions

### Answered

- **Q:** Is a new workspace or second agent chat required? **A:** No; extend canonical blocks and Hermes task cards.
- **Q:** Are the desired gains already demonstrated? **A:** No benchmark or live post-restart validation was established in this session.
- **Q:** What compounds? **A:** Verified recipes, task history, and contextual evidence. Extra interface modes alone do not.

### Blockers

No user input blocks this strategy. Before committing to larger bets, determine the first target workflow and team capacity. Runtime availability, packaged KronosCode readiness, and real workload performance require implementation-phase validation.

## Next Steps

- [ ] Decide the Hermes/KronosCode runtime and naming contract; reconcile conflicting documentation.
- [ ] Benchmark current OS/HUD behavior without promising an unmeasured percentage.
- [ ] Validate three journeys: background browser → notch → same browser; Hermes reversible widget action; KronosCode fix → test → receipt.
- [ ] Audit interaction verification call sites and inspect the compact dock on narrow displays.
- [ ] Run five target-user sessions and measure time to first successful task, manual rescue frequency, and evidence usefulness.
- [ ] Prototype one persistent task and one saved recipe before investing in collaboration infrastructure.

This session contains strategy only. No application code was changed.
