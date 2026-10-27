# 10x Analysis: KronTerm — 28 concrete picks from working products and GitHub
Session 26 | Date: 2026-10-18

## The stronger picks

The last recommendation concentrated too heavily on developer debugging and execution reliability. Those are necessary foundations, but they underuse KronTerm's browser, files, data, canvas, terminal, and native applications.

The stronger product direction is: **turn the work people already do into software they can keep using.**

A user researches suppliers, corrects an extraction, compares two agents' patches, or generates product images. KronTerm should let them select the useful result, edit it directly, act on it, and save the working operation. The next time, they use their tool instead of reconstructing a prompt and workflow.

My five strongest picks:

1. **Select rows and make agents work on exactly those rows.** Research, file processing, QA, customer operations, and creative batches become controllable work instead of long chat answers.
2. **“Keep as tool.”** A successful one-off task becomes a reusable local app with inputs, live data, and working buttons.
3. **Correct the actual result and continue.** Fix four uncertain invoice cells, approve two images, or edit a draft, then resume only affected work.
4. **Combine the best changes from different agents.** Take one agent's implementation and another's tests, integrate them, and run checks on the combination.
5. **Teach a correction while an agent works.** Pause, demonstrate the missing step, review a proposed reusable rule, and test it on another input.

These are proposed KronTerm features. The donor behaviors and code mechanisms are sourced below. Combining them well is the opportunity; none of the individual ingredients is claimed as unique.

## What was actually researched

This pass combines direct inspection of public repository source, official product documentation, focused static inspection of the installed Manus desktop package, and a targeted audit of KronTerm's current source. Research notes and pinned source URLs are in [the companion source notes](session-26-source-notes.md).

There was no competitor account access, private session inspection, product installation, or product implementation. Static package observations do not establish live reachability, account availability, backend behavior, or production reliability. No customer retention or task-quality baseline was available; impact scores and estimates are hypotheses.

GitHub popularity was checked to find established donors, then actual mechanisms were inspected. Approximate observed stars: OpenCode 217k, n8n 208k, ComfyUI 139k, Excalidraw 134k, Aider 50k, LangGraph 43k, Appsmith 41k, Graphiti 32k, Activepieces 25k, marimo 23k, GitButler 22k, Trigger.dev 17k, BrowserOS 14k, and LLM 13k. Stars are a dated discovery signal, not evidence of reliability or permission to embed code.

## Existing KronTerm foundations we should extend

| Already present in inspected source | Concrete evidence | Consequence |
| --- | --- | --- |
| CSV editing/import/filter/sort and basic numeric summaries | [dataset.ts](/Users/albsheralsadi/kronterm/frontend/app/view/datastudio/dataset.ts), [datastudio-model.ts](/Users/albsheralsadi/kronterm/frontend/app/view/datastudio/datastudio-model.ts) | Improve Data Studio with identity, types, source bindings, and row actions; do not add another CSV viewer. Current limits are 2 MB, 10k rows, 50 columns. |
| Generated artifact versions and preview references | [artifacts.ts](/Users/albsheralsadi/kronterm/frontend/hermes/store/artifacts.ts) | Add durable app source and bound operations; ordinary generated HTML previews already exist. Registry is in memory; transcript is its durable copy. |
| Workflow graph inputs/outputs, scheduling, saved versions, questions, dependencies | `frontend/types/workflow.ts`, `frontend/app/tab/workspace-canvas-workflows.tsx` | Extend the existing workflow model with structured corrections, waits, data revisions, and selective execution. |
| Worktrees, step checkpoints, diffs, uncertain-step recovery | `emain/workflow-runtime.ts`, `workflow-store.ts`, `workflow-checkpoints.ts` | Merge composition, effect-level recovery, and alternative histories are meaningful deltas; “add checkpoints” is not. |
| Memory records with provenance, scopes, expiry and superseded state | [developer-memory.ts](/Users/albsheralsadi/kronterm/mcp-kron-term/src/developer-memory.ts) | Add automatic invalidation and better retrieval to the existing model, rather than importing another memory database by default. |
| Browser research excerpts with source URL, selector and capture time | [browser-research-store.ts](/Users/albsheralsadi/kronterm/frontend/app/view/webview/browser-research-store.ts) | Research tables can extend captured findings into typed cells and refreshable collections. |
| Tool search with ranking and optional schemas | [tool-discovery.ts](/Users/albsheralsadi/kronterm/mcp-kron-term/src/tool-discovery.ts) | Shared human/agent operations must build on discovery, not duplicate it. |
| Project terminal/browser/file grouping | [project-environment.ts](/Users/albsheralsadi/kronterm/frontend/app/workspace/project-environment.ts) | Kits and capsules extend existing grouped launch behavior with variables and environment preparation. |
| Editable canvas and synchronization protocol | `frontend/app/view/kronoscanvas/canvas-cowork/` | Add versioned object patching and selected-object context; avoid replacing the canvas. |

The knowledge base mentions `frontend/builder/`, but that directory was absent in this checkout. Estimates below do not assume a finished app builder exists. This was a scoped audit, not an exhaustive claim that every suggested capability is absent elsewhere.

## Eight picks worth putting in front of users

### 1. Actionable tables: select the work, then run it

**Borrow from:** marimo's selected-row values, DuckDB's worker query bindings, and Manus-style research decomposition.

**User flow:** Drop 40 URLs into KronTerm. Ask for pricing, deployment, SSO, and support fields. Results appear as rows with a source for each extracted fact. Filter to the relevant ten. Select three and ask “Prepare comparisons for only these.” The agent receives stable row IDs and the selected data, not a screenshot or a vague description.

**Another concrete use:** “Find broken links in these pages” produces rows with link, failure, source file, and screenshot. Select seven; “Fix only these seven.” Results and failures stay attached to their rows.

**Mechanism to adapt:** A dataset artifact has a stable dataset ID, stable row IDs, typed columns, source links, revisions, and per-row execution status. Selection is a typed input to existing tools/workflows. Model context receives the schema, selected IDs, and bounded data; it does not receive the entire table automatically. DuckDB becomes useful for joins/aggregation when the simpler grid no longer suffices.

**What we actually inspected:** [marimo table implementation](https://github.com/marimo-team/marimo/blob/462d3100abed449556ba212065898a82a551de65/marimo/_plugins/ui/_impl/table.py), [DuckDB-Wasm asynchronous bindings](https://github.com/duckdb/duckdb-wasm/blob/448ec38a52238ad2aacde514f0ee3acfd9515b6c/packages/duckdb-wasm/src/parallel/async_bindings.ts). Manus documents parallel subtasks; the editable, refreshable row workflow is our proposal, not a claim that Manus provides precisely this implementation.

**First slice:** CSV/JSON + existing browser findings; typed IDs; select/filter; one read action and one local-file action; per-row errors and retry. No new spreadsheet engine needed for the first version.

**Ship gate:** Sorting and filtering cannot retarget a selection. Refreshing one record preserves user edits under an explicit merge rule. Every researched value is sourced or marked unknown. Show row failures without failing the entire batch.

**Why it matters:** Turns AI output into something users can control and reuse. This supports many domains without building a separate studio for each.

**Effort:** 2–4 engineer-weeks for row operations; sourced multi-row research adds 2–4 after that. **Score:** Must do. **Scale:** Medium foundation, transformative combined experience.

### 2. “Keep as tool”: turn a successful task into a working app

**Borrow from:** Retool's resource-aware app generation, Appsmith's data bindings, and marimo's reactive execution.

**User flow:** “Compare these supplier quotes.” KronTerm extracts the data and produces a comparison. Click **Keep as tool**. It saves a widget with a quote drop zone, preferred currency, comparison table, assumptions editor, and export action. Next week the user drops new quotes into the same tool. No repeated setup conversation.

Other useful first apps: a process-and-logs console from terminal JSON; an asset approval gallery from a folder; a customer incident dashboard from authorized data; a release checklist from a repository.

**Mechanism:** Persist a small app definition with explicit inputs, data sources, views, and bound operations. Start with six built-in components: input, file drop, table, chart, markdown, action button. A host broker executes operations. Generated source contains credential references, never secret values. Reuse existing preview/block hosting; choose the smallest supported declarative surface after an isolation spike.

**Evidence:** [Retool app concepts](https://docs.retool.com/build/apps/concepts/intro), [Appsmith binding utilities](https://github.com/appsmithorg/appsmith/blob/fd78f12c57caf42f1e6d1ce2b4860b3bbca6cab2/app/client/src/utils/DynamicBindingUtils.ts), [marimo dependency graph](https://github.com/marimo-team/marimo/blob/462d3100abed449556ba212065898a82a551de65/marimo/_runtime/dataflow/graph.py).

**First slice:** Read-only data apps with manual refresh and durable local definitions. Then add explicitly bound operations. A visual app designer and arbitrary generated backend are separate, larger projects.

**Ship gate:** Restart preserves source and settings. Another input produces a useful result without new instructions. Revoking a source connection disables its bound operation. Users can inspect and edit the data and logic.

**Why it matters:** The user's library of useful apps grows with their work. This is a stronger retention hypothesis than accumulating chat history.

**Effort:** 4–6 engineer-weeks after the dataset/operation contracts; broader production hosting adds work. **Score:** Must do. **Scale:** Massive.

### 3. Editable handoffs: correct output instead of explaining the correction

**Borrow from:** Dify human-input nodes and Windmill's persisted suspended flows.

**User flow:** An agent processes 50 receipts. Four tax values are uncertain. KronTerm opens those four rows in a correction form. The user fixes two amounts and selects two categories. Those edits become an input revision. Only the affected records continue.

Same mechanism: edit a generated paragraph before layout, choose the correct customer match, select approved product photos, or correct a scraped field before downstream analysis.

**Mechanism:** Add a structured waiting payload to the existing run/question model: schema, current values, field-level uncertainty, revision, and resume target. A submitted form is durable data, not just another natural-language message. Preserve the original output and the user revision.

**Evidence:** [Dify human input policy](https://github.com/langgenius/dify/blob/e3e1c393157c6624143d83b500e5b89fd5fc1a66/api/core/workflow/human_input_policy.py), [Windmill flow statuses](https://github.com/windmill-labs/windmill/blob/de66e47b1c9fd4ca8c3aa0cba0e723bd338e55b4/backend/windmill-types/src/flow_status.rs). Adapt the pattern independently; do not import another workflow runtime.

**First slice:** One table correction form and one text correction form. Reuse the current workflow question/permission infrastructure where appropriate, keeping content edits distinct from permission grants.

**Ship gate:** Restart while waiting reopens the same correction. A stale form cannot overwrite a newer revision. Completed external writes are not repeated after submission.

**Why it matters:** A mediocre extraction can become a completed job with a few direct edits. This makes agent limitations manageable.

**Effort:** 3–5 engineer-weeks. **Score:** Must do. **Scale:** Medium.

### 4. Change one input; rerun only what depends on it

**Borrow from:** ComfyUI's input-signature cache and n8n's partial-execution machinery.

**User flow:** Research 30 competitors → create comparison → make a purchasing brief. Change the comparison weighting. KronTerm keeps valid research, recomputes ranking, and regenerates the brief. It shows exactly what ran again and why.

Creative example: select a different approved image and change a caption without repeating generation of every candidate.

**Mechanism:** Existing workflow dependencies gain immutable input/output revisions and cache signatures. Signatures include relevant tool/model/config versions. Changed inputs invalidate dependent pure steps. External mutations follow an explicit effect policy; a recorded click is not a reusable pure result.

**Evidence:** [ComfyUI cache](https://github.com/Comfy-Org/ComfyUI/blob/8f04fd6ecf4a548937971e840af2a985529fab76/comfy_execution/caching.py), [n8n run-data cleanup](https://github.com/n8n-io/n8n/blob/d2dc2f9ce50294df5c08799af437c56e3e04ab13/packages/core/src/execution-engine/partial-execution-utils/clean-run-data.ts), [subgraph selection](https://github.com/n8n-io/n8n/blob/d2dc2f9ce50294df5c08799af437c56e3e04ab13/packages/core/src/execution-engine/partial-execution-utils/find-subgraph.ts).

**First slice:** File/JSON transformations in one three-step workflow. Reuse the current graph and checkpoint invalidation; add revision-aware caching and a recomputation preview.

**Ship gate:** A changed criterion reruns precisely the dependent pure steps. Stale inputs cannot produce a “current” result. A retry does not repeat an external write.

**Why it matters:** Makes iteration cheaper and faster. Users can revise an answer without buying the entire task again.

**Effort:** 4–8 engineer-weeks for constrained pipelines. **Score:** Must do after typed artifacts. **Scale:** Massive infrastructure investment; do not promise universal replay.

### 5. Agent merge desk: take the best parts of different solutions

**Borrow from:** GitButler's persisted hunk assignments and branch/stack attribution.

**User flow:** Agent A has a concise fix. Agent B has the missing regression test. The review desk shows each proposal, source run, changed hunks, and test results. Pick A's implementation and B's test. KronTerm assembles them in a fresh integration worktree, runs the combined checks, and presents the resulting patch.

**Mechanism:** Proposed changes carry origin run, base revision, file/hunk identity, and dependencies. Start with independent files and obvious compatible hunks. Overlapping changes require a deliberate resolution. Agents remain isolated; no shared-checkout race.

**Evidence:** [GitButler hunk assignment source](https://github.com/gitbutlerapp/gitbutler/blob/4fd6b87497be514a259dc4f57781e1914b123f40/crates/but-hunk-assignment/src/lib.rs).

**First slice:** Two local task results; independent-file composition; combined diff; test command. Add hunk dependency analysis after that works.

**Ship gate:** Every integrated change retains origin. A moved base forces recomputation. “A passed” and “B passed” cannot imply the combined patch passed.

**Why it matters:** Parallel agents become useful alternatives with composable results, instead of more tabs for the user to reconcile manually.

**Effort:** 3–5 engineer-weeks for a constrained version; robust hunk dependency handling is larger. **Score:** Must do for developer differentiation. **Scale:** Massive. GitButler package licensing needs separate inspection before copying code; independently implement the initial mechanism.

### 6. Teach an agent a correction while it is working

**Borrow from:** Installed Manus recording/delivery components and its publicly described skills; prior Vy research provides additional historical evidence, not current service validation.

**User flow:** The agent reaches the wrong settings page. Pause, click **Show the missing step**, demonstrate the correct path, and stop recording. KronTerm proposes a three-step insertion with prerequisites and expected result. Edit it, test on a second input, and save it to this project.

**Stronger than a generic recorder:** Capture the correction at a known run boundary, then connect it to a reusable operation. Prefer semantic controls and typed fields; raw mouse coordinates are fallback evidence, not the default skill.

**Shipped-artifact observation:** Manus Studio 2.0.7 includes `remoteSkillRecordingService`, `remoteSkillDeliveryService`, `autoWorkspaceManager`, and a session-bound local preview service. Focused source inspection observed recording start/status/begin/stop/cancel/cleanup calls, ownership checks, artifact access, transcription download routing, delivery acknowledgment handling, and workspace binding checks. This establishes client-side components and control flow, not that recording reliably creates a good skill or that cloud behavior is recovered.

**First slice:** Explicit user-started recording in one KronTerm browser widget; semantic action log + observations; proposed workflow insertion; a reviewed parameter schema; second-input test. No background recording of the entire desktop is needed.

**Ship gate:** Demonstration preserves target identity. User can remove recorded content. Generated skill must pass a new-input test before being marked reusable. Do not turn one correction into a global rule automatically.

**Why it matters:** Nonprogrammers improve their own agent workflows using actions they already know how to perform.

**Effort:** 4–6 engineer-weeks for a browser-only prototype; native apps and robust generalization add significant scope. **Score:** Strong, strategic. **Scale:** Massive.

### 7. Select an object and change that object

**Borrow from:** Excalidraw's imperative scene updates, change callbacks, and editable scene restoration.

**User flow:** Select three process boxes: “Run these in parallel and reconnect the arrows.” KronTerm proposes a patch to those objects and connectors. Accept; keep editing manually. Another example: choose two chart labels and change the wording without regenerating the chart or surrounding scene.

**Mechanism:** Send selected object IDs, scene revision, relevant editable properties, and intent. Return a constrained patch. Detect intervening manual edits before applying. Preserve object identity and undo history.

**Evidence:** [Excalidraw API/types](https://github.com/excalidraw/excalidraw/blob/e1b7aacb356a492aa1e0fc6eb57b8896124027f0/packages/excalidraw/types.ts), [scene restoration](https://github.com/excalidraw/excalidraw/blob/e1b7aacb356a492aa1e0fc6eb57b8896124027f0/packages/excalidraw/data/restore.ts).

**First slice:** Text, shapes, connectors, and annotations on the existing canvas. Do not replace its library to get this interaction model.

**Ship gate:** A concurrent manual edit triggers a conflict choice; accept/undo round-trips the exact intended objects. The rest of the scene stays editable.

**Why it matters:** Users can direct local changes precisely, instead of asking for another whole artifact and losing their manual work.

**Effort:** 2–4 engineer-weeks for constrained objects. **Score:** Strong. **Scale:** Medium.

### 8. Batch variants with an actual decision gallery

**Borrow from:** ComfyUI's queue, prompt history, outputs, and cache.

**User flow:** One product photo → three backgrounds × four lighting settings → a contact sheet with twelve jobs. Star two. Generate approved crops and sizes from those winners only. Inspect which model, seed, input, and settings produced every result.

**Mechanism:** An optional adapter to an already-running ComfyUI instance submits versioned jobs, tracks progress, retrieves history, and normalizes outputs into asset records. Each variant has a parent, recipe, state, and selection. Surface partial failures, cancel remaining jobs, retain useful outputs.

**Evidence:** [ComfyUI server routes](https://github.com/Comfy-Org/ComfyUI/blob/8f04fd6ecf4a548937971e840af2a985529fab76/server.py). Installed ComfyUI 0.8.22 was inventoried; its runtime was not tested.

**First slice:** One user-supplied workflow, a small parameter grid, gallery, cancellation, and derived crops. Connect a supported service; do not bundle a GPU/model ecosystem to demonstrate value.

**Ship gate:** Every output maps to its run and recipe. Failures stay visible. Selecting winners drives downstream work deterministically. Track GPU time or available costs honestly.

**Why it matters:** A useful production workflow for creators and small businesses, with direct visual comparison and controlled iteration.

**Effort:** 2–3 engineer-weeks for a narrow optional adapter; production support across custom workflows is larger. **Score:** Strong. **Scale:** Medium.

## Twenty more concrete mechanisms

These are smaller additions, supporting infrastructure, or audience-specific bets. They are ranked within their group, not promises to build everything.

| ID | Pick and donor | Concrete user-visible behavior | Actual delta for KronTerm | First-slice effort / judgment |
| --- | --- | --- | --- | --- |
| 9 | **Live collections** — [Obsidian Bases](https://obsidian.md/help/bases), [Tana supertags](https://outliner.tana.inc/learn/features/supertags) | Tag pages, files, and saved outputs as Vendor/Incident/Asset; edit fields; filter; reopen the original live surface. | Durable typed objects independent of where blocks are laid out; reusable views over those objects. | 3–5 weeks; Strong. Underpins #1/#2. |
| 10 | **Buttons on the object** — [Notion database buttons](https://www.notion.com/help/database-buttons), [Raycast Quicklinks](https://www.raycast.com/core-features/quicklinks) | A customer row has Open account, Inspect logs, Draft response; selected account ID binds the right inputs. | Typed action bindings on an object/selection, reusing existing tools and command center. | 1–2 weeks for local/open actions; Must do quick win. |
| 11 | **One operation, both human form and agent tool** — [Activepieces metadata](https://github.com/activepieces/activepieces/blob/944121fca6ab74242b8a92b9c192f26ccaa40de0/packages/pieces/framework/src/lib/piece-metadata.ts) | Query issues with chat, then edit a bulk-label form for selected rows; both use the same operation. | One versioned input/output/auth contract renders forms, action menus, tools, and batch operations. Existing tool search remains the discovery layer. | 3–5 weeks for three real operations; Must do foundation. |
| 12 | **Save this workspace as a kit** — [Warp Workflows](https://docs.warp.dev/knowledge-and-collaboration/warp-drive/workflows) | Turn a successful setup into a kit; enter another repo/client; launch the right terminal, browser, docs, and commands. | Variable extraction/binding + selected layout + environment requirements on existing workflow packs/project launch. | 2 weeks for manual variables; Strong. |
| 13 | **Search your work by what happened** — [BrowserOS audit/replay](https://github.com/browseros-ai/BrowserOS/blob/7fdd50f808004d37e8ddeacbf3817614f776523b/docs/neo/audit-and-replay.mdx) | “The page where I found that SSO restriction yesterday” finds the captured page and related task; inspect the action that led there. | Index existing research/session/activity records with links to artifacts. Later add scoped replay. A bounded in-memory activity list is not a durable history index. | 2–3 weeks for existing records; Strong. |
| 14 | **Scrub an agent's browser session** — [BrowserOS replay construction](https://github.com/browseros-ai/BrowserOS/blob/7fdd50f808004d37e8ddeacbf3817614f776523b/packages/browseros-agent/apps/claw-server/src/services/replay/builder.rs) | Jump to the step where a task went wrong, inspect its page state, then start a new task from that observation. | Run/tab/document-bound observation playback, synchronized with tool events. Playback is not restoration or automatic re-execution. | 3–5 weeks for screenshot/event playback; DOM replay is more. Strong. |
| 15 | **Prepare my meeting commitments** — [Granola recipes](https://www.granola.ai/blog/meeting-recipes-repeatable-formats) | Import notes; review commitments; click one to open relevant project/materials and a prepared next action. | Editable commitment extraction linked to a workspace and existing action items. Import transcripts first; no new meeting recorder required. | 1–2 weeks; Strong for agency/operations pilots. |
| 16 | **Finish the customer feedback loop** — [Linear Customer Requests](https://linear.app/docs/customer-requests) | Capture two reports, link them to one issue, then draft tailored completion responses when the fix is ready. | Original-source/customer linkage around tasks and issue connectors, rather than a new CRM. | 2–3 weeks with manual linking; Strong for small product teams. |
| 17 | **Client identities that bind the whole workspace** — [Arc Profiles](https://resources.arc.net/hc/en-us/articles/19227964556183-Profiles-Separate-Work-Personal-Browsing) | Switch client once; browser account partition, repo/root, remote target, and instructions align visibly. | Explicit identity/routing policy above existing workspace and partition support. No credential copying. | 2–4 weeks; Strong if consultants are the market. |
| 18 | **Continue when this exact event happens** — [Trigger.dev waitpoints](https://github.com/triggerdotdev/trigger.dev/blob/d5dc4842441a42f231269eb766ab732527642ccd/internal-packages/run-engine/src/engine/systems/waitpointSystem.ts) | Park a task until a specific CI run finishes or artifact arrives; continue without an active model polling loop. | Durable typed waits bound to resource/version, expiry, and deduplicated events; not another cron scheduler. | 2–3 weeks for CI adapter; Must do for unattended jobs. |
| 19 | **Change provider without losing the task** — [OpenCode compaction](https://github.com/anomalyco/opencode/blob/501b15af26915ba52682e20e220e7e137e89e92f/packages/core/src/session/compaction.ts) | Switch mid-job; the replacement knows constraints, unresolved requests, worktree, diff, and next check. | Visible provider-neutral context envelope above existing ACP session resume, with constraint-retention checks. | 2–3 weeks for one switch path; Strong. |
| 20 | **Facts go stale when their evidence changes** — [Graphiti temporal edges](https://github.com/getzep/graphiti/blob/7b0182f94d27075db488636cd5456981ee10b987/graphiti_core/edges.py) | Correct a test command once; changing package scripts later marks the remembered command stale. | Invalidation triggers and retrieval policy on existing scoped/provenance/TTL memory records. No mandatory graph server. | 2–3 weeks; Strong. |
| 21 | **A small architecture map before the first agent turn** — [Aider repomap](https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py) | Select an RPC handler; context includes caller, source types, tests, and relevant instructions before broad exploration. | Token-bounded symbol ranking/cache over existing LSP and selections. Previously proposed in session 22; now source-grounded, not counted as novel. | 1–2-week prototype; Strong supporting work. |
| 22 | **Prepare this repo's real environment** — [Dev Container spec](https://github.com/devcontainers/spec/blob/main/docs/specs/devcontainer-reference.md) | Detect an existing devcontainer, prepare it, then open matching terminal, preview, and agent target. | Recorded environment/config/commit identity and setup results above existing sandbox/project grouping. | 2–4 weeks with existing CLI adapter; Strong, platform dependent. |
| 23 | **Try a second hypothesis from here** — [LangGraph checkpoint/state updates](https://github.com/langchain-ai/langgraph/blob/98043c37abc60374030f960a03a6e0d4c0112643/libs/langgraph/langgraph/pregel/main.py) | Compare cache repair vs session-owner repair from the same reproducer, environment, and checkpoint. | Preserve alternative run histories and fresh worktrees instead of restoring over one run. Combine with #5. | 2–4 weeks for serial two-way comparison; Explore. |
| 24 | **Pin a sample and test against it** — [n8n execution reconstruction](https://github.com/n8n-io/n8n/blob/d2dc2f9ce50294df5c08799af437c56e3e04ab13/packages/core/src/execution-engine/partial-execution-utils/recreate-node-execution-stack.ts) | Pin an awkward parsed invoice, redact/edit it, and rerun transformations without fetching or uploading it again. | Explicit fixture input at the existing tool boundary plus expected outputs; fixture mode never masquerades as live evidence. | 1–2 weeks for structured outputs; Must do quick win. |
| 25 | **Saved panels show freshness** — [marimo reactivity](https://docs.marimo.io/guides/reactivity/) | Change a CSV; dependent dashboard updates or marks stale, while external write buttons remain idle. | File/dataset revision subscriptions and freshness metadata. Reuse existing file events/Jotai; don't add another state framework. | 2–4 weeks after identity model; Strong. |
| 26 | **Edit a demo by editing its transcript** — [Descript text-based editing](https://www.descript.com/video-editing) | Record a short walkthrough; delete a sentence; export the shortened clip with an inserted preview scene. | Capture/transcript alignment and minimal scene controls using existing media tooling. A complete NLE is not the first slice. | 4–6+ weeks after capture validation; Explore. |
| 27 | **Named context packs you can inspect and reuse** — [LLM fragments](https://github.com/simonw/llm/blob/cbeeb8f2b93b642107e51c735c7eb55734355da1/docs/fragments.md) | Select four sources → “Save as onboarding context”; attach that exact version to any specialist later. | Hash-addressed source bundles, aliases, bounded contents, source revisions. Distinct from a lossy conversation summary or mutable global memory. | 1–2 weeks for saved source bundles; Strong quick win. |
| 28 | **Resume below the whole-step boundary** — [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | App stops after an expensive completed sub-operation; resume reuses its durable result and continues remaining work. | Per-effect intent/result/receipt journal on current workflow store. Idempotency where supported; uncertain external effects still reconcile. | 3–5 weeks core plus adapters; Must do infrastructure, not launch headline. |

Effort is an order-of-magnitude estimate for an experienced engineer or small pair working on a narrow slice. Totals are not additive: many picks share the same required contracts. Production support, cross-platform packaging, migration, and reliability testing can substantially increase them.

## The combinations that could make KronTerm hard to replace

### A. Research → decision → reusable operating tool

Combine #1, #2, #3, #9, #10, and #11.

**Demonstration:** Import 25 supplier URLs. Build a sourced comparison. Correct two extracted prices. Select a shortlist. Generate the purchasing brief. Keep the workflow as a tool with product requirements and currency as inputs. A month later, refresh changed cells and compare with the previous decision.

**What users keep:** Corrected data, their selection rules, working actions, source history, and a useful app. This is the strongest broad bet because it serves research, operations, founders, support, and developers.

**What makes it hard:** Stable identity, correction preservation, source freshness, and dependable connector behavior. A pretty table and generated HTML are insufficient.

### B. Generate → compare → edit → produce

Combine #7, #8, #4, and #3.

**Demonstration:** Create twelve product visuals, choose two, adjust text/objects directly, derive campaign sizes, then rerun only a changed caption/layout branch. The selected asset and its recipe remain attached to the output.

**What users keep:** Approved assets, recipes, dimensions, human edits, and reusable production flows. Start with one ComfyUI workflow plus constrained editable composition; a generalized studio is unnecessary.

### C. Explore alternatives → combine → verify

Combine #5, #23, #21, #19, and existing verification/worktree foundations.

**Demonstration:** Two implementations start from one reproducer. Compare them. Take the smaller fix and the stronger tests. Run checks on the merged proposal. Hand off to a different provider without losing the original constraints.

**What users keep:** A more useful result from parallelism, rather than simply more running agents. Hunk composition is an opportunity to differentiate developer workflow; it is not proof of market uniqueness.

### D. Show me → correct me → reuse it

Combine #6, #12, #24, and #28.

**Demonstration:** Teach one local browser workflow. Correct the draft skill. Test it on sample data. Save it as a client kit. Run again on a new client; unfamiliar state produces a correction form, not a blind click loop.

**What users keep:** Tested procedures and their context. Reliable generalization remains the major technical risk; scope the first version tightly.

## Ruthless scoring

Scores 1–5 are judgments, not measurements. Reach refers to likely eligible users within the broad proposed beta audience; frequency is expected use. Feasibility 5 means easiest relative to current foundations.

| Bet | Impact | Reach | Frequency | Differentiation | Compounds | Feasibility |
| --- | --- | --- | --- | --- | --- | --- |
| Actionable tables + refreshable research | 5 | 5 | 5 | 3 | 5 | 4 |
| Keep as tool | 5 | 5 | 4 | 4 | 5 | 3 |
| Direct correction + continue | 5 | 5 | 4 | 3 | 4 | 4 |
| Selective downstream rerun | 4 | 4 | 4 | 3 | 5 | 2 |
| Agent merge desk | 5 | 3 | 4 | 4 | 4 | 2 |
| Teach a correction | 5 | 4 | 3 | 3 | 5 | 2 |
| Selected-object editing | 4 | 3 | 4 | 3 | 4 | 3 |
| Variant decision gallery | 4 | 3 | 4 | 2 | 4 | 4 |
| Workspace kits + object actions | 4 | 5 | 5 | 3 | 5 | 4 |
| CI waits + effect journal | 4 | 4 | 4 | 2 | 4 | 3 |

Do not mistake the highest differentiation score for certainty. These scores should determine what to prototype and measure, not become marketing claims.

## What I would actually ship first

### Do now: one useful slice, then validate

**Primary lane: select data → act → save.**

1. Extend Data Studio with stable row/dataset identity and selected-row tool input (#1).
2. Bind a few existing local/open operations to selected objects (#10).
3. Add one editable correction boundary (#3).
4. Persist a small read-only app using the same dataset and operation contract (#2).

Use one concrete scenario: supplier comparison, incident triage, or a file-processing batch. Choose with pilot users; do not implement three bespoke vertical products at once.

**Small parallel product experiment, only if staffing permits:** a ComfyUI adapter + decision gallery (#8). It gives a fast, visible creative use case through an existing engine.

### Do next: make the slice worth repeating

Add three shared operation manifests (#11), research-cell refresh, named context packs (#27), and workspace kits (#12). Then add selective recomputation (#4) to the structured pure steps where it has a clear cost/latency payoff.

For a developer-focused release, move the merge desk (#5) ahead of creative work, starting with independent files. Build one integration path well before attempting arbitrary hunk synthesis.

### Explore after users repeat the workflow

Browser teaching (#6), cross-surface replay (#14), client identities (#17), and transcript-edited demos (#26). These are meaningful opportunities but add platform or interaction scope. Prototype them against actual user tasks before committing to a general recorder, browser replacement, or media editor.

### Pass or defer

- Another generic canvas, chat skin, agent swarm dashboard, or autonomous scheduler. Relevant primitives already exist, and competitors already sell them.
- Copying entire n8n/Dify/ComfyUI/Appsmith applications into KronTerm. Use specific mechanisms or supported adapters; keep one execution and permission boundary.
- Marketing support for hundreds of integrations before three operations work in both human and agent flows.
- Starting all video/game/3D/document studios together. Shared artifacts, operations, and correction handling offer more reusable value.
- Claiming arbitrary browser/native operations can be safely cached, replayed, or undone. Scope such promises to supported operations with known semantics.

## Adoption path: reuse, adapt, or connect

| Donor | Practical approach |
| --- | --- |
| DuckDB-Wasm, marimo, Excalidraw, Aider, OpenCode, Graphiti, LLM | Candidate library/code reuse where useful, subject to the selected file/package's terms and compatibility. Often adapting only the mechanism is cheaper than embedding the project. |
| Activepieces / Appsmith | Inspect selected community package boundaries and dependencies; borrow metadata/binding patterns first. Avoid importing entire platforms. |
| ComfyUI | Optional adapter to a user-run installation through supported queue/history APIs; evaluate distribution obligations if any engine components ship. |
| n8n, Dify, Windmill, BrowserOS, GitButler | Study behavior and source architecture; independently implement bounded mechanisms or use supported external interfaces. Their licenses/package boundaries are not interchangeable with permissive dependencies. |
| Manus, Retool, Notion, Granola, Linear, Arc, Descript, Warp product behavior | Treat as behavior references. No proprietary assets or code need to be copied to build KronTerm's own implementation. |

Detailed dated license observations are in the source notes. This research does not establish distribution clearance. No dependencies were installed or vendored.

## Questions and next steps

### Answered

- **What is materially better than the previous picks?** Direct manipulation of useful results, reusable working apps, composable agent changes, and teachable corrections extend what users can accomplish. Reliability work remains a foundation rather than the entire pitch.
- **Where does the advantage compound?** Corrected objects, working actions, project-specific apps, source history, and tested procedures accumulate together.
- **Did reverse engineering happen?** Yes: focused static inspection of selected shipped Manus desktop modules; scope, hashes, integrity limitation, and unfinished broad analysis are documented in the source notes. No runtime claims are inferred from filenames alone.
- **Did we build any of it?** No. This is the strategy phase required by the invoked skill.

### Open, not blockers to this research

- Which initial audience should choose the scenario: developers, agencies, or research/operations users?
- Which existing KronTerm workflow/selection paths are already reliable in the packaged app?
- Which three connected operations recur most often for actual users?

### Next steps

- [ ] Test the top four primary-lane interactions with five users and their own material.
- [ ] Define the small shared contracts: dataset identity/revision, typed operation, correction payload, app definition.
- [ ] Build one scenario that passes restart, stale-selection, and partial-failure cases.
- [ ] Measure time to a useful saved tool, repeated use the following week, and corrections needed per completed task.
- [ ] Prototype merge composition or the variant gallery according to the chosen audience.

Success means users return to run their own working tools. More feature names alone will not establish a lead.
