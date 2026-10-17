# 10x Analysis: KronTerm as the Unified Agent Work Operating System

> Superseded by Session 19. The product architecture changed: KronosChamber is removed; Hermes is the only agent-facing
> experience, and KronosCode is an agent embedded inside Hermes. Session 19 contains the corrected architecture and the
> aggressive Orca feature-adoption plan. No implementation was performed from this document.

Session 18 | Date: 2026-09-28

## Current Value

KronTerm already contains more of the required foundation than any one of the five audited products:

- four presentations over shared live blocks: widgets, tabs, Canvas, and KronTerm OS;
- canonical Browser, Terminal, Files, Preview, sandbox, remote, native-app, and agent surfaces;
- KronosCode as the managed execution engine and KronosChamber as the primary chat/control surface;
- Hermes with scoped workspace tools and specialist-agent delegation;
- typed agent activity with approval, failure, completion, and surface targeting;
- Git/workspace, LSP-backed editing, computer-use streams, and an MCP workspace-control boundary;
- an iPhone Labs client connected to the real KronosCode gateway;
- optional voice, notifications, desktop pet, HUD, and overlay windows.

The opportunity is not to place Notchi, Orca, OpenMausBot, NotchAgent, and OpenMuse side by side inside KronTerm. That
would create five overlapping products and several conflicting agent runtimes. The opportunity is to make their best
jobs feel like one continuous system built on KronTerm's existing live-session, typed-action, and approval boundaries.

Evidence:

- `frontend/types/agent-activity.ts` already defines a shared activity vocabulary including `awaiting-approval`;
- `frontend/app/view/use-agent-overlays.ts` projects activity onto visible workspace surfaces;
- `frontend/app/workspace/kronarchy-shell.tsx` provides the KronTerm OS shell and typed spatial surface;
- `mcp-kron-term/src/index.ts` exposes workspace, file, terminal, browser, notification, agent, and native actions;
- `emain/kronoscode-runtime.ts`, `emain/acp/`, and `agents/kronoscode/` provide the managed agent boundary;
- `emain/hermes-runtime.ts` and `frontend/app/workspace/workspace-hermes-panel.ts` provide a second agent-facing control
  surface without needing a second workspace model;
- `mobile/README.md` confirms that the iPhone Labs client opens into the real KronosChamber and reuses KronosCode rather
  than fabricating a second agent engine;
- `analyses/competitive/agent-products-repository-audit.md` contains the source-pinned feature audit used here.

## The Question

What can KronTerm ship now—and what architecture should it commit to—to become the one application that combines
ambient agent awareness, parallel coding operations, persistent agent teams, and durable personal-agent work?

## Product Thesis

**KronTerm should become the observable agent work operating system: one place where people assign outcomes, agents use
real apps and isolated workspaces, every consequential action is visible and approval-gated, work continues across
desktop and phone, and the complete result remains as a resumable scene with evidence.**

The memorable loop is:

1. Ask KronosChamber for an outcome.
2. KronosCode creates a plan and assigns specialist agents.
3. KronTerm opens the necessary live Terminal, Browser, Files, Preview, native-app, and sandbox surfaces.
4. A compact status surface shows what is working, blocked, verifying, failed, or complete.
5. The user can inspect, approve, redirect, or take over any surface.
6. KronTerm verifies the result and saves the work, evidence, layout, costs, and decisions as one durable scene.
7. The same scene can resume, repeat on a schedule, or be supervised from mobile.

## The Unified Product Model

KronTerm needs six canonical objects. Every UI presentation and backend service should project the same objects rather
than inventing local equivalents.

| Object | Meaning | Replaces fragmented concepts |
| --- | --- | --- |
| **Scene** | Durable unit of work containing objective, live surfaces, agents, layout, permissions, evidence, and history | Ad hoc tabs, saved layouts, disconnected task cards |
| **Agent** | Persistent identity/configuration for a worker or supervisor | Separate bot/contact/provider concepts |
| **Run** | One bounded execution of an objective by one or more agents | Transient chat turn, terminal process, routine execution |
| **Surface** | Live Browser, Terminal, File, Preview, AppStream, sandbox, native app, or document | Product-specific computer/browser cards |
| **Decision** | Approval, question, conflict, risk escalation, or takeover request | Ephemeral prompts scattered through terminals and chats |
| **Evidence** | Diff, test, screenshot, URL, command receipt, artifact, citation, or verification result | Unstructured “done” messages |

This model lets KronTerm absorb the jobs of the audited products without cloning their interfaces:

- Notchi/NotchAgent become projections of Run and Decision state.
- Orca becomes Scenes containing isolated worktrees, terminals, diffs, and parallel Runs.
- OpenMausBot becomes persistent Agents, teams, connectors, routines, and channels built on Scenes.
- OpenMuse becomes durable plans, structured cards, recurring work, browser takeover, and Evidence.

---

## Massive Opportunities

### 1. The Mission Control Scene

**What**: Make Scene the first-class unit across KronosChamber, Tabs, Canvas, and KronTerm OS. A Scene stores an objective,
participating agents, canonical block identities, worktrees, permissions, layout, open surfaces, task graph, decisions,
evidence, costs, and run history.

**UI**:

- KronosChamber opens every substantial objective as a Scene card.
- A Scene header shows state, elapsed time, cost, active agents, pending decisions, and verification health.
- Tabs show a focused linear view; Canvas and OS show the same Scene spatially.
- “Resume scene” restores the same surfaces and identities, not screenshots or duplicated widgets.

**Backend**:

- Versioned `SceneManifest` with references to existing block IDs, tab IDs, agent sessions, worktrees, and artifacts.
- Append-only Scene event log for replay and recovery.
- Derived Scene state rather than multiple UI-owned state stores.
- Transactional layout mutations with undo.

**Why 10x**: It turns KronTerm from a container of tools into the place where complete work lives.

**Unlocks**: durable projects, incident rooms, research rooms, repeated workflows, mobile supervision, sharing, and replay.

**Effort**: Very High

**Risk**: A Scene can become a heavy project-management abstraction. Keep it execution-first and generate its structure
from real work.

**Score**: 🔥 Must do

### 2. Agent Fleet and Worktree Orchestrator

**What**: Give KronosCode a native orchestration layer for parallel specialist agents, each with an isolated worktree or
sandbox, explicit task ownership, dependencies, budgets, and merge/review gates.

**UI**:

- Fleet rail showing queued, working, waiting, verifying, failed, and complete agents.
- Task/evidence graph with dependency edges and critical path.
- Compare-results view for several agents given the same task.
- One-click inspect, message, interrupt, retry, handoff, or promote-a-result actions.
- Diff and test evidence attached to each agent card.

**Backend**:

- Extend the existing ACP/KronosCode manager instead of introducing another runtime.
- Worktree lifecycle service with provenance, leases, cleanup, and recovery.
- Scheduler enforcing concurrency, token/cost/time budgets, and dependency readiness.
- Deterministic run/event IDs shared by desktop, mobile, activity overlays, and notifications.
- Merge candidate abstraction that never auto-merges without policy and verification.

**Why 10x**: It gives KronTerm Orca-level fleet operations while retaining KronTerm's richer app, Canvas, native-control,
and evidence surfaces.

**Unlocks**: fan-out/fan-in implementation, parallel research, review agents, test agents, and long-running team workflows.

**Effort**: Very High

**Risk**: Parallelism can multiply cost and conflicting edits. Default to bounded concurrency and isolated worktrees.

**Score**: 🔥 Must do

### 3. Persistent Agent Teams

**What**: Let users create named agents and teams with roles, instructions, skills, models, tool scopes, memory policy,
default computer, voice, and escalation rules. A team is a reusable execution configuration, not a separate chat app.

**UI**:

- Agent library with concise identity cards and capability badges.
- Team composer with drag-and-drop roles and a plain-language permission summary.
- Channels become named Scene streams: Work, Personal, Research, Release, Incident.
- Portable team package preview showing exactly what will be imported.

**Backend**:

- Versioned, secret-free `AgentProfile` and `TeamPackage` schemas.
- Package signing/provenance and explicit import review.
- Secrets referenced by local capability IDs, never embedded in packages.
- Scoped memories: user, team, project, scene, and ephemeral run.
- Existing skills/MCP/ACP boundaries reused as capabilities.

**Why 10x**: Users stop rebuilding instructions and tool configurations for every task. Their best workflows compound.

**Unlocks**: downloadable expert teams, organization libraries, repeatable operating playbooks, and community ecosystems.

**Effort**: High

**Risk**: “Personality” can obscure authority. Permission and tool scope must be more visible than avatar customization.

**Score**: 🔥 Must do

### 4. Observable Computer and Browser Work

**What**: Make every agent-controlled Browser, Terminal, AppStream, native app, sandbox, and file action visible through
one observation/takeover/verification contract.

**UI**:

- Live surface cards with Observe, Take over, Return to agent, Pause, and Stop.
- Plain-language action timeline synchronized to the actual surface.
- Before/after screenshots only for consequential visual mutations.
- Evidence pins attached to the exact surface and time that produced them.

**Backend**:

- One typed surface-action envelope spanning MCP, native bridge, computer-use stream, and KronosCode.
- Capability leases tied to Scene, Run, surface, action family, and expiration.
- Observe/act/verify loop producing receipts.
- Redaction zones and secret-field handling before screenshots or model context.

**Why 10x**: Trust becomes a property of the product, not a promise in chat.

**Unlocks**: reliable app automation, remote supervision, replay, compliance, and safe personal-agent workflows.

**Effort**: High

**Risk**: Visual streams are expensive and can expose sensitive information. Capture must be selective and policy-aware.

**Score**: 🔥 Must do

### 5. Durable Automations as Scenes

**What**: Let any successful Scene become a manual template, scheduled routine, webhook-triggered workflow, or monitored
goal without creating a separate automation product.

**UI**:

- “Run again” and “Make recurring” on completed Scenes.
- Schedule builder with natural language plus an exact resolved schedule.
- Trigger, next-run, last-result, cost, and failure-backoff visibility.
- Every automation run appears as a child Scene with complete evidence.

**Backend**:

- Durable scheduler with leases, idempotency keys, overlap policy, retry/backoff, time/cost limits, and missed-run policy.
- Narrow authenticated webhook receiver separated from the general application API.
- Event triggers from Git, files, URLs, price/availability monitors, and approved connectors.
- Human-decision expiry and escalation paths.

**Why 10x**: The product moves from assisting while open to reliably completing recurring work.

**Unlocks**: personal operations, release checks, monitoring, research digests, inbox workflows, and maintenance agents.

**Effort**: High

**Risk**: Silent failure destroys trust. Every routine needs health, receipts, and an obvious failure state.

**Score**: 🔥 Must do

### 6. Desktop-to-Mobile Supervisory Continuity

**What**: Promote the iPhone Labs client from a set of secondary surfaces into a high-signal supervisory companion for
the same Scenes, Runs, Decisions, and Evidence.

**UI**:

- Mobile home is an attention queue: approvals, blocked runs, failures, and meaningful completions.
- Scene timeline, compact evidence, agent messaging, pause/interrupt/retry, and browser preview.
- Deep link from notification to the exact Decision or Evidence item.
- No attempt to reproduce the full desktop spatial workspace on a phone.

**Backend**:

- Same canonical IDs and event stream as desktop.
- Short-lived capability tickets and Keychain-held pairing credentials.
- Push notifications containing no prompt or secret content.
- Offline decision drafting with revalidation before mutation.

**Why 10x**: Long-running work no longer chains the user to the desktop.

**Unlocks**: overnight agents, remote approval, incident supervision, and continuous personal workflows.

**Effort**: High

**Risk**: Mobile control must never widen authority beyond the desktop Scene's policy.

**Score**: 👍 Strong

---

## Medium Opportunities

### 1. Ambient KronTerm Pulse

**What**: Add a quiet menu-bar/notch/HUD projection of the canonical activity model: working, blocked, approval, failed,
complete, and idle.

**UI**: compact count and state color; expand to the attention queue; click through to the exact Scene or surface.

**Backend**: read-only projection of existing activity events, with optional bounded decision actions routed through the
same approval service.

**Impact**: Delivers the daily value of Notchi and NotchAgent without another session parser or runtime.

**Effort**: Medium

**Score**: 🔥 Must do

### 2. Unified Decision Inbox

**What**: Put approvals, questions, conflicts, failed verification, credential requests, and takeover requests into one
ordered inbox shared by KronosChamber, OS, Canvas, notifications, and mobile.

**Impact**: Eliminates the anxiety of hunting through terminals or chats for a blocked agent.

**Effort**: Medium

**Score**: 🔥 Must do

### 3. Cost, Quota, and Budget Control

**What**: Add provider quota windows, per-run cost, per-scene budget, projected remaining cost, and fleet-level spend.

**UI**: a compact header budget meter plus detailed provider/model/run breakdowns.

**Backend**: normalized usage events with source confidence, pricing-version provenance, and budget enforcement.

**Impact**: Makes parallel agents safe to use routinely and adopts Notchi's strongest non-visual feature.

**Effort**: Medium

**Score**: 🔥 Must do

### 4. Evidence-First Completion

**What**: A Run cannot simply say “done.” Completion requires policy-selected evidence: changed files, diff, diagnostics,
tests, screenshots, URLs, receipts, or a stated verification limitation.

**Impact**: Converts agent confidence into user confidence and makes results scannable on mobile.

**Effort**: Medium

**Score**: 🔥 Must do

### 5. Browser and App Takeover

**What**: Standardize “Observe → Take over → Return control” across Browser, AppStream, native apps, terminals, and mobile
previews.

**Impact**: Users can resolve authentication, CAPTCHAs, ambiguous UI, or sensitive steps without restarting work.

**Effort**: Medium

**Score**: 🔥 Must do

### 6. Connector Gateway

**What**: Present MCP servers, OAuth connectors, local apps, and remote services in one capability catalog with identity,
scope, risk, and health.

**Backend**: partner for broad connectors; build the local permission, identity, audit, and revocation layer.

**Impact**: Gains OpenMausBot-like reach without maintaining hundreds of bespoke integrations.

**Effort**: Medium

**Score**: 👍 Strong

### 7. Voice as a Control Modality

**What**: Use the existing voice engine for dictation, read-aloud completion summaries, spoken progress, and approval
prompts—not as a separate assistant persona.

**Impact**: Makes long-running and accessibility-sensitive work easier to supervise.

**Effort**: Medium

**Score**: 👍 Strong

### 8. Replay and Explain

**What**: Turn the Scene event log into a scrub-able replay of agent decisions, surface actions, evidence, and handoffs.

**Impact**: Debugs failures, teaches users how work was completed, and supports audit/compliance.

**Effort**: Medium

**Score**: 👍 Strong

---

## Small Gems

### 1. One Attention Button

**What**: A global button showing the number of approvals, blocked agents, failures, and unseen completions.

**Why powerful**: Gives users immediate confidence that nothing important is hidden.

**Effort**: Low

**Score**: 🔥 Must do

### 2. Human-Language Agent Activity

**What**: Translate internal tool names into actions such as “Ran tests,” “Waiting for GitHub sign-in,” or “Needs
permission to edit 3 files.”

**Why powerful**: Makes the agent system understandable without exposing implementation vocabulary.

**Effort**: Low

**Score**: 🔥 Must do

### 3. Jump to Work

**What**: Clicking any notification, activity item, Decision, or agent card focuses the exact live surface and relevant
selection.

**Why powerful**: Removes navigation friction and matches the best notch-companion behavior.

**Effort**: Low

**Score**: 🔥 Must do

### 4. Run Again

**What**: Completed Scenes get a one-click Run Again action with a preview of inputs, permissions, and expected budget.

**Why powerful**: Creates an immediate bridge from one-off work to reusable automation.

**Effort**: Low

**Score**: 🔥 Must do

### 5. Completion Receipt

**What**: Every Run ends with a compact receipt: outcome, changed items, tests/evidence, cost, duration, and unresolved
risks.

**Why powerful**: Users can trust and share results without reading the full chat.

**Effort**: Low

**Score**: 🔥 Must do

### 6. Agent Mode and Scope Badge

**What**: Show Plan, Read-only, Ask, Auto, or Full Access plus the active surface scope on every Run.

**Why powerful**: Prevents invisible authority changes.

**Effort**: Low

**Score**: 🔥 Must do

### 7. Quiet Completion Rules

**What**: Notify only for meaningful completion, failure, or required input; unchanged automation runs stay silent.

**Why powerful**: Preserves attention as the fleet grows.

**Effort**: Low

**Score**: 👍 Strong

---

## What to Build, Partner, or Avoid

| Capability | Decision | Rationale |
| --- | --- | --- |
| Scene, Run, Decision, Evidence models | **Build** | Core product differentiation and trust boundary |
| Agent fleet, worktrees, scheduling, verification | **Build** | Central to KronosCode and compounds with workspace state |
| Ambient status UI | **Build thin projection** | Existing activity events should remain source of truth |
| Mobile supervision | **Build on current Labs client** | Must share identity, approvals, and live Scene state |
| Git/diff/LSP/terminal/browser integration | **Build/deepen** | Existing native workspace advantage |
| Broad SaaS connectors | **Partner through MCP/OAuth brokers** | Breadth is commodity; identity and policy are the value |
| Model inference | **Provider abstraction** | Avoid owning commodity model infrastructure |
| Voice generation/transcription | **Provider abstraction plus local options** | Experience matters more than model ownership |
| Push relay | **Buy/partner or isolate** | Operationally heavy infrastructure |
| Hundreds of mascot/personality variants | **Avoid as a priority** | Delight layer, not the switching catalyst |
| A second chat, task, or agent runtime | **Do not build** | KronosChamber/KronosCode must remain canonical |
| Automatic unreviewed merge/payment/destructive actions | **Do not ship by default** | Violates evidence and approval positioning |

## The UI We Should Ship

KronTerm should expose the combined product through five coordinated surfaces:

### 1. KronosChamber — Intent and Direction

- Start objectives and Scenes.
- Review plan and participating agents.
- Answer questions and redirect work.
- Read completion receipts and evidence summaries.

### 2. Mission Control — Fleet and Attention

- Global activity and Decision inbox.
- Agent fleet, task graph, budgets, failures, and verification.
- Compare parallel results and choose promotion/merge candidates.

### 3. Live Workspace — Observation and Takeover

- Tabs for focused execution.
- Widgets for dense operations.
- Canvas for spatial investigation and task/evidence relationships.
- KronTerm OS for app-centric, persistent work scenes.

### 4. Ambient Pulse — Awareness

- Menu bar, HUD, desktop pet, optional notch projection, and notifications.
- Only state, attention, and bounded actions; never a parallel control model.

### 5. Mobile Supervisor — Remote Decisions

- Attention queue, Scene timeline, evidence, agent messages, and bounded controls.
- No miniature desktop and no second message renderer.

## The Backend We Should Commit To

```text
KronosChamber / Mission Control / Workspace / Ambient / Mobile
                         |
                  Canonical Event API
                         |
      Scene + Run + Decision + Evidence + Surface stores
                         |
       KronosCode Orchestrator and Capability Policy Engine
                         |
 ACP agents | Worktrees | Terminal | Browser | Files | Apps | MCP
                         |
       Local host | Sandbox/VM | SSH host | Optional cloud worker
```

Required backend services:

1. **Scene service** — manifest, event log, recovery, sharing boundary, layout references.
2. **Run service** — lifecycle, dependencies, budgets, concurrency, cancellation, retry.
3. **Decision service** — approvals/questions, leases, expiry, revalidation, audit.
4. **Evidence service** — typed artifacts, provenance, verification policy, receipts.
5. **Surface service** — canonical live identities and observe/takeover semantics.
6. **Agent registry** — profiles, teams, skills, models, memory scopes, capability grants.
7. **Worktree/sandbox service** — isolation, ownership, checkpoints, cleanup, recovery.
8. **Automation service** — schedules, triggers, idempotency, health, backoff.
9. **Usage service** — normalized tokens, costs, quotas, budgets, confidence/provenance.
10. **Sync/relay boundary** — encrypted event delivery and push without duplicating authority.

## Recommended Priority

### Do Now — One Coherent Control Plane

1. **Canonical agent-state grammar** — use queued, working, waiting, approval, verifying, failed, complete everywhere.
2. **Unified Decision Inbox** — aggregate existing approval/question/failure sources and deep-link to their live surfaces.
3. **Completion Receipt and Evidence requirement** — standardize the end of every KronosCode run.
4. **Global Attention button and Ambient Pulse** — project existing activity into a compact, dependable status surface.
5. **Run identity and event envelope** — ensure desktop, Canvas, OS, KronosChamber, overlays, and mobile refer to the same
   run IDs.
6. **Cost/budget events** — establish the schema before scaling parallel agents.
7. **Observe/Take over/Return control contract** — unify existing Browser, Terminal, AppStream, and computer-use behavior.

These are largely consolidation moves over existing capabilities. They create visible product value before the larger
orchestrator and Scene persistence work is complete.

### Do Next — Parallel Work That Users Can Trust

1. Scene manifest and append-only event log.
2. Native worktree lifecycle with isolation and recovery.
3. Fleet rail and task/evidence graph.
4. Parallel agent scheduler with concurrency and cost limits.
5. Compare-results and merge-candidate review.
6. Agent profiles and secret-free team packages.
7. Mobile attention queue over canonical Run/Decision/Evidence data.

### Then — Work That Continues Without the User

1. Convert completed Scenes into recurring or event-triggered automations.
2. Connector gateway with MCP/OAuth health and revocation.
3. Persistent project/team memory with explicit scopes.
4. Replay, audit, and explain views.
5. Voice supervision and accessibility paths.
6. Optional remote/cloud workers using the same capability leases.

### Explore — Strategic Bets

1. **Scene marketplace** — portable teams and workflows with signed provenance and no secrets.
2. **Agent camera director** — automatically frame active work and evidence, yielding instantly to user input.
3. **Team co-supervision** — several people observing one Scene with explicit decision ownership.
4. **Privacy-safe lock-screen scene status** — useful for long-running work without exposing content.
5. **Verified personal operations** — email/calendar/document workflows only after connector identity and audit are solid.

### Backlog — Good, Not Yet

1. Extensive mascot customization.
2. General social/health/banking connectors.
3. Autonomous purchases or payments.
4. A general marketplace before package signing and permission review exist.
5. Full graphical desktop mirroring on mobile.

## 90-Day Product Slice

### Days 0–30: Attention and Trust

- Normalize agent state across all desktop surfaces and mobile.
- Add the global Decision Inbox and exact-surface deep links.
- Add completion receipts and typed evidence attachments.
- Add compact cost/duration/budget information to Run headers.
- Ship Ambient Pulse using menu bar/HUD first; treat hardware-notch UI as an optional projection.

### Days 31–60: Parallel Execution

- Introduce canonical Run IDs and the fleet rail.
- Add managed worktree creation, ownership, checkpoint, and cleanup.
- Add bounded parallel dispatch for two to four agents.
- Attach diffs, tests, screenshots, and artifacts to agent cards.
- Add compare-results and explicit promote/merge-candidate actions.

### Days 61–90: Durable Scenes

- Persist Scene manifests and append-only event history.
- Restore live surfaces and agent sessions from a Scene.
- Add Run Again with input/permission/budget preview.
- Add mobile Scene timeline, Decision handling, and evidence summaries.
- Pilot one recurring Scene type with strict idempotency and failure visibility.

## Success Measures

- Time from notification to the exact blocked action: under 5 seconds.
- Percentage of completed Runs with sufficient evidence: above 90%.
- Scene restore success without duplicated live sessions: above 99%.
- Parallel Runs that finish inside configured budget: above 95%.
- Decisions surfaced in exactly one canonical inbox: 100%.
- Meaningful completion-to-unnecessary-notification ratio improves over time.
- Users repeat a completed Scene within seven days—a direct signal that durable work is valuable.

## Questions

### Answered

- **Q**: Should KronTerm literally combine all five applications? **A**: No. Combine their jobs through one canonical
  Scene/Run/Decision/Evidence model and one KronosCode runtime.
- **Q**: What is the switching catalyst? **A**: A user can assign an outcome, watch several agents work in real apps and
  isolated worktrees, intervene anywhere, and receive verified evidence in one resumable Scene.
- **Q**: What should be built first? **A**: Attention, decisions, evidence, run identity, cost visibility, and takeover.
  They unify existing capability and are prerequisites for safe orchestration.
- **Q**: Which competitor feature should not dictate architecture? **A**: Notch mascots, chat rosters, and connector
  counts are projections and extensions; none should become the core data model.
- **Q**: Should mobile become a full desktop clone? **A**: No. It should be a high-signal supervisor for the same Scenes.

### Blockers

- No blocker for the Do Now consolidation slice.
- Team sharing requires an identity and package-signing decision.
- Remote/cloud workers require a product decision about hosted infrastructure and operational ownership.
- Production automation requires explicit policy for expired approvals and unavailable human decision makers.

## Product Analysis State

- Previous state: **CPA5 — Features Unmapped**.
- Current state: **CPA6 — Decision Deferred resolved into a build/partner/avoid strategy**.
- Remaining validation: observed user switching behavior, willingness to pay, and behavioral evidence that Scenes—not
  chats or raw worktrees—are the correct durable unit.
- The implementation strategy is ready; buyer/persona validation is still required before broad market claims.

## Next Steps

- [ ] Write the canonical `Scene`, `Run`, `Decision`, `Evidence`, and `Surface` contracts.
- [ ] Inventory every existing approval/question/failure source and route it to one Decision service.
- [ ] Define evidence policies for coding, browser, file, computer-use, and connector tasks.
- [ ] Prototype Ambient Pulse as a read-only projection of `agent-activity.ts`.
- [ ] Specify worktree ownership, checkpoint, cleanup, and recovery semantics.
- [ ] Map mobile screens directly to canonical Run/Decision/Evidence resources.
- [ ] Validate the Mission Control Scene concept with five users who currently supervise two or more agents.
- [ ] Choose one recurring workflow for the first durable automation pilot.
