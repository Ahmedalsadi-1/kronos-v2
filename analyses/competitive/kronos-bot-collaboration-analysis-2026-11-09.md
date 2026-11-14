# KronOS bot collaboration

Date: 2026-11-09

## Recommendation

Make Bot Mode a persistent team workspace: agents exchange messages, assign work,
share artifacts, and report progress in one room tied to the user's KronOS desktop.
Prioritize reliable coordination and native integration before adding more bot types.

This is a source-based product and architecture assessment, not a live execution
verification. Current working-tree changes were included in inspection. No runtime
or application code was changed and no tests were run for this assessment.

## Existing capabilities and gaps

| Area | Observed implementation | Implication |
| --- | --- | --- |
| Hermes group chat | `frontend/hermes/plugins/bots/upstream/hermes-bot-mode.js` has mentions, per-member group sessions, incremental context, persisted room logs, and a bounded round-robin coordinator | Group chat already exists; improve it rather than introduce another competing room system |
| Group execution | Same plugin caps a user send at three rounds, ten posted messages, and six members; member turns run serially and poll every two seconds | Useful conversational prototype; independent assignments cannot run concurrently through this loop |
| Failure visibility | Member errors and three-minute timeouts become a pass; the log watermark advances afterward | A user cannot distinguish deliberate silence from failed work; preserve explicit outcomes and retry context |
| Recovery | Room logs/session references persist, but running/epoch state resets on renderer reload | Persist execution ownership outside the renderer and reconcile live work on restart |
| Superseding input | A new message schedules another loop after 250 ms while the old loop checks its epoch at member boundaries | Potential overlapping in-flight turns or stale results; verify with a deterministic race test before changing scheduling |
| Direct Hermes messages | Agent instructions use `hermes -p ... chat`; the UI recognizes delivery via command/text patterns | Replace this coupling with structured, authenticated messages and explicit sender/recipient identity |
| OpenMausBot native bridge | `frontend/types/agent-bot.ts` exposes list/history/send/interrupt for a bot and thread | Groups, collaboration records, and richer native actions are not exposed through this contract |
| OpenMausBot chat adapter | `openmausbot-hermes-backend.ts` polls at 600 ms while active, converts activity into text, redirects requests/attachments to Bots settings | Preserve structured activity and interactive cards; use runtime events for native rendering |
| Bundled coordinator | `integrations/openmausbot/upstream/server/runtime-coordinator.ts` uses `runtime.db`, assignment ancestry, outcomes, limits, and handoff views | Evaluate this existing durable coordinator before building another orchestration engine |
| Bot desktops | `emain/agent-bot-workspaces.ts` provisions a bot workspace with terminal, files, and browser | Extend the relationship to team rooms and owned resources; provisioning alone does not establish exclusive control |
| Specialist execution | `emain/kronterm-native-tool-bridge.ts` and delegation tests provide scoped ACP specialist execution | Retain this capability beneath a common team/task contract |

## External reference points

Grok Bot documents group chats with two to six bots, mentions, replies directed to
particular bots, and direct bot handoffs. It also distinguishes group messages from
private handoffs, which can split the visible history. These are documented product
behaviors, not independently tested here.

Source: https://docs.x.ai/grok-bot/chat-and-collaboration

OpenMausBot's project documentation describes persistent bots, channels with shared
instructions and working folders, responder policies, routines, and reusable team
packages. The locally bundled source provides more relevant implementation evidence
than assuming the current upstream release matches KronOS's integration.

Source: https://github.com/milind-soni/OpenMausBot

These are relevant reference products for the job of coordinating specialized
agents. This assessment does not establish market prevalence or customer switching
behavior. The useful diagnosis is an integration/depth gap, not a missing-feature
count. User research remains necessary to validate broader roadmap demand.

## Priorities

### 1. Durable collaboration and clear outcomes

- Move scheduling ownership into a managed runtime; renderer projects events.
- Use stable room, agent, message, assignment, and event identities.
- Distinguish message delivery from assignment acceptance and completion.
- Persist queued/running/waiting/failed/canceled/completed states.
- Resume observation after reconnect; do not replay side effects to rebuild UI.
- Show failures and timeouts with retry/reassign controls instead of silence.
- Apply a per-room scheduling lock and explicit cancellation/supersession semantics.

### 2. One native room experience

- Bring Hermes and OpenMausBot-backed identities into a common roster through adapters.
- Support direct messages, named rooms, mentions, reply-to, and a chosen lead.
- Preserve real sender IDs, task IDs, artifacts, requests, and tool activity.
- Keep details expandable; show important decisions and results in the main feed.
- Make permissions for attachments and requests explicit at the runtime boundary.

### 3. Work handoffs with context

- Separate asking a question, posting an update, assigning work, and requesting review.
- Carry a brief, expected result, relevant context references, scope, and reply destination.
- Run independent assignments concurrently; serialize dependent steps and conflicting resources.
- Return results automatically to the requesting task and originating room.
- Default to mentions or lead routing, with explicit discussion mode for broader participation.

### 4. Workspace collaboration

- Attach a room to a KronOS workspace and project directory.
- Pass file/artifact references, diffs, screenshots, browser targets, and terminal results.
- Display active owners on relevant workspace surfaces.
- Use resource leases for shared browser/computer input and isolated worktrees where concurrent edits require them.
- Let a user open the exact output or active surface from a chat message.

### 5. Shared knowledge and controlled autonomy

- Separate private bot memory, room decisions, and project knowledge.
- Record source, scope, and recency for shared facts and decisions.
- Introduce per-task budgets, delegation depth limits, duplicate suppression, and a team stop control.
- Preserve the original user's scope through delegation; another bot's message cannot expand it.
- Consolidate important questions and completion notices into a needs-attention inbox.
- Add reusable team templates and event-triggered routines after recovery is reliable.

## First deliverable

A native project room with Researcher, Builder, and Reviewer. The user requests a
small change; Researcher supplies evidence, Builder implements it, Reviewer checks
the result, and the room produces one final answer with linked outputs. Use existing
specialist backends and scoped tools. The room continues to reflect live execution
after its UI reloads.

Acceptance criteria:

1. Every handoff identifies its sender, recipient, originating task, and outcome.
2. A runtime timeout produces a visible failed/waiting state, never a silent pass.
3. Reloading the room restores observed execution state without duplicating a write.
4. Rapid follow-ups cannot produce two owners of the same member turn.
5. Stop propagates to active descendants and prevents new assignments.
6. The reviewer receives artifact references and acceptance criteria without copying private chats.
7. Competing computer-control actions are serialized and ownership is visible.

Measure task completion, manual context relays, duplicate execution, recovery success,
handoff latency, and cost per completed task. Avoid using message volume as success.

## Implementation decision

Reuse existing runtime capabilities and build the KronOS-specific room, identity,
event, and workspace integration. First evaluate whether the bundled durable
OpenMausBot coordinator can support the required Hermes/ACP adapters and lifecycle
contracts. Do not make its adoption a foregone conclusion: verify cancellation,
restart behavior, permission scope, and migration of existing Hermes rooms first.

Suggested sequence: visible failures and scheduling correctness; durable native
rooms; structured assignments and artifacts; shared workspace ownership; memory,
templates, and routines. Reassess priorities after the first end-to-end workflow.
