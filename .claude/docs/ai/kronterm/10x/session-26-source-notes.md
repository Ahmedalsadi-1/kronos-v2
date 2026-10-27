# Session 26: source notes and shipped-artifact findings
Research date: 2026-10-18 (user timezone: America/New_York).

Companion to [the ranked strategy](session-26.md). These notes separate source observations from proposed KronTerm adaptations. They record a bounded research pass, not a complete market audit or verified packaged-product behavior.

## Local shipped-artifact inspection: Manus Studio

### Identity

- Installed app: `/Applications/Manus Studio.app`, version 2.0.7, bundle ID `im.manus.desktop`.
- Archive: `/Applications/Manus Studio.app/Contents/Resources/app.asar`.
- Observed SHA-256: `da6a441c51aa772ea411976dcf8252531b75e4f4594dae86b155f6cb0e9366f3`.
- ASAR inventory: 30,285 members. Package metadata names Manus, main `dist/index.js`. A package-level `license: MIT` string was observed; this alone does not establish licensing of every bundled component or authorize copying the application.
- Scope: static extraction and focused inspection of five shipped JavaScript modules; no app launch, login, account-data access, or module execution.

### Findings with bounded evidence

| ID | Shipped member and source boundary | Observed control flow | Useful design implication, not recovered runtime behavior |
| --- | --- | --- | --- |
| M1 | `dist/computerUse/remoteSkillRecordingService.js`, authorization/request dispatch around lines 128–180, lifecycle branches around 239–340, artifact access around 504–545 | Version checks, active-controller ownership checks, start/status/begin/stop/cancel/cleanup calls, completed-artifact metadata/access, routing for transcription completion. Artifact opening checks account context, completed state, path containment, and file identity. | Treat teaching as a stateful owned operation producing an inspectable artifact. Integrate correction recording with run boundaries rather than silently observing the whole desktop. |
| M2 | `dist/computerUse/remoteSkillDeliveryService.js`, lines 37–117 | Delivery IDs, account epoch/owner checks, pending entries, bounded wait, acknowledgment handling, and navigation to the delivered session. Pending state is a Map in this class. | Separate capture, conversion, delivery, and activation states. An artifact being recorded does not mean it was delivered or adopted. These observations do not prove crash durability. |
| M3 | `dist/computerUse/autoWorkspaceManager.js`, constructor and workspace preparation around lines 85–160 | Per-session and canonical-path maps, in-flight operation deduplication, workspace validation/reuse, bounded concurrency. | A teaching/task session needs explicit working-folder ownership and reuse rules. The presence of a map is not proof of persistent recovery. |
| M4 | `dist/addonLocal/webdevPreviewService/webdevPreviewService.js`, lines 89–106 and 159–187 | Preview resolution carries session/workspace binding; root/working-directory checks are repeated before returning an authority. | Bind previews to the task's current environment. A screenshot of a running app alone does not prove it is the changed worktree. |
| M5 | `dist/agentManager/worktreeRetentionProtocol.js`, lines 6–99 | Schemas for resident limits, inventory pages, preview candidates, cleanup request/result IDs, and token-shaped cleanup requests. | Retention should be inspectable and account for requested items. Schemas alone do not prove the cleanup implementation or safety. |

Selected-member SHA-256 hashes:

- M1: `b51643ef2d380048416ce750d3f4697d93873896be4d7f365903fd67ff146757`.
- M2: `240252cca9317665e8f46f87cc71c45e8c7522ec663519f26ccb02e4c3519eac`.
- M3: `a292254ac6c218abc83a2d5905b0908d0ab9784c6e017ddb31dcc4c19096e812`.
- M4: `34a72c343ae7e91301280c9f16de26e9dc8b890b4ec2891707a0e5d9661da3df`.
- M5: `cd3e5938183fb205a282b11f19469ffff816e958eeee18e3b7995ec404bde5a5`.

### REA coverage and integrity limitation

The initial REA analysis rejected a declared-integrity mismatch in the unpacked member `node_modules/@beeper/webauthn-authenticator/webauthn_authenticator.darwin-arm64.node`: declared `5ba069b2d67a3496d579e56e62a19988ecfea0461e0eb41f0eeb2f4d1df6ab86`, observed `ad1df96a641632fc8a05c85a8966a4ad6605f8ab1abd0fb045a404e8b5674a2d`. Cause is unknown. No artifact integrity was repaired.

A record-and-continue broad analysis and a later focused-directory REA attempt did not complete during the bounded investigation and were stopped. No completed REA Evidence ID or whole-application graph is claimed. M1–M5 are from the separately completed ASAR extraction and focused source inspection above. The differing unpacked native member was not needed for those JavaScript control-flow findings. Overall package integrity remains a limitation.

### What remains unknown

Cloud conversion quality, proprietary models, live recording behavior, current account entitlements, and end-to-end skill generalization were not established. We can independently design the bounded workflow from observed interfaces and public behavior; we did not recover Manus as a complete system.

## Additional directly checked donors

### BrowserOS / BrowserOS neo

Snapshot: `browseros-ai/BrowserOS`, commit `7fdd50f808004d37e8ddeacbf3817614f776523b`, approximately 13,979 stars, AGPL-3.0 repository metadata.

- [Audit/replay docs](https://github.com/browseros-ai/BrowserOS/blob/7fdd50f808004d37e8ddeacbf3817614f776523b/docs/neo/audit-and-replay.mdx): searchable sessions, action timelines, per-tab replay, scoped recording.
- [Replay event catalog](https://github.com/browseros-ai/BrowserOS/blob/7fdd50f808004d37e8ddeacbf3817614f776523b/packages/browseros-agent/apps/claw-app/screens/replay/replay-events.ts): stable event grouping by logical tab/document.
- [Replay service](https://github.com/browseros-ai/BrowserOS/blob/7fdd50f808004d37e8ddeacbf3817614f776523b/packages/browseros-agent/apps/claw-server/src/services/replay/builder.rs): recorded events attributed through session tab-ownership windows and document streams; completeness/gap metadata.

Proposed adaptation: existing KronTerm activity/research search first, then a run-bound observation player. DOM playback does not restore external state. Use the source as an architecture reference; no BrowserOS code was copied.

### LLM fragments

Snapshot: `simonw/llm`, commit `cbeeb8f2b93b642107e51c735c7eb55734355da1`, approximately 12,638 stars, Apache-2.0 repository metadata.

[Fragments documentation](https://github.com/simonw/llm/blob/cbeeb8f2b93b642107e51c735c7eb55734355da1/docs/fragments.md) describes reusable text fragments stored once and referenced by content hash, alias, file, URL, or plugin loader. Proposed adaptation: visible, versioned context packs selected from actual KronTerm sources and attachable across agents. It does not promise provider prompt-cache savings automatically.

### Screenpipe: product reference with an important reuse exclusion

Snapshot: `screenpipe/screenpipe`, commit `62482a789d034d1eea08e8554744c2a9eaa02221`, approximately 21,978 stars. [README](https://github.com/screenpipe/screenpipe/blob/62482a789d034d1eea08e8554744c2a9eaa02221/README.md) describes local work capture, search, and workflow discovery. [Current license](https://github.com/screenpipe/screenpipe/blob/62482a789d034d1eea08e8554744c2a9eaa02221/LICENSE.md) is a commercial source license with explicit restrictions, rather than a permissive license.

No current Screenpipe implementation is recommended for copying, embedding, or use to build KronTerm's competing feature. The proposed search slice uses KronTerm's existing user-selected research and developer session records, and BrowserOS replay as the cited architecture reference; it does not require continuous screen/audio capture. Earlier versions may have different terms, but no historical version was selected or cleared here.

## Source-reading notes: agent/developer mechanisms

# Eight source-grounded mechanisms for KronTerm
Research date: 2026-10-18. Repository metadata and source inspected directly through GitHub API/raw source; stars are observations, not quality proof. This is an adaptation plan, not evidence these mechanisms already improve KronTerm.

## Existing product boundary that changes the recommendations
`emain/workflow-runtime.ts:11,47-57,92-100,310-327` already supplies isolated Git worktrees, step checkpoints, restore and dependent-step invalidation. `emain/workflow-store.ts:490-525` already pauses runs, marks interrupted steps uncertain, and demands reconcile before restart. `emain/acp/acp-agent-manager.ts:579-604,867-877` already resumes provider sessions. Recommending “add background agents/checkpoints/worktrees” would be weak and redundant. The opportunities below move beyond that base. Scoped code searches did not establish repository-wide absence; each is a candidate gap requiring implementation audit.

## 1. Agent merge desk: select the best hunks across simultaneous attempts
**Donor:** GitButler (~21,821 stars), source tree `4fd6b87497be514a259dc4f57781e1914b123f40`. Inspected `crates/but-hunk-assignment/src/lib.rs`: stable assignment IDs, explicit stack/branch targeting, reconciliation of current hunks with persisted assignment state. Related dependency analysis exists in `crates/but-hunk-dependency`.
**Source:** https://github.com/gitbutlerapp/gitbutler/blob/4fd6b87497be514a259dc4f57781e1914b123f40/crates/but-hunk-assignment/src/lib.rs
**Adapt:** Keep agents in isolated worktrees. Add a proposal desk that attributes each proposed hunk to run/model and tests, detects overlapping dependencies, then assembles user-selected compatible changes into a separate integration worktree. Do not permit concurrent agents to write one checkout just because GitButler supports workspace stacks.
**60-second demo:** Ask two models to fix a bug; A has the better fix, B has the missing regression test. Select A's implementation and B's test, run the combined check, inspect one resulting patch.
**New vs current:** Worktree isolation protects parallel attempts; this turns their output into composable changes rather than requiring whole-branch selection/manual cherry-picking.
**Gate:** Combined patch tests pass, originating run retained for every selected hunk, overlaps force explicit resolution. A stale proposal is recomputed against new HEAD.
**Effort:** 3-5 engineer-weeks for constrained text-file prototype; dependency-aware production integration longer. License API reports Other/NOASSERTION: inspect per-package terms before reuse; safest initial route is independent implementation from the mechanism, not copying Rust crates.

## 2. Repository navigation packet, generated before the first model turn
**Donor:** Aider (~49,625 stars), SHA `5dc9490bb35f9729ef2c95d00a19ccd30c26339c`. Inspected `aider/repomap.py`: tree-sitter tags, mtime cache, weighted personalized PageRank, token-budget-constrained map generation.
**Sources:** https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py and https://aider.chat/docs/repomap.html
**Adapt:** Generate a 2-4k token packet seeded by selected code, task terms and active files, showing relevant symbols, signatures and dependency neighborhoods. Cache by file content/mtime and invalidate changed symbols. Expose a visible “why these files” panel; combine with existing LSP rather than duplicating a language server.
**Demo:** Select a failing RPC handler and ask for a fix. Before a broad search, the agent sees its caller, generated-binding source, tests and applicable AGENTS paths.
**New vs current:** LSP-backed editing and selection-to-context are available; ranking the smallest useful architectural map is an additional context assembly policy.
**Gate:** On 20 real KronTerm tasks, compare time to first correct edit, irrelevant file reads, tokens and success versus current retrieval. Require quality not to decline.
**Effort:** 1-2 weeks prototype, 3-4 weeks language coverage/caching. Apache-2.0; preserve applicable notices if copying.

## 3. Crash-resume at the effect boundary, not the whole agent step
**Donor:** LangGraph (~43,463 stars), SHA `98043c37abc60374030f960a03a6e0d4c0112643`. Inspected `libs/langgraph/langgraph/pregel/_retry.py` (task retries and policy matching) and `pregel/main.py` (checkpoint/state transitions). Primary persistence docs describe checkpointers and task result reuse.
**Sources:** https://github.com/langchain-ai/langgraph/blob/98043c37abc60374030f960a03a6e0d4c0112643/libs/langgraph/langgraph/pregel/_retry.py and https://docs.langchain.com/oss/python/langgraph/persistence
**Adapt:** Add a durable effect journal keyed by run, step, stable logical operation and input hash. Persist intent, result and external receipt. Reuse successful pure/read operations; use upstream idempotency keys for supported mutations; leave uncertain external writes in reconcile state. Do not claim exactly-once execution for arbitrary shell commands.
**Demo:** A task prepares files and starts a build. Kill the app after the build completes. Reopen: completed build artifact is reused, remaining verification continues, no duplicate side effect.
**New vs current:** Current workflow restore is file-oriented and uncertain-step reconciliation is manual. This narrows the uncertainty boundary and avoids repeating already completed expensive work.
**Gate:** Fault injection at every intent/result write boundary. No duplicated test mutation; irreconcilable effects remain visibly blocked.
**Effort:** 3-5 weeks core, then incremental adapter coverage. MIT; borrow state-machine design without importing Python runtime.

## 4. “Continue when CI finishes”: suspended tasks driven by external facts
**Donor:** Trigger.dev (~16,569 stars), SHA `d5dc4842441a42f231269eb766ab732527642ccd`. Inspected `internal-packages/run-engine/src/engine/systems/waitpointSystem.ts`: idempotent waitpoint creation, completion, connected-run unblocking, completion-race handling.
**Sources:** https://github.com/triggerdotdev/trigger.dev/blob/d5dc4842441a42f231269eb766ab732527642ccd/internal-packages/run-engine/src/engine/systems/waitpointSystem.ts and https://trigger.dev/docs/wait-for-token
**Adapt:** First-class workflow waits for exact CI run, review decision, artifact readiness or browser download; bind wait to resource/version and expiry. A durable event receiver records the event before waking the continuation. Local-only mode can poll economically while the app runs; continuing while the laptop is off requires a remote worker, explicitly a separate dependency.
**Demo:** “When this exact CI build fails, diagnose the failing job and prepare a patch.” Task parks with no active model loop, wakes on the result, opens a reviewable patch.
**New vs current:** Cron/scheduled runs and pause/resume do not capture durable, typed external prerequisites with duplicate-delivery handling.
**Gate:** Duplicate/out-of-order webhooks do not duplicate continuation; results from a newer commit cannot satisfy the old wait.
**Effort:** 2-3 weeks for CI one adapter; 4-6 for reusable waits. Apache-2.0 metadata; inspect package-level terms before embedding.

## 5. Memory that expires when the project changes
**Donor:** Graphiti (~31,982 stars), SHA `7b0182f94d27075db488636cd5456981ee10b987`. Inspected `graphiti_core/edges.py`: entity facts carry `valid_at`, `invalid_at`, provenance episodes and timestamps, separating when a fact held from when recorded.
**Sources:** https://github.com/getzep/graphiti/blob/7b0182f94d27075db488636cd5456981ee10b987/graphiti_core/edges.py and https://www.getzep.com/platform/graphiti/
**Adapt:** Store concrete operational facts such as “mobile host tests use npm run test:host” and “this issue was caused by stale provider session ownership” with repo, branch, evidence path/commit, observed date and invalidation triggers. On package.json or relevant code changes, mark affected facts stale; retrieve current facts with provenance. Begin with deterministic file-based facts and a small SQLite table, not a mandatory Neo4j service.
**Demo:** Correct a test command once. Tomorrow the agent uses the correct command. Change the package script; the memory is marked stale rather than confidently teaching the old command.
**New vs current:** Persistent conversations and evidence graphs are not the same as temporal truth maintenance. Confirm current Hermes/Kronos memory behavior before building another store.
**Gate:** Zero known-stale command injection on an explicit changed-fact benchmark; measurable decrease in repeated corrections. Users can inspect/delete a fact.
**Effort:** 2-3 weeks scoped operational memory; months for broad automatic extraction. Apache-2.0; independent data-model adaptation avoids graph-service complexity.

## 6. Context compaction that preserves the contract and exposes loss
**Donor:** OpenCode (~216,573 stars), SHA `501b15af26915ba52682e20e220e7e137e89e92f`. Current source moved from old `packages/opencode` paths to `packages/core`. Inspected `packages/core/src/session/compaction.ts`: bounded recent verbatim history, incremental summaries, token sizing, preservation of exact identifiers, active requirements, workflow/publication state, newest-history precedence.
**Source:** https://github.com/anomalyco/opencode/blob/501b15af26915ba52682e20e220e7e137e89e92f/packages/core/src/session/compaction.ts
**Adapt:** Provider-neutral context envelope containing user constraints, accepted decisions, unresolved requests, current worktree/diff, evidence pointers and next step; retain newest messages verbatim. Show a readable handoff preview and explicit compaction event. Test transfer across ACP providers instead of trusting opaque provider resume IDs.
**Demo:** A long fix hits the context limit; switch provider. New agent identifies the exact outstanding test and uncommitted files without asking the user to restate the task.
**New vs current:** ACP provider resume already exists. This is user-visible, portable semantic continuity above provider sessions, with constraint retention evaluation.
**Gate:** Task-specific seeded constraints survive repeated compaction/provider switches; no stale resolved question returns. Reduce redundant re-reading relative to baseline.
**Effort:** 2-3 weeks envelope and one-provider-switch prototype; integration depends on provider ability to accept context. MIT.

## 7. Reproducible project capsule with its environment, not just its files
**Donor:** Dev Container specification. Inspected `docs/specs/devcontainer-reference.md`: image/Dockerfile/Compose options, lifecycle scripts, metadata merging, waitFor startup boundaries.
**Source:** https://github.com/devcontainers/spec/blob/main/docs/specs/devcontainer-reference.md
**Adapt:** Detect existing .devcontainer definitions, create a KronTerm capsule joining pinned environment definition, workspace commit, setup result, port mapping, sandbox target and test entry points. Open terminal/browser/agent against that capsule as one action. Cache prepared images; keep secret values out of exported metadata.
**Demo:** Open an unfamiliar repository, press “Prepare project”; terminal, server preview and agent share one known-working environment, and a colleague can reproduce the same setup.
**New vs current:** Sandbox task execution and managed runtimes already exist. The additional value is deterministic project bootstrapping and portable environment identity. Avoid inventing a competing config format.
**Gate:** Fresh-machine repro works with recorded commit/config; cold/warm startup measured separately; failing lifecycle hook gives actionable diagnostics.
**Effort:** 2-4 weeks for existing devcontainer CLI adapter; cross-platform remote/lifecycle support adds substantial scope. Check spec/referenced implementation license independently; specification compatibility does not grant implementation licensing.

## 8. Branch the investigation before changing the solution
**Donor:** LangGraph checkpoint fork/state update mechanism. Inspected `pregel/main.py`: `bulk_update_state`, source='fork', checkpoint identities and state update API.
**Source:** https://github.com/langchain-ai/langgraph/blob/98043c37abc60374030f960a03a6e0d4c0112643/libs/langgraph/langgraph/pregel/main.py
**Adapt:** “Try another approach from here” duplicates the task's structured state plus a fresh worktree at the selected evidence checkpoint. Run two hypotheses under a fixed cost limit; compare using the same failing test and change review. External effects cannot be rolled back by a code fork; branch execution initially permits code edits/tests only.
**Demo:** At a diagnosis checkpoint, try cache invalidation and session-owner repair independently. Same reproducer is run on each. Compare passing result, patch size and cost; accept the better branch or combine via the merge desk.
**New vs current:** Restore discards/reopens affected steps in one run; checkpoint branching preserves both alternative histories and comparable evidence.
**Gate:** Both alternatives share identical starting commit/environment/reproducer; changes and costs remain attributable; selecting one never silently overwrites the other.
**Effort:** 2-4 weeks atop checkpoints for 2-way serial branch/compare, more for concurrent scheduling. MIT mechanism; no need to install LangGraph.

## Ranked delivery
1. Repository navigation packet: cheapest agent-quality test with clear baseline.
2. Context envelope/portable continuity: addresses repeated instruction loss and provider fragmentation.
3. CI/external waitpoints: turns existing workflow primitives into real deferred work.
4. Per-effect journal: prerequisite for credible unattended execution.
5. Merge desk: visible differentiation using existing isolation; start with independent files/hunks.
6. Environment capsules: high onboarding value but platform scope needs restraint.
7. Expiring operational memory: valuable only with measured correction/retrieval accuracy.
8. Investigation branches: strongest after merge desk and reliable state envelope.

Effort ranges are planning estimates for an experienced engineer, not measured delivery promises. Main-product and repository licenses can differ by package. Stars alone never justify embedding a dependency.


## Source-reading notes: finished products

# Finished-product mechanisms worth adapting to KronTerm
Research date: 2026-10-18. Sources below were checked against official docs/product pages using web search. These are proposed extensions, not assertions that competitors lack the combined behavior. Effort assumes one strong engineer familiar with this codebase; estimates are hypotheses, not commitments. No private application/account data inspected.

## Priority judgment
The strongest strategic direction is **a workspace that turns the user's real working material into reusable operational software**. Combine (1) live collections, (2) small working apps, and (3) action buttons bound to real objects. These reinforce each other. Do not build a generic Notion clone, dashboard builder, meeting recorder, or another agent swarm marketing page.

### 1. Turn any working result into a small live app — Retool mechanism
**Observed:** Retool's app builder generates React apps connected to resources and functions. Resource schemas inform generation; users can manually edit code. [Introduction](https://docs.retool.com/build/apps/concepts/intro), [CSV-to-app lab](https://docs.retool.com/education/labs/fundamentals/retool-app-builder).
**KronTerm proposal:** Right-click a JSON terminal result, CSV file, SQL query, or browser table → Make an app. It becomes a persistent local widget with filters, charts and explicit actions. A support engineer turns yesterday's incident CSV plus a command into an incident console, rather than repeatedly asking chat to analyze it. A designer creates an asset approval gallery from a folder.
**Unfair fit:** Terminal/file/browser/preview are already adjacent; the original command can refresh the data. The app remains attached to its source rather than becoming one more detached HTML export.
**60-second demo:** Run a process-list command; Make an app; ask for grouping by memory; click a row to open logs; save console to workspace.
**First slice:** CSV/JSON read-only input, table/chart templates, manual refresh, local HTML sandbox. No arbitrary database credentials or write-back. 2–4 weeks. Later add typed functions and source refresh.
**Reuse:** Preview/file/terminal surfaces and sandbox. Caution: the project knowledge base mentions frontend/builder/, but that directory was absent in this checkout, so do not estimate based on a ready builder.
**Gate:** 8/10 users create a useful saved app from their own result in under 3 minutes; 40% reopen within 7 days.

### 2. Live collections across URLs, files, commands and outputs — Obsidian + Tana mechanism
**Observed:** Obsidian Bases derives table/card views from local files/properties; Tana supertags assign typed fields to nodes and gather them into collections. [Bases](https://obsidian.md/help/bases), [Supertags](https://outliner.tana.inc/learn/features/supertags).
**Proposal:** Select browser tabs + PDFs + files → tag as Vendor, Candidate, Incident, or Asset. Define 4 fields. A saved collection becomes a table/card surface, while each item still opens its original live surface. Extract missing fields once with AI, then let users edit them directly. Example: a procurement user compares 12 tools and revisits the same table a month later rather than repeating research.
**Compounding:** Repeated projects grow a durable object library with user-corrected fields and reusable queries. This is much stronger than more chat history or graph decoration.
**60-second demo:** Drag 4 competitor pages and a local pricing spreadsheet into a collection, request Price/Deployment/SSO fields, change a value, filter self-hosted, open original source side-by-side.
**First slice:** 3 object types (web link, local file, saved output), user-defined fields, table + filter, manually triggered extraction. 3–5 weeks. Do not start with arbitrary semantic graph traversal.
**Reuse:** Canvas already holds notes, shapes, task cards and live blocks. Need a persistent object model separate from block layout; do not mistake an existing visual graph for a collection database.
**Gate:** 50% of recruited research/operations users reuse the same collection next week; median source re-finding time <10 seconds.

### 3. Make useful actions live on the object — Notion buttons + Raycast Quicklinks
**Observed:** Notion database buttons run configurable actions, use row properties/formulas and open pages/URLs. Raycast Quicklinks accept selected text as arguments. [Notion](https://www.notion.com/help/database-buttons), [Raycast](https://www.raycast.com/core-features/quicklinks).
**Proposal:** A Customer row gets Open account, Inspect logs, Draft response; a Deployment row gets Open dashboard, Compare release, Run smoke check. Users bind a typed object field to an existing command/API/browser action once. The action menu shows only actions compatible with that object's type and current selection. This is executable personalization, beyond a generic command palette.
**60-second demo:** Select an account ID in a browser → Inspect customer → three correctly parameterized terminal/browser/log surfaces open; save action on every Customer item.
**First slice:** Local action manifest: name, input schema, templates, terminal/browser/file destinations. Binding UI + 8 built-ins. 1–2 weeks. Existing mutating-action approval rules still apply.
**Reuse:** Existing command center, selection-to-agent context, surface actions and canvas workflow inputs. No new general automation engine.
**Gate:** Core action invoked >5 times/user/week; 90% correct argument bindings; zero silent wrong-workspace runs.

### 4. From one successful session to a reusable workspace kit — Warp mechanism
**Observed:** Warp lets users save parameterized commands from block actions and agent results, then find them in a palette; its AI objects include parameterized prompts. [Workflows](https://docs.warp.dev/knowledge-and-collaboration/warp-drive/workflows), [AI objects](https://docs.warp.dev/knowledge-and-collaboration/warp-drive/ai-objects).
**Proposal:** Finish one customer onboarding, vendor review or project setup → Save as kit. KronTerm proposes variables (client, repo, environment), preserves the surface arrangement and reusable steps, and removes session-specific results. Another user runs the kit with a different customer and gets the correctly configured working environment, not just a prompt file.
**60-second demo:** Save an existing setup with docs/browser/terminal; enter a different project path; see the environment instantiated and first data populated.
**First slice:** Manually choose blocks and 3 variables; layout + parameterized commands/URLs, explicit run step. 2 weeks. Add extraction from session history later.
**Reuse verified:** Canvas workflow graph with input/output ports already exists; scheduling exists at frontend/app/tab/workspace-canvas-workflows.tsx:272 and 879+. emain/hermes-workflow-packs.ts already imports 3 packs. Build packaging/parameterization, not yet another scheduler or pack installer.
**Gate:** A second user gets first useful result from a kit in <5 minutes without its author.

### 5. Brief once, work next: meeting commitments become a prepared workspace — Granola mechanism
**Observed:** Granola templates structure enhanced meeting notes; saved Recipes extract outputs such as requests and follow-up drafts. [Templates/recipes](https://www.granola.ai/blog/meeting-recipes-repeatable-formats), [Briefing](https://www.granola.ai/blog/daily-weekly-briefing-from-meetings).
**Proposal:** Import meeting notes or transcript → Prepare commitments. Show each commitment with owner/date, cited context and relevant local project. Selecting one opens relevant repo/docs/customer account and a drafted next action. This closes the costly gap between a meeting summary and actually starting the work.
**60-second demo:** Drop sample notes, see three commitments, select 'send cost comparison', and open a collection plus draft populated from the meeting's named options.
**First slice:** File/text import, editable commitment extraction, matching to manually selected workspace, draft-only outputs. 1–2 weeks. Recording/transcription is unnecessary for the first version; import from Granola/Zoom/Markdown instead.
**Reuse:** File surfaces, agents, workspace navigation. Optional voice exists but is not a reason to rebuild Granola.
**Gate:** ≥70% extracted commitments accepted after editing, median time meeting→first action cut in half.

### 6. Close the customer feedback loop inside the actual working environment — Linear mechanism
**Observed:** Linear Customer Requests links original customer feedback to issues/projects and customer pages; filtering includes customer count/tier/revenue. [Docs](https://linear.app/docs/customer-requests).
**Proposal:** Highlight feedback in a browser or import a support conversation → attach to a workspace issue. Open the actual reported screen and local implementation alongside it. When work is ready, generate a customer-specific response linked to the original request; user reviews/sends. Multiple requests inform a ranked queue. Useful for small product teams, not just coding agents.
**60-second demo:** Capture two customers requesting the same behavior, merge into one work item, show customer list, then produce tailored completion drafts.
**First slice:** Explicit capture + manual customer ID + local request registry + Linear/GitHub issue links. 2–3 weeks. Avoid building a full CRM.
**Reuse:** Browser selection context, task graph, existing external issue integrations if configured. Check actual connector readiness before assuming integration is complete.
**Gate:** ≥80% newly fixed pilot requests retain a path back to the original reporter; response drafting <30 seconds.

### 7. Client environments that route work correctly — Arc Profiles mechanism
**Observed:** Arc binds browser profiles to Spaces; profiles separate authentication, history, cookies and other browser data. [Profiles](https://resources.arc.net/hc/en-us/articles/19227964556183-Profiles-Separate-Work-Personal-Browsing).
**Proposal:** Workspace identity explicitly couples browser partition + repo/root + remote target + agent instructions + permitted integration accounts. Open a client URL or file and KronTerm offers the matching workspace. A consultant switches clients and all relevant working surfaces switch together, with a visible identity chip.
**60-second demo:** Open two accounts for the same service in different workspaces; switch once and show repo/terminal/browser context all correspond to the right client.
**First slice:** Browser partition + root + visible workspace identity; deterministic URL/path route rules. 2–4 weeks depending on current profile plumbing. No credentials copying.
**Reuse verified:** emain/emain-webview-policy.test.ts:62 already permits partitions such as persist:work; product surface has workspaces. Partition support alone is not a finished identity system.
**Gate:** 0 wrong-account actions in a 100-switch scripted pilot; <2 seconds to restore an existing active environment.

### 8. Research rows that can be refreshed and acted on — Manus Wide Research + Perplexity Spaces
**Observed:** Manus publicly offers Wide Research and a Browser Operator using authorized local browser sessions. Perplexity Spaces combines custom instructions with persistent files/links. [Wide Research](https://help.manus.im/en/articles/11960169-what-is-wide-research), [Browser Operator](https://manus.im/en/blog/manus-browser-operator), [Spaces files/links](https://www.perplexity.ai/enterprise/videos/how-to-set-custom-files-and-links).
**Proposal:** Drop 20 companies/URLs; define questions as columns; research each row with per-cell sources and explicit unknowns; manually correct fields; refresh only selected cells later. Then act on the table: create shortlist, open related files, generate a purchasing brief. This combines research with a durable local collection rather than producing a disposable long answer.
**60-second demo:** Research 5 vendors, inspect one cell source, correct a field, refresh one row, produce a brief using only shortlisted rows.
**First slice:** 10–25 rows, bounded concurrency, 5 fields, cell statuses and sources, manual refresh. 3–4 weeks after collections. Do not promise 100 independent agents or unrestricted logged-in scraping.
**Reuse:** Agents/browser/sandbox and workflow graph. Real gap is schema-constrained row execution, partial failure/retry and durable cells; adding a spinner-filled swarm UI does not deliver this.
**Gate:** >90% populated cells source-supported on a human-reviewed fixture; ≥80% correct abstention on unavailable facts; users return to refresh rather than start over.

### 9. Turn a workspace walkthrough into an editable product demo — Descript mechanism
**Observed:** Descript binds transcript edits to video cuts/reordering and provides scene layouts. [Text editing](https://www.descript.com/video-editing?authuser=0), [Scene editor](https://help.descript.com/hc/en-us/articles/10165362727821).
**Proposal:** Record a workspace walkthrough, capture narration and selected surfaces, produce a transcript where deleting a paragraph cuts that section. Insert a saved live preview or terminal result as a scene. Export a compact customer demo, onboarding video or bug reproduction.
**60-second demo:** Record 20 seconds explaining a feature, remove a sentence, add a preview scene, render a 15-second clip.
**First slice:** Record single surface + microphone, transcript with word times, trim/reorder, one caption style. 4–6 weeks if capture is available; full editor is substantially larger. Treat as Explore, not core-quarter priority.
**Reuse:** video/ production area and computer-use streams exist per knowledge base, but encoding/capture/transcript alignment need verification. Use existing video tools for a spike rather than creating a full NLE.
**Gate:** First useful shareable clip <5 minutes; ≥30% weekly reuse among creator/support pilot. Kill if an export-to-existing-editor integration does the job equally well.

## Ranking and cautions
1. Object-bound actions (fast proof of immediate utility).
2. Live collections (foundation and compounding data).
3. Local mini-apps on collection/source data (signature capability).
4. Workspace kits (distribution and reuse).
5. Commitment→prepared workspace (new user entry point).
6. Client environments (consultants/agencies wedge).
7. Research tables (build on collections rather than isolated feature).
8. Customer request loop (pilot segment dependent).
9. Demo editor (explore; stop if too much surface area).

Do not claim defensibility comes from copying any individual UI. It comes if users accumulate reusable typed objects, corrected data, working actions and cross-surface kits that consistently save work. All cited behaviors are observations from sources; the combined workflows, estimates and expected advantages are our proposals. No source code or proprietary assets copied.


## Source-reading notes: data, creative, and automation mechanisms

# Creative/data/workflow picks grounded in source

Research date: 2026-10-18 user date. API snapshots fetched live. Static source inspection; no shipped binary/runtime execution. Effort is author estimate for a production-minded first slice by 1-2 engineers, not measured delivery data. Popularity is GitHub API snapshot, not quality proof. All adoption suggestions below are design proposals; upstream behavior is identified separately.

## Recommendation

The strongest wedge beyond another coding-agent terminal is **an agent that produces a working control panel, lets you correct the actual output, and turns that correction into a reusable operation**. Start with table-selected batch work, typed connectors, and durable correction/replay. These compose into a stronger experience than unrelated studios. Do not market upstream mechanisms as unique: the opportunity is integrating them across browser, terminal, files and native apps.

## 1. Turn any agent result into a live table you can act on

**Finished reference:** marimo (23,236 stars) + DuckDB-Wasm (2,142). **Observed:** marimo `table.value` returns selected rows in the original dataframe format; table supports row/cell selection. DuckDB AsyncDuckDB has worker queries, pending query polling/cancel, CSV/JSON insertion and file registration. **Adapt:** standard `DatasetArtifact` with schema, stable row IDs, source provenance, selected IDs; tool output can render as table immediately. Actions consume selected IDs, not a natural-language re-description of rows. Distinguish read-only derived data from explicitly authorized external writes.

**Demo:** “Find broken links across these 40 sites” → table with status, screenshot and owning file → select 7 rows → “Fix only these” → per-row patches/results show inline. A second demo: compare 200 invoices, filter anomalies, select 12 and draft corrections. No spreadsheet export/reimport.

**KronTerm fit:** parent inspection confirms `frontend/app/view/datastudio/{dataset.ts,datastudio-model.ts}` already supplies CSV editing/import/filter/sort with localStorage and limits 2MB/10k rows/50 columns. The delta is stable row identity, typed columns, query engine and action binding, NOT another CSV grid. `tsunami/ui/table.go` already has selectable/sortable tables; `frontend/app/view/hermes/selection-context.ts` existing selection bridge. Add dataset identity/paging and a dataset tool surface, then feed selections into agent tool context. Do not claim the existing component supports million-row virtualized tables.

**Ship slice:** CSV/JSON drop + tool-result dataset + filter/select + one built-in file action. **Acceptance:** selection remains correct after sorting/filtering; rerun does not retarget rows; 10k rows browse without loading all into chat. **Effort:** 2-4 weeks. **Score:** Must do, high reach for browser/file work, repeated daily, compounding dataset provenance.

**Source:** [marimo table.py](https://github.com/marimo-team/marimo/blob/462d3100abed449556ba212065898a82a551de65/marimo/_plugins/ui/_impl/table.py), [selection documentation](https://docs.marimo.io/guides/working_with_data/dataframes/), [DuckDB worker binding](https://github.com/duckdb/duckdb-wasm/blob/448ec38a52238ad2aacde514f0ee3acfd9515b6c/packages/duckdb-wasm/src/parallel/async_bindings.ts). Licenses: Apache-2.0 / MIT; potential direct library use with notices.

## 2. A failed or mediocre result becomes editable data, then resumes

**Finished reference:** Dify human-input nodes, Windmill suspended flows. **Observed:** Dify policy defines surface-specific recipients, preferred form token, pause-reason enrichment, variable-derived select options. Windmill persists per-module statuses and approvals with resume identity. **Adapt:** agent stops with an editable structured checkpoint, not a chat question: fix extracted invoice fields, choose a product shot, edit a draft paragraph, select approved records. Save the correction as a typed input revision and resume from that boundary.

**Demo:** agent processes 50 receipts; 4 have uncertain tax fields → a four-row correction form appears; user fixes them; only those records resume. A correction is visible in the execution record and reusable on a matching future input after explicit validation.

**Fit:** KronosChamber managed run lifecycle + typed activity/evidence + table surface. Avoid implementing a second workflow engine; add durable `waiting_for_input` + checkpoint payload to current run lifecycle. **Acceptance:** kill/restart app while waiting, reopen same form, no duplicate downstream writes after resume. **Effort:** 3-5 weeks. **Score:** Must do; task completion value rather than approval cosmetic.

**Source:** [Dify policy](https://github.com/langgenius/dify/blob/e3e1c393157c6624143d83b500e5b89fd5fc1a66/api/core/workflow/human_input_policy.py), [Windmill flow status](https://github.com/windmill-labs/windmill/blob/de66e47b1c9fd4ca8c3aa0cba0e723bd338e55b4/backend/windmill-types/src/flow_status.rs). Dify modified Apache license adds commercial conditions including multi-tenant restrictions; Windmill root defaults AGPL with exceptions/proprietary enterprise portions. Recommend independent mechanism implementation, not code transplantation.

## 3. Change one input and rerun only the affected work

**Reference:** ComfyUI 138,606 stars + n8n 207,929. **Observed:** ComfyUI caches by input signatures, supports invalidation hooks, publishes cached/success events. n8n has subgraph selection, run-data cleaning and execution stack reconstruction. **Adapt:** immutable step outputs and explicit dependencies; select a result, edit prompt/model/input, fork downstream work while preserving upstream artifacts. Cache keys must include tool/model/version/input revisions, and live external actions are never blindly cached/replayed.

**Demo:** research 30 competitors, make comparison chart, then landing page. User changes comparison criterion → retained research, regenerated comparison and page; shows exactly what recomputed. For images, change crop/caption without repeating extraction/model work.

**Fit:** task/evidence graph visualization provides UI substrate; runtime needs executable dependencies and data provenance (a visual graph alone is not a scheduler). **Acceptance:** one input edit invalidates exactly dependent pure steps; no duplicate connector write; displayed outputs identify original/fork. **Effort:** 4-8 weeks narrow pipeline, larger for arbitrary computer-use tasks. **Score:** Must do for structured tasks; avoid promising safe replay of arbitrary browser actions.

**Sources:** [ComfyUI caching](https://github.com/Comfy-Org/ComfyUI/blob/8f04fd6ecf4a548937971e840af2a985529fab76/comfy_execution/caching.py), [ComfyUI execution](https://github.com/Comfy-Org/ComfyUI/blob/8f04fd6ecf4a548937971e840af2a985529fab76/execution.py), [n8n cleanRunData](https://github.com/n8n-io/n8n/blob/d2dc2f9ce50294df5c08799af437c56e3e04ab13/packages/core/src/execution-engine/partial-execution-utils/clean-run-data.ts), [subgraph selection](https://github.com/n8n-io/n8n/blob/d2dc2f9ce50294df5c08799af437c56e3e04ab13/packages/core/src/execution-engine/partial-execution-utils/find-subgraph.ts). ComfyUI GPL-3.0; n8n Sustainable Use + proprietary enterprise exclusions. Study mechanism / independent implementation, or connect user-run service via supported APIs; do not assume permission to embed code.

## 4. One connector definition powers agent tools AND user-facing controls

**Reference:** Activepieces 25,098 stars. **Observed:** connector action metadata contains typed props, auth requirement, output schema, grouping, human/AI audience and READ/SEARCH/WRITE/DESTRUCTIVE classification. **Adapt:** a versioned operation manifest produces an agent tool, a validated form, an action menu and a batch-table operation. Agent and human call the same capability with the same parameters and result schema.

**Demo:** connect GitHub once → agent queries issues → user edits a bulk label form → selects 18 table rows → previews exact changes → executes → sees per-row errors/retries. Also strong for Notion/Drive/CRM ops.

**Fit:** `mcp-kron-term/` + existing managed tool/approval boundary. Keep credential references in host broker, not generated apps or model context. **First slice:** 3 integration manifests, not “support 500 apps.” **Acceptance:** same operation renders form and validates agent invocation; secret never enters artifact source; revoking connection invalidates both. **Effort:** 3-5 weeks with 3 real connectors. **Score:** Must do; lowers integration maintenance while enabling non-coder use.

**Source:** [piece-metadata.ts](https://github.com/activepieces/activepieces/blob/944121fca6ab74242b8a92b9c192f26ccaa40de0/packages/pieces/framework/src/lib/piece-metadata.ts), [license](https://github.com/activepieces/activepieces/blob/944121fca6ab74242b8a92b9c192f26ccaa40de0/LICENSE). Community paths MIT; listed enterprise paths excluded. Audit each selected piece/dependency separately before direct reuse.

## 5. “Keep this as a tool” creates a small working app from a completed task

**Reference:** Appsmith 41,083 stars + marimo. **Observed:** Appsmith parses dynamic expression bindings and dependency maps; marimo turns reactive programs into apps. **Adapt:** task outputs + typed actions become an editable saved panel with input fields, table, chart and run button; generated app calls host capabilities, not raw filesystem/network/global eval. Persist source in workspace.

**Demo:** “Compare my supplier quotes” first produces a result; Keep as tool creates quote drop zone, preferred-currency selector, normalized comparison table and export button. Next week drop new quotes without re-prompting.

**Fit:** parent inspection confirms `frontend/hermes/store/artifacts.ts` already has versioned generated artifacts (memory registry plus transcript durable copy). The delta is bound interactive operations, app source persistence and reusable inputs, NOT basic artifact generation. Existing Tsunami VDOM and block registry are a better first host than building a whole low-code platform. Important checkout finding: `frontend/builder/` is absent despite project knowledge mentioning it. **Acceptance:** restart preserves app/source; changing one input updates dependent table; tool permissions inspectable; no credential in source. **Effort:** 4-6 weeks for declarative app spec and 6 components; full visual builder much larger. **Score:** Must do after connectors/datasets. Defensibility is accumulated personal apps and workflow context, not widgets themselves.

**Sources:** [Appsmith DynamicBindingUtils](https://github.com/appsmithorg/appsmith/blob/fd78f12c57caf42f1e6d1ce2b4860b3bbca6cab2/app/client/src/utils/DynamicBindingUtils.ts), [marimo dataflow graph](https://github.com/marimo-team/marimo/blob/462d3100abed449556ba212065898a82a551de65/marimo/_runtime/dataflow/graph.py). Appsmith root Apache-2.0 (verify feature/path exceptions before reuse); marimo Apache-2.0. Prefer original constrained DSL over embedding another full product.

## 6. Batch variants with a decision gallery, not a stream of attachments

**Reference:** ComfyUI queue/history API + signature cache. **Observed:** `/prompt`, `/queue`, `/history/{prompt_id}` routes support externally submitted jobs and retrieved history; engine outputs identify prompt/run. **Adapt:** parameter-grid job submission, cancellation, cost/latency accounting and a contact sheet of comparable outputs with source parameters and chosen winners.

**Demo:** one product photo → 3 backgrounds × 4 lighting presets → 12-image sheet → star 2 → derive approved crops/sizes from those only. Keep exact recipe/model/seed and parent asset. This is more concrete than “image studio.”

**Fit:** managed sandbox jobs + image preview + canvas assets; optional ComfyUI adapter lets user connect local GPU/service immediately without bundling model ecosystem. **Acceptance:** 12 cells track queued/running/failed; cancel outstanding; picking a winner retains reproducible recipe. **Effort:** 2-3 weeks optional adapter, 6+ weeks robust general media job system. **Score:** Strong, focused creative demo; narrower reach than datasets.

**Source:** [ComfyUI server routes](https://github.com/Comfy-Org/ComfyUI/blob/8f04fd6ecf4a548937971e840af2a985529fab76/server.py). GPL-3.0 source; prefer supported HTTP adapter to separately run installation, with distribution obligations evaluated if shipping components.

## 7. Directly mark the object you want changed, preserving editable objects

**Reference:** Excalidraw 134,123 stars. **Observed:** imperative `updateScene`, `onChange`, pointer hooks, selection links and embeddable renderer hooks; scene restore code maintains editable scene structures. **Adapt:** a selected object/region carries stable IDs and editable scene data into agent request. Response is a proposed object patch, with diff/undo, rather than a replacement screenshot. Start with diagrams/slides/annotations and local layout components.

**Demo:** select three process boxes → “parallelize these steps and reconnect the arrows” → patch preview, accept, continue editing manually. Or mark one area of a generated comparison chart and modify only its data/labels.

**Fit:** `frontend/app/view/kronoscanvas/canvas-cowork/protocol.ts`, `canvas-sync.ts`, existing named shape utilities. Existing canvas means this is a better object-edit protocol, not another canvas. **Acceptance:** patch references revision and IDs; concurrent manual edit triggers rebase/choice; undo restores exact object state. **Effort:** 2-4 weeks constrained scene types. **Score:** Strong; compelling control improvement.

**Source:** [Excalidraw props/API](https://github.com/excalidraw/excalidraw/blob/e1b7aacb356a492aa1e0fc6eb57b8896124027f0/packages/excalidraw/types.ts), [restore](https://github.com/excalidraw/excalidraw/blob/e1b7aacb356a492aa1e0fc6eb57b8896124027f0/packages/excalidraw/data/restore.ts). MIT. Do not replace the current canvas library just to acquire these patterns.

## 8. Pin a real result as an editable test fixture for the agent

**Reference:** n8n partial execution and pin-data utilities. **Observed:** reconstruction imports typed `IPinData`, restores incoming data and per-run source identity. **Adapt:** from any structured tool result select “Use as fixture,” redact fields, edit edge case, run downstream agent/task against fixture. Save expected output assertions alongside the task; replay is visibly fixture mode so it cannot be mistaken for live evidence.

**Demo:** invoice parser succeeds on most documents but fails on one vendor → pin actual parsed payload → correct the input scenario / expected tax rule → rerun parser transformation without contacting upstream apps or repeatedly uploading docs. Regression appears immediately after model change.

**Fit:** KronosCode eval/observability layer + tool execution boundary; artifact provenance and dataset records. **Acceptance:** fixture runs cannot invoke writes unless explicitly enabled; fixture/live badges survive export; regression check catches the known bad field. **Effort:** 1-2 weeks first structured-tool slice. **Score:** Must do quick win for team reliability; user-facing as “Try with sample,” engineering-facing as eval fixture.

**Source:** [execution-stack reconstruction](https://github.com/n8n-io/n8n/blob/d2dc2f9ce50294df5c08799af437c56e3e04ab13/packages/core/src/execution-engine/partial-execution-utils/recreate-node-execution-stack.ts), [pin-data utils](https://github.com/n8n-io/n8n/blob/d2dc2f9ce50294df5c08799af437c56e3e04ab13/packages/@n8n/workflow-sdk/src/pin-data-utils.ts) (latter path inventoried, not body-inspected). n8n license limits above; implement independently.

## 9. Reactive saved views that declare freshness and never silently repeat writes

**Reference:** marimo reactive graph and lazy/stale execution. **Observed:** dependency graph maps variable producers/consumers; source docs describe auto-rerunning affected cells or marking stale for expensive work. **Adapt:** a saved panel subscribes to file/dataset revisions; pure analysis recomputes or displays “out of date”; external side effects stay behind explicit run. Show which source changed and last-successful version.

**Demo:** drop updated sales CSV into project → saved margin dashboard updates → previously drafted supplier changes show stale until rechecked. A user can trust what is current without asking the agent to recreate the dashboard.

**Fit:** Jotai models + existing Wave pubsub/file watching, dataset revision layer. **Acceptance:** changing one file marks only dependent outputs stale; a connector write never auto-fires; app restart restores last-successful output and freshness status. **Effort:** 2-4 weeks after dataset identity. **Score:** Strong, compounds daily reuse; do after reliable artifact dependencies.

**Sources:** [graph.py](https://github.com/marimo-team/marimo/blob/462d3100abed449556ba212065898a82a551de65/marimo/_runtime/dataflow/graph.py), [reactivity guide](https://docs.marimo.io/guides/reactivity/). Apache-2.0.

## Source snapshot / boundaries

API metadata and recursive file inventories saved under `/tmp/kronterm-research/`; downloaded source bodies beside them. Commits above are actual API-resolved default-branch SHA snapshots, not invented release tags. Other investigated project: actualbudget/actual 29,602 stars, MIT, SHA 7474a9429988c8f1c807c0a75e664fb76049a6cf; omitted as weaker direct fit. No evidence of KronTerm user frequency/complaint statistics was available; reach/frequency rankings are hypotheses to test. License observations derive from upstream license files; distribution choices require per-component review, and no claim of legal clearance is made.

## Deliverable validation

The ranked report contains all 28 numbered picks without a numbering gap. Its local file links resolve. One pinned source URL per GitHub donor in the ranked report was checked against raw content: all 17 selected repository links returned HTTP 200. This confirms link availability, not functional validation of the upstream software. No product tests were run because only strategy documents were created.
