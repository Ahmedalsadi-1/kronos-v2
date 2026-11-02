# 10x Analysis: Build on KronTerm's current features
Session 28 | Date: 2026-11-01

## Decision

Make completed work reusable. A user should be able to solve a task across existing workspace surfaces, inspect the result, save a parameterized procedure, and return later to review only what changed or needs judgment.

The strongest first slice is **an existing workflow that fails, opens the exact failed node and its evidence, accepts a correction, and continues with an explicit account of what will run again**. Follow it with saving that successful procedure for reuse. This connects the current workflow editor, Hermes, live workspace, and evidence handling into one useful product loop.

This is strategy, as required by the invoked game-changing-features skill. No application implementation is included. Extending current features is the constraint; new studios and a second orchestration system are outside this proposal.

## Current Value

KronTerm brings terminals, browsers, files, native apps, agents, and isolated computers into a persistent workspace. Its likely initial users are developers and technical operators doing work that spans several tools. That audience is inferred from the product and repository, not established by usage research.

The core action is moving from a request to work on actual surfaces, then inspecting the result. Widgets, tabs, canvas, and OS mode are different presentations of that work. KronosCode provides execution foundations, while KronosChamber and Hermes provide agent interaction paths.

Source inspection shows existing workflow execution and evidence, worktree checkpoints, scoped memory, workflow integration, device launch batches, and delegation policy. Some relevant files are untracked or modified in the current workspace. Their presence establishes an implementation foundation; it does not establish availability, integration quality, or release readiness. Phone functionality remains Labs.

No user interviews, complaint counts, retention data, or live UI inspection were available in this pass. Time spent reconstructing context and diagnosing failures is a hypothesis to validate, not a measured finding.

### Evidence checked

All references below are local source observations on this date.

| Existing foundation | Evidence | Boundary that matters |
| --- | --- | --- |
| Workflow execution, review and artifacts | [workflow-runtime.ts](/Users/albsheralsadi/kronterm/emain/workflow-runtime.ts:62) | Includes review boundaries, evidence collection and worktree diff artifacts; does not establish universal safe replay. |
| Worktree checkpoints | [workflow-checkpoints.ts](/Users/albsheralsadi/kronterm/emain/workflow-checkpoints.ts:39) | File restoration is narrower than undoing browser actions, API writes or device state. |
| Workflow document identity/revisions | [n8n-workspace.ts](/Users/albsheralsadi/kronterm/emain/n8n-workspace.ts), [n8n-workspace.ts types](/Users/albsheralsadi/kronterm/frontend/types/n8n-workspace.ts) | Revision tracking is a base for stale-context detection, not proof of dependency-aware invalidation. |
| Workflow node selection in OS mode | [os-workflow-host.ts](/Users/albsheralsadi/kronterm/frontend/app/tab/os-workflow-host.ts) | Existing selection mapping can anchor correction to a node. |
| Scoped delegation | [delegation-policy.ts](/Users/albsheralsadi/kronterm/emain/delegation-policy.ts) | Limits scope and checks sandbox ownership; one sandbox task at a time avoids simultaneous input. |
| Device batches | [device-farm-batches.ts](/Users/albsheralsadi/kronterm/emain/device-farm-batches.ts) | Batches assign/launch devices; success is not a completed user task. In-flight launches can finish after cancellation. State is held in memory. |
| Memory with provenance and lifecycle | [developer-memory.ts](/Users/albsheralsadi/kronterm/mcp-kron-term/src/developer-memory.ts) | Scope, evidence, supersession and session events exist; automatic correctness is not implied. |
| Cross-surface activity | [agent-activity.ts](/Users/albsheralsadi/kronterm/frontend/types/agent-activity.ts:45) | Target and phase fields support a shared view, but durable recovery needs separate verification. |
| Workflow pack installation | [hermes-workflow-packs.ts](/Users/albsheralsadi/kronterm/emain/hermes-workflow-packs.ts:9) | Reuse should extend an existing pack boundary rather than create a competing marketplace. |

This extends [session 27](session-27.md): shared identity, typed results and recovery remain prerequisites. The newer workflow and computer work makes a concrete end-to-end task a better validation unit than another broad infrastructure roadmap.

## The Question

What would make a workspace remember useful work well enough that users return to run it again?

## Massive Opportunities

### 1. Turn a completed task into a working procedure

**What:** After a successful supported task, offer Save procedure. Show editable inputs, bound sources, required capabilities, verification checks and review boundaries. A later run opens the appropriate existing surfaces and executes the explicit procedure.

**Builds on:** Workflow runtime, workflow packs, scoped memory, surface context and current workflow editing.

**Why 10x:** A difficult successful session becomes a repeatable asset. The workspace accumulates the user's working methods rather than only transcripts.

**Unlocks:** Repeatable release checks, local report preparation and bounded browser-assisted routines.

**First slice:** Save an explicit existing workflow with two editable inputs and a known verification step. Do not infer an executable workflow from arbitrary conversation history.

**Effort:** High. **Risk:** Hidden session dependencies make saved procedures brittle; credentials and external effects cannot be captured as ordinary parameters.

**Score:** Must do, after correction works. **Validation:** Users successfully run their saved procedure on a second real input the following week.

### 2. A regression desk across isolated computers

**What:** Run the same bounded acceptance scenario against several supported computer targets and compare observed outcomes, screenshots and failure points in the current computer workspace.

**Builds on:** Device batch assignment, computer target identities, ownership policy and agent evidence.

**Why 10x:** Multiple desktops become a way to answer a concrete question: which environments pass this task? Device count alone provides little value.

**Unlocks:** Checking an internal web flow across known configurations and reproducing environment-specific failures.

**First slice:** Two supported isolated Linux targets, one read-only scenario, explicit pass criteria and per-target evidence. Treat real-phone coverage as a separate Labs experiment.

**Effort:** Very high. **Risk:** Launch success gets confused with task success; nondeterministic agents produce misleading comparisons; concurrent work exceeds resource budgets.

**Score:** Strong strategic bet. **Validation:** Detect a seeded failure on one target and show evidence sufficient for a person to reproduce it.

### 3. Share a procedure with its context contract

**What:** Export a selected procedure, sanitized sample inputs, expected outputs and setup requirements. A recipient binds their own workspace and credentials and runs a local preflight.

**Builds on:** Existing packs, explicit workflow inputs and evidence-backed memory.

**Why 10x:** A user's working method can become a team's starting point, creating value beyond the original session.

**Unlocks:** Repeatable onboarding and handoffs without sharing an entire desktop or transcript.

**Effort:** High. **Risk:** Local paths, credentials and hidden assumptions make portability expensive. Collaboration demand is unproven.

**Score:** Maybe. Validate local repeated use before building sharing infrastructure.

## Medium Opportunities

### 4. Correct the failed step and continue

**What:** A failed run offers Open failed node, Inspect input/output, Edit correction and Preview continuation. Show completed steps to reuse, steps to rerun and effects requiring reconciliation.

**Builds on:** Existing workflow execution, node selection and evidence. Extend the owning execution engine; do not introduce another scheduler.

**Why 10x:** The user can repair a concrete failure without reconstructing the task in a fresh chat.

**Impact:** Shorter recovery and fewer duplicated actions.

**First slice:** One supported transformation followed by a local artifact. Resume from persisted results only when source revisions still match. Unknown external effects require observation before retry.

**Effort:** Medium for the bounded slice; high across arbitrary tools. **Risk:** Reusing stale output or repeating an external write.

**Score:** Must do. Measure time from failure to verified completion against the current workflow.

### 5. Let evidence open the work that produced it

**What:** Every owned run result links to its exact diff, output file, workflow node or captured observation. A result summary distinguishes completed, failed, partial and unverified work.

**Builds on:** Activity targets and workflow evidence paths.

**Why 10x:** Users move directly from a claim to inspectable work across the existing workspace.

**Impact:** Less hunting through tabs and transcripts; faster review.

**First slice:** Worktree diff and workflow-node results. Preserve historical evidence even if the live surface closes; distinguish a saved observation from the current page.

**Effort:** Medium. **Risk:** A link resolves to a current but different target after navigation or restart.

**Score:** Must do. Verify that sampled results resolve to the correct run and artifact.

### 6. Show what changed since the last run

**What:** Before repeating a saved procedure, show changed inputs, changed source revisions, prior unresolved problems and checks that must run again.

**Builds on:** Workflow revisions, scoped memory and persisted results.

**Why 10x:** Repeated work focuses on new information while preserving the user's previous decisions.

**Impact:** Faster review without quietly treating old evidence as current.

**First slice:** Local files and explicit workflow document revisions. Offer rerun advice; dependency-aware automatic reuse comes later.

**Effort:** Medium. **Risk:** Change detection misses remote or hidden dependencies.

**Score:** Strong. Measure review time and missed changes separately.

### 7. Resume with an inspectable task brief

**What:** Reopening a task shows the goal, decisions, attached sources, last verified result and next unresolved action. Users can correct the brief before continuing with a supported agent.

**Builds on:** Developer memory, session events and activity identity.

**Why 10x:** Switching tasks or agents costs less context reconstruction.

**Impact:** Faster return to useful work after an interruption.

**First slice:** One task within the same workspace. Cross-provider continuation is context transfer unless native resume is actually supported.

**Effort:** Medium. **Risk:** A generated summary becomes an unquestioned source of truth.

**Score:** Strong. Measure corrections needed and time to first useful action after reopening.

## Small Gems

### 8. Open the thing the agent just changed

**What:** Add a contextual Open result action to an existing completed tool card.

**Why powerful:** Removes the search between completion and inspection. Reuse current command and surface-opening paths.

**Effort:** Low for one owned artifact type. **Score:** Must do.

### 9. Show exactly what Stop stopped

**What:** Report queued work cancelled, in-flight work still finishing, and outcomes requiring inspection.

**Why powerful:** Turns existing cancellation semantics into understandable behavior. Device batch cancellation already explicitly allows in-flight boots to finish.

**Effort:** Low for batch assignment. **Score:** Must do.

### 10. Attach the selected workflow node with its revision

**What:** From an existing node selection, attach node identity, bounded configuration and document revision to Hermes, with a visible removable attachment.

**Why powerful:** Replaces vague references such as "fix this" with inspectable context. Warn when the source revision changes.

**Effort:** Low to medium for one selection path. **Score:** Strong.

## Ruthless Evaluation

Scores are hypotheses from 1 to 5, not market measurements. Reach means likely reach within technical beta users; feasibility 5 means easiest. Frequency is expected per eligible user.

| Opportunity | Impact | Reach | Frequency | Differentiation | Compounds | Feasibility |
| --- | --- | --- | --- | --- | --- | --- |
| Save working procedure | 5 | 4 | Weekly | 4 | 5 | 3 |
| Regression desk | 5 | 2 | Weekly | 4 | 4 | 2 |
| Share procedure | 4 | 2 | Monthly | 3 | 5 | 2 |
| Correct and continue | 5 | 4 | Daily | 3 | 4 | 3 |
| Evidence opens work | 4 | 5 | Daily | 3 | 3 | 4 |
| Changes since last run | 4 | 4 | Weekly | 3 | 5 | 3 |
| Inspectable task brief | 4 | 5 | Daily | 3 | 4 | 3 |
| Open result | 3 | 5 | Daily | 2 | 2 | 5 |
| Honest Stop result | 4 | 3 | Weekly | 2 | 2 | 5 |
| Attach selected node | 4 | 3 | Daily | 3 | 3 | 4 |

Differentiation here describes the opportunity within KronTerm's combined workflow, not a verified claim against current competitors. No external market research was performed.

## Category Coverage

| Category | Concrete extension |
| --- | --- |
| Speed | Open result; exact failed-node navigation |
| Automation | Save and rerun explicit procedures |
| Intelligence | Explain changed inputs and unresolved evidence |
| Integration | Use current workflow and computer boundaries |
| Collaboration | Portable procedure with recipient-bound credentials |
| Personalization | User-edited task briefs and saved procedures |
| Visibility | Per-target outcomes with inspectable evidence |
| Confidence | Continuation preview and honest cancellation |
| Delight | One action restores the exact work worth inspecting |
| Access | Keyboard paths for selection, correction and results; defer remote phone control to Labs |

## Recommended Priority

### Do Now

1. **Open result for a supported artifact.** Ship the smallest complete action-to-inspection loop.
2. **Attach selected workflow node with revision.** Give Hermes precise context using existing selection.
3. **Expose actual cancellation outcomes.** Start with current device assignment semantics.

### Do Next

1. **Correct and continue one supported workflow.** This is the primary product investment.
2. **Save that successful workflow as a parameterized procedure.** Reuse current workflow and pack paths.
3. **Show changes on its second run.** Add the task brief where context loss is observed.

Do not run these as unrelated feature initiatives. Use one pilot: generate a local release-readiness report from a repository and test output, correct a failed parsing step, inspect the report, save the procedure, then rerun against a changed revision. Keep publishing and external writes outside the first slice.

### Explore

1. **Regression desk:** pursue if beta users already repeat the same checks across isolated computers.
2. **Shareable procedures:** pursue once users repeatedly run their own saved procedures and request handoff.

### Backlog / Pass

- A new agent dashboard, another canvas, or more animation as the principal value proposition: existing surfaces need a stronger task loop.
- An unrestricted teach-anything recorder: capture explicit supported procedures first.
- Universal undo or automatic replay of every tool: external effects have different semantics.
- A marketplace before repeat local use: distribution cannot repair an unreliable procedure.
- More computer targets before evidence comparison works on two: capacity is not an outcome.

## Questions

### Answered

- **Are these built on current features?** Yes. Every proposal identifies an existing execution, selection, memory, evidence or computer foundation.
- **What should lead?** Recovery from one failed workflow, followed by saving and repeating it.
- **What compounds?** User-corrected procedures, explicit inputs, verification history and project context.
- **Does source presence mean ready to ship?** No. Modified and untracked development code needs integration and release validation.

### Open, not blockers to this strategy

- Which beta users already repeat a workflow at least weekly?
- Is the leading pain recovering failures, reconstructing context, or inspecting outputs?
- Which supported workflow engine should own the first scenario end to end?
- Which of these interactions already work in the packaged build and only need exposure?

## Next Steps

- [ ] Observe five technical beta users completing and repeating one real task; record the baseline before committing scope.
- [ ] Audit the packaged build for selected-node attachment, result opening and workflow continuation to avoid duplicating existing behavior.
- [ ] Choose one execution owner and document input revision, step outcome, artifact reference and retry semantics for the pilot.
- [ ] Prototype failure -> evidence -> correction -> continuation -> verified local report.
- [ ] Validate restart, stale input, missing artifact and uncertain-effect cases before enabling automatic reuse.
- [ ] Measure median recovery time, duplicate effects, correct evidence navigation and successful second runs.
- [ ] Use a provisional decision gate: at least four of five pilot users repeat the procedure without engineering help, no duplicate external effects, and lower recovery time than their baseline. These are proposed gates, not achieved results.

## Validation of This Deliverable

Read current local source and prior strategy sessions. No code, dependencies, settings or existing strategy documents were changed. No application tests were run because this deliverable is a strategy document. Runtime behavior, effort and audience demand remain to be validated; none are presented as measured outcomes.
