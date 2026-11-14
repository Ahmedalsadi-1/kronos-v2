# 10x analysis for KronOS and n8n

Session 1 · November 8, 2026

## Current value

KronOS gives workspace operators a way to connect repeatable n8n steps to live browsers, files, widgets, and scoped agents. In one direction, chat can discover, edit, validate, and run saved n8n graphs. Graph edits check the saved version and synchronize with the open editor. In the other direction, n8n can call workspace tools or start a bounded Hermes or KronosCode worker. Hermes Agent passes workflow ID, execution ID, and the current n8n item into the worker. The generic Harness node routes by backend and currently passes the task and timeout without that same execution context. [Workflow tools](/Users/albsheralsadi/kronterm/mcp-kron-term/src/n8n-tools.ts:87) · [Versioned edits](/Users/albsheralsadi/kronterm/emain/n8n-workspace.ts:655) · [Hermes Agent node](/Users/albsheralsadi/kronterm/integrations/n8n/nodes/HermesAgent.node.js:37) · [Harness node](/Users/albsheralsadi/kronterm/integrations/n8n/nodes/KronTermHarness.node.js:38)

The reported friction is concrete. A user asked for an executable lead research flow and received connected notes when the agent could not reach the workflow tools. Tool routing has since improved. The next product gap is making the saved graph and run visible from the conversation where the user asked for it. The editor already has an execution dock. The worker currently ends when a run needs approval, clarification, sudo, or a secret, then directs the user to chat. [Execution dock](/Users/albsheralsadi/kronterm/frontend/app/tab/os-original-workflow.tsx:836) · [Worker lifecycle](/Users/albsheralsadi/kronterm/emain/n8n-hermes-worker.ts:100)

## The question

How can someone turn one successful workspace task into a workflow they can inspect, trust, and run again from the same conversation?

## Opportunities

| Priority | Feature | Impact, reach, and frequency | Differentiation and defensibility | Feasibility |
| --- | --- | --- | --- | --- |
| Must do | **Workflow card in chat.** After a saved edit, show the workflow name, saved version, real node chain, validation state, and Open on Canvas. After a run, attach the execution status, failed node or output references, and Open execution to the same card. | Every chat-built workflow gets a durable place to review what was built and see what happened. | Useful on its own. Harder to replicate once the card can jump to the live workspace node and show scoped results. | Low effort for a read-only card populated from saved edits and terminal execution data. Live events and actions come after the first slice. |
| Must do | **A shared contract for agent nodes.** Give Hermes and KronosCode the same workflow, execution, node, and item identity, explicit allowed capabilities, and schema-checked inputs and outputs. Route success and failure using fields n8n can map. | Every workflow that sends agent output downstream benefits, especially when it processes multiple items. | Lets people switch workers and compose reliable agent steps with deterministic nodes. Reusable contracts compound across workflows. | Medium. Start with optional schemas and execution context so existing graphs keep their behavior. Preserve each backend's scope. |
| Strong | **Review and test an agent-authored change.** Show the node and connection changes, missing bindings, and side-effectful steps. Run a pinned sample through approved steps and label the result as a fixture. | Most workflows benefit during authoring and debugging. A user can find a bad mapping before committing to a live run. | More valuable when a proposed change links to the affected widget or output port in Canvas. | Medium for a bounded test path. Block unsupported effects during fixture runs and reject stale diffs. |
| Strong | **Resolve a paused workflow in chat.** Show the blocked node, exact action, target, and why it needs a decision. Resume from a recorded checkpoint when the same run and grant remain valid. | Valuable for unattended runs that encounter ambiguity, missing access, or a changed target. Frequency needs measurement. | User decisions stay attached to the original run and can inform future safe recipes. | High. The current worker closes on these events. Durable suspension, grant revalidation, and idempotency are prerequisites. Keep secrets in dedicated surfaces. |
| Explore | **Turn a successful run into a reusable workflow.** Extract typed steps from an observed session, parameterize inputs, and let the user review a draft graph with a pinned example and expected results. Share the recipe with unresolved widget bindings. | High upside for work people repeat weekly. Reach depends on how often sessions contain stable steps. | Verified runs, workspace bindings, and reusable test cases get more valuable as users repeat and share them. | High. Prove it first on workflows with clear inputs and observable outputs. Preserve references and grants separately from portable recipes. |
| Pass for now | **More generic wrappers and a separate run dashboard.** | Limited value while users still have to leave chat to confirm a graph exists or see why it stopped. | Weak differentiation because the generic Tool node and editor execution list already cover the basics. | Feasible, with lower leverage than improving the current path. |

## Recommended priority

1. **Do now.** Ship the Workflow card with a real saved graph, validation status, Open on Canvas, and a link to the latest execution. Read status from n8n. Use the existing Hermes tool-message rendering as the entry point. [Chat message parts](/Users/albsheralsadi/kronterm/frontend/hermes/components/assistant-ui/thread/message-parts.tsx) · [Execution details](/Users/albsheralsadi/kronterm/emain/n8n-workspace.ts:696)
2. **Do next.** Align Hermes and KronosCode node inputs and outputs, then add Review changes and Test with sample. A successful sample run should produce an output downstream nodes can consume directly.
3. **Explore.** Add durable pause and resume where effects can be reconciled. Use verified runs as the basis for reusable recipes and sharing.

The first test case is the lead research flow from this conversation. Start with Manual Trigger → Search inputs → Maps exploration → Website verification → Filter → Lead output. Give the exploration worker a bounded scope. Make the filter read typed verification fields and make Lead output link to a table or CSV. Use a pinned sample for the first test. For the live run, show actual result counts and evidence links returned by the workflow.

## What to validate

- Can a user go from a chat request to a saved, validated graph and find it on Canvas without asking where it went?
- Can the same pinned input reach the filter with the same schema through either backend?
- Can a user identify a failed node and recover without accidentally repeating completed side effects?
- Measure request-to-first-valid-graph time, output schema failures, and reuse of successful workflows. Priority and reach are product hypotheses based on repository behavior and the reported user friction.
