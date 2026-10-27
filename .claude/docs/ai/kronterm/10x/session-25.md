# 10x Analysis: KronTerm
Session 25 | Date: 2026-10-18

## The decision

Make KronTerm the best place to turn a broken running application into a verified fix, with the entire investigation, implementation, preview, and recovery in one persistent workspace.

The product promise to prove: **Point at the problem. Get a tested fix you can inspect. Continue tomorrow without reconstructing the job.**

Start with developers maintaining existing web applications. They already have repositories, running services, failing workflows, and a way to judge a correct result. This is a proposed initial market, not a finding from customer analytics.

Our strongest opportunity is the integration between live work and reliable execution. Browser automation, more models, parallel agents, canvas layouts, and screenshots are individually available elsewhere. A compelling lead requires materially fewer human interventions per accepted outcome. No feature list establishes that lead.

## Current value and evidence

KronTerm combines code, terminal, browser, native applications, and sandbox work inside a persistent Electron workspace. KronosCode provides the coding engine; Hermes provides a desktop chat surface. The repository contains significant execution infrastructure already:

- [Workflow templates](../../../../../emain/workflow-store.ts) already describe browser investigation, isolated implementation, and verification. Its store persists runs through temporary-file replacement and fences uncertain work after a restart.
- [Workflow runtime](../../../../../emain/workflow-runtime.ts) creates checkpoints, collects completed-tool events, obtains structured specialist reports, and captures diffs. It rejects a successful report when no tool completions were observed.
- [Workflow types](../../../../../frontend/types/workflow.ts) already model dependencies, saved versions, schedules, evidence, questions, targets, and checkpoints.
- [Checkpoint implementation](../../../../../emain/workflow-checkpoints.ts) captures changed worktree files and requires an unchanged HEAD before restore. This is code recovery, not a transaction across databases, browsers, and external services.
- [Sandbox task runtime](../../../../../emain/sandbox-task-runtime.ts) fences access with assigned agent and control generation. Sessions in this class are held in memory; this file alone does not establish durable sandbox recovery.
- [Computer workflow engine](../../../../../emain/computer-workflow-engine.ts) binds decisions to current accessibility observations and limits action count.
- [Activity contract](../../../../../frontend/types/agent-activity.ts) exposes verification and failure states across surfaces.
- [Bundled agent boundary](../../../../../agents/kronoscode/README.md) describes runtime health, credentials, and ACP delegation.

These are inspected source capabilities. I did not launch the application or establish packaged end-to-end reliability. Tests were read, not executed. We have no measured user complaints, retention, intervention rate, or task completion baseline in this analysis. Treat adoption estimates below as hypotheses.

Sessions 23 and 24 proposed creative modules and skill recording. Preserve those ideas as future expansion. Shipping many studios simultaneously would dilute the opportunity below. This session recommends a narrower commercial sequence, not deletion of existing capabilities.

## Competitive reality

Checked official pages during this session; claims below are vendor descriptions, not independent benchmarks.

| Competitor | Established competitive pressure | Consequence for KronTerm |
| --- | --- | --- |
| [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent) | Isolated VMs, parallel agents, desktop/browser interaction, screenshots/video/logs, and shared runs | A browser agent or evidence panel is insufficient differentiation. |
| [Warp](https://docs.warp.dev/) | Agentic development plus automation workflows | Terminal integration and automation are competitive requirements. |
| [Codex app](https://openai.com/index/introducing-the-codex-app/) | Parallel work, worktree isolation, review, and automations | A multi-agent command center is insufficient differentiation. |

Inference: compete on the measured quality of the complete live-debugging loop and the cost of supervising it. These pages do not prove competitors lack any proposal below. This is a focused comparison, not an exhaustive market audit.

## Massive opportunities

### 1. Point at a bug and receive a verified repair

**What:** In a bound browser widget, select the broken element or failing interaction and choose “Fix this.” Capture a short reproduction with the relevant URL, element context, redacted console/network failure, viewport, repository, and current commit. Create an isolated worktree; reproduce the failure; implement a fix; run the same scenario against the changed application; present the diff and criterion-linked evidence.

**Concrete example:** Select a disabled checkout button after entering a valid address. KronTerm reproduces the failure against a test account, identifies the validation mismatch, changes the code, runs the targeted test and browser scenario, and opens the working preview beside the diff. No real purchase is required.

**What already exists:** Browser-code workflow skeleton, worktrees, evidence, and activity. **What changes:** A single user entry point, captured reproduction, environment binding, machine-checked completion, and a coherent result view. Do not create another workflow engine or browser stack.

**Why 10x:** Compress repeated context assembly, tool switching, and manual retesting into one reviewable job. The magnitude is a hypothesis to measure.

**Unlocks:** A valuable daily workflow with a clear before/after demonstration.

**Effort:** High; first constrain support to one repository and a known web dev setup. **Risk:** Unreproducible bugs, private data capture, and testing a different server than the modified worktree. Bind preview origin and server process to the run; surface unsupported prerequisites before execution.

**Score:** Must do. This is the product experience around opportunities 2 and 4, not a separate giant platform.

### 2. Completion determined by evidence

**What:** Add explicit completion criteria to existing workflow runs. Each criterion specifies the required observation or check, target, revision, result, and artifact. Runtime-owned checks determine passed, failed, or unknown. Agent narration remains explanation.

**Concrete acceptance contract:** “Targeted test fails before and passes after; browser reproduction succeeds on the changed worktree; existing relevant checks pass; diff is available.” A screenshot can support visual review, but cannot prove that a test passed.

**Why 10x:** Users spend less time asking whether a task really worked. It also creates the measurement substrate for improving every adapter and model.

**Source gap:** `workflow-runtime.ts` currently checks structured agent status and whether completed tools were observed. Those are useful safeguards; observing a tool completion does not prove a requested behavior is correct. Evidence is currently stored as label/value strings. Extend the existing evidence model with typed observations and artifact provenance.

**Unlocks:** Honest completion states, reproducible evaluation, and reliable reusable workflows.

**Effort:** High across tool adapters; start with process exit status and one browser assertion. **Risk:** Flaky checks and weak assertions. Record the exact command, exit code, time, target, and revision; allow “unknown”; distinguish baseline failures from regressions. Manual attestation must remain labeled as such.

**Score:** Must do. A “verified” badge alone is easy to copy; a substantial corpus of realistic failure cases and reliable checkers compounds.

### 3. Demonstrate once, repeat a tested workflow

**What:** Turn one successful job into a parameterized workflow with explicit prerequisites, target bindings, expected outputs, bounded permissions, and a test fixture. Let a user correct the draft before saving it. Start with “reproduce and repair this class of UI failure” and “prepare this recurring report.”

**Concrete example:** After producing a release report from repository changes and test output, save its input schema and checks. Next time, select a release range and preview the report. A changed destination or missing input blocks publication rather than guessing.

**Why 10x:** Users accumulate automation that incorporates corrections and verifiable outcomes.

**What already exists:** Saved definitions, versions, schedules, and workflow instantiation. Extend these; success once does not automatically establish a dependable reusable workflow.

**Unlocks:** A personal library, then permissioned team packs. **Effort:** High. **Risk:** Brittle replay and accidental side effects. Re-observe targets, validate prerequisites, and reconcile uncertain writes before retries.

**Score:** Strong; after the repair loop works. Defer a public marketplace until packs show repeated success.

## Medium opportunities

### 4. Resume the job with an honest recovery summary

**What:** On reopening a workspace, show the objective, completed criteria, changed files, last checkpoint, preview health, uncertain operations, and the next safe action. Resume from the durable workflow journal.

**Concrete example:** After an interrupted fix, the user sees “Implementation complete; browser verification pending; preview server stopped.” One action restarts the assigned preview and runs verification. An uncertain external write instead requires reconciliation.

**Why 10x:** Removes repeated reconstruction of yesterday's work. **Existing foundation:** Store restart recovery and checkpoint handling already exist. Build the user experience and broaden verified recovery coverage, rather than claiming persistence is new.

**Effort:** Medium. **Risk:** Stale processes and targets. Revalidate identity and state; never claim universal undo. **Score:** Must do.

### 5. Every blocked job offers a concrete repair path

**What:** Convert common blocked reasons into actionable recovery: missing dependency, wrong server, expired connector, unassigned sandbox, failed test, and insufficient permission. Show the observed cause and a bounded action.

**Example:** “Preview points to the original checkout. Start the worktree preview on an available port and rerun the scenario.” Preserve the successful investigation and implementation steps.

**Why powerful:** More retries become useful without users diagnosing the orchestration layer.

**Effort:** Medium; begin with the five most frequent measured failures. **Risk:** Overconfident diagnosis; keep raw evidence inspectable. **Score:** Must do.

### 6. Context with sources, ownership, and expiration

**What:** Build a per-run context packet from explicitly bound files, browser selections, recent failures, commands, and user-approved project conventions. Show sources and allow exclusion. Store durable project facts separately from transient task observations.

**Example:** A fresh specialist receives the failed request, relevant stack trace, worktree path, and reproduction steps, rather than a huge conversation transcript.

**Why powerful:** Reduces repeated explanation and stale context. **Effort:** Medium/high. **Risk:** Leaking secrets or promoting page text into authority. Redact, preserve provenance, and invalidate facts tied to changed revisions. **Score:** Strong.

### 7. Resource limits that preserve useful progress

**What:** Add run-level time, action, retry, and available provider-spend limits. Show measured usage separately from estimates and pause at a resumable boundary when possible.

**Example:** After three identical failed interactions, stop the loop and offer the last observation and checkpoint instead of trying indefinitely.

**Why powerful:** Reduces supervision anxiety and wasted runs. The computer engine already has an action bound; extend the policy consistently. Do not silently override the user's provider/model selection.

**Effort:** Medium. **Risk:** Incomplete provider accounting and cancellation races. Display unknown costs honestly. **Score:** Strong.

## Small gems

### 8. “Use this failure” on terminal errors

Attach the selected command, exit code, relevant output, directory, and run to an investigation. Avoid attaching the entire terminal history. **Effort:** Low/medium depending on command metadata. **Score:** Must do.

### 9. “Show what changed” on every finished job

Open the diff, relevant preview, and criterion results in one action using existing workspace surfaces. **Effort:** Low if artifacts and targets are available. **Score:** Must do.

### 10. Show what actually needs the user

One attention list for blocked decisions and failed checks, with the exact question and preserved context. Keep ordinary activity quiet. **Effort:** Low/medium with existing question/activity contracts. **Score:** Strong.

## Ruthless evaluation

Scores 1-5 are strategic judgments, not user measurements. Reach estimates refer to the proposed initial web-developer audience. Feasibility 5 means easiest with current foundations.

| Opportunity | Impact | Reach hypothesis | Frequency | Differentiation | Defensibility | Feasibility |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Point at bug | 5 | High | Daily | 4 | 3 | 3 |
| 2. Evidence criteria | 5 | High | Every run | 3 | 4 | 3 |
| 3. Tested reusable workflow | 5 | Medium | Weekly | 3 | 4 | 2 |
| 4. Honest resume | 4 | High | Daily | 3 | 3 | 4 |
| 5. Repair blocked jobs | 4 | High | Frequent | 3 | 3 | 4 |
| 6. Sourced context | 4 | High | Every run | 2 | 3 | 3 |
| 7. Resource limits | 3 | High | Every run | 2 | 2 | 3 |
| 8. Use failure | 3 | High | Daily | 2 | 1 | 4 |
| 9. Show changes | 3 | High | Every run | 2 | 1 | 4 |
| 10. Attention list | 3 | Medium | Daily | 2 | 1 | 4 |

The moat is a growing, consented library of failure fixtures, reliable adapters, validated project setup, and successful workflows. Layout and chat styling can help adoption but do not create that moat alone.

## Recommended priority and delivery

Planning assumption: two engineers focused on this effort, with existing maintainers available for review. These are proposed milestones, not delivery commitments; revise after a short runtime audit.

### Do Now: first two weeks

1. **Owner: runtime engineer.** Add criterion records and runner-produced evidence for one test command and one browser scenario. Extend `workflow.ts`, `workflow-runtime.ts`, and existing store persistence. Keep older saved workflows readable.
2. **Owner: product/frontend engineer.** Add “Use this failure,” the result view, and the recovery summary on the existing workflow surface. Read nested AGENTS files before implementation.
3. **Joint release gate.** One seeded bug fails before, passes after, produces inspectable evidence, and survives an interrupted verification. A successful unrelated tool call cannot satisfy a failed criterion.
4. Establish a 20-task fixture set before claiming improvement: UI state bugs, API/validation bugs, failed builds, and interruption/recovery cases. Include deliberately unfixable tasks and unavailable prerequisites.

### Do Next: weeks three through six

1. Deliver “Fix this” for one known web framework setup and existing KronTerm browser controls. Reuse the browser-code template. No additional browser automation stack is required by this proposal.
2. Bind worktree, dev server, browser origin, and checks to the same run. Detect a preview accidentally targeting the original checkout.
3. Ship actionable recovery for the most frequent blocked reasons, basic limits, and typed context packets.
4. Pilot with five developers on their own existing projects. Observe where they intervene and whether they trust the result enough to accept it.

### Explore: weeks seven through twelve, conditional on pilot results

1. Save successful jobs as versioned, tested workflow packs.
2. Allow permissioned sharing of a sanitized result package: objective, diff, checks, artifacts, environment requirements, and a local continuation path. Sharing must not copy credentials or imply identical cross-machine execution.
3. Only then expand into one adjacent output domain with the same completion contract, such as a cited report. Defer simultaneous video, game, 3D, and document studio launches.

### Backlog or pass

- Universal operating-system replacement: too broad to establish this initial lead.
- Automatic agent swarms on every task: concurrency can raise cost and integration failures; adopt only where measured outcomes improve.
- Autonomous production fixes and deployments: defer until staging recovery and side-effect reconciliation are dependable.
- More visual modes as the headline differentiator: existing modes should make the chosen job easier.
- New marketplace, mobile launch, or local model engine as the first competitive move: distribution and scope costs precede proof of core value. Mobile remains Labs.

## How to prove we are ahead

Primary metric: **accepted tasks with passing completion checks per hour of human attention**. Track elapsed time and provider/tool spend alongside it. Never optimize apparent speed by counting unverified work as success.

Run the same 20 tasks with KronTerm, a normal IDE-plus-agent workflow, and two relevant competitors where access permits. Use equivalent model/settings where possible; otherwise report configuration differences. Start environments from equivalent snapshots, rotate order, and record human interventions. Do not present this small suite as a universal coding benchmark.

Proposed pilot gates, not current results:

- At least 16/20 tasks meet explicit criteria without manual edits; report uncertainty from the small sample.
- No task with a known failed mandatory criterion is labeled verified.
- Median human interventions fall by at least half versus the observed baseline.
- All interruption fixtures preserve completed steps and block uncertain side effects until reconciled.
- Users accept the result without reopening multiple tools to reconstruct what happened.

If outcome quality does not improve, fix environment binding, checks, and recovery before adding modules. If developers do not repeatedly use “Fix this,” revisit the market/problem hypothesis before a broad launch.

## Category coverage

Speed: captured failures and one-action review. Automation: tested reusable jobs. Intelligence: sourced context and failure diagnosis. Integration: existing browser, terminal, ACP, and sandbox bindings. Collaboration: sanitized result handoff. Personalization: approved project conventions. Visibility: criteria and attention list. Confidence: observed checks and bounded recovery. Delight: a broken interaction becomes a working preview without reconstructing context. Access: keyboard paths and clear status text in the desktop workflow; broader mobile access stays a later Labs decision.

## Questions

### Answered

- **What should we build first?** One complete live bug-to-verified-fix loop on current infrastructure.
- **What is actually new?** Criterion enforcement, captured reproduction, environment identity, coherent recovery/review, and measured reliability; basic workflows and checkpoints already exist.
- **Can we promise to beat every competitor?** No. We can define a narrow job and demonstrate materially better outcomes on it.
- **Are we implementing now?** No. The invoked skill requests strategy only.

### Open, not blockers for this strategy

- Which frameworks and customer projects dominate actual beta usage?
- Which existing workflow and browser paths work reliably in the packaged build?
- How many engineers can be assigned, and what proportion of current failures is environment setup versus reasoning?
- Do users value daily debugging more than creative production? Validate directly rather than inferring from the repository.

## Next steps

- [ ] Audit the packaged browser-code workflow end to end and establish the 20-task baseline.
- [ ] Write the criterion/evidence contract and first milestone implementation tickets.
- [ ] Select one supported dev setup and five pilot users.
- [ ] Deliver the first vertical slice and compare intervention counts.
- [ ] Expand only after observed completion and repeat usage improve.
