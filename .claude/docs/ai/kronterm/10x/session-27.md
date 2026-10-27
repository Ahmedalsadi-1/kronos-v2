# KronTerm direction: UI, foundation, compatibility, and harness tools
Session 27 | Date: 2026-10-18

## Decision

Refocus the next development phase on making KronTerm a coherent, capable host for agents. Keep selected mechanisms from session 26, but apply them to the workspace and harness before expanding into additional product studios.

The intended experience: **choose an agent, understand what it can do, give it precise workspace context, watch useful progress, inspect its results, and recover without losing your place.**

This updates the recommended order from [session 26](session-26.md). It preserves those ideas as candidates; it does not authorize building all of them or remove existing functionality. This document is a source-grounded implementation direction, not completed implementation or a visual audit of the running app.

## Keep, reshape, defer

| Earlier pick | Decision for this direction |
| --- | --- |
| One operation powers both a human form and an agent tool | **Keep, high priority.** Apply to native workspace tools first: one schema, one handler, consistent results, matching UI controls. |
| Select objects/rows and act on precisely those | **Keep.** A shared selection contract for files, browser elements, terminal output, canvas objects, and existing Data Studio rows. |
| Direct correction and continue | **Keep.** Structured questions and editable fields in the existing agent UI. Preserve pending state through reconnect/restart. |
| Named context packs and portable continuity | **Keep.** Visible attachments, requirements, source references, and provider-aware handoffs. |
| Pin a sample and test against it | **Keep, high priority.** Turn real tool failures into sanitized adapter fixtures and regression cases. |
| Repository map and invalidated project memory | **Keep after contracts stabilize.** Improve context assembly using existing LSP and memory stores. |
| Workspace kits and typed action buttons | **Keep, narrowed.** Parameterized existing tools and layouts, invoked from current command UI. |
| Reusable mini-apps | **Reshape.** First deliver small typed tool views: diff, table, file list, screenshot, structured form. A full app builder can wait. |
| Agent merge desk | **Later.** First make diff/artifact handling consistent across adapters. |
| Media gallery, teaching recorder, transcript video editor, customer CRM loop | **Defer from this phase.** They do not directly address the chosen foundation and compatibility priorities. |

## 1. UI: make agent work readable and controllable

### A. Consistent tool cards with useful output

A terminal operation shows command, directory, exit state, bounded output, and Open terminal. A file operation shows changed paths and Open diff. A browser operation shows target page, observation time, and Open surface. A batch shows succeeded/failed/pending counts and Inspect failed items.

Use a common shell with typed renderers. Summary first; arguments, raw output, and trace details remain expandable. Do not infer completion from attractive styling or a final sentence.

**Existing base:** [tool-result-summary.ts](/Users/albsheralsadi/kronterm/frontend/hermes/lib/tool-result-summary.ts) already offers heuristic summaries; [tool-view.ts](/Users/albsheralsadi/kronterm/frontend/hermes/store/tool-view.ts) already supports product/technical disclosure. Extend those paths with explicit result types, retaining a fallback for unknown tools.

**Acceptance:** failure/uncertainty cannot disappear in the summary; partial output remains inspectable; expanding a card preserves scroll and focus; large outputs do not force full transcript rerenders. Cover empty, running, interrupted, failed, and completed states.

### B. One clear account of current agent state

Use stable meanings for connecting, working, waiting for input, verifying, reconnecting, completed, failed, and cancelled. Preserve provider-specific detail in the inspector. Distinguish an agent waiting for the user from one waiting for a tool or transport.

The workspace, chat, HUD, and activity overlays should project the same runtime operation. A long-running action remains discoverable when its original panel is hidden. No new competing floating dashboard is needed.

**Existing base:** [agent-activity.ts](/Users/albsheralsadi/kronterm/frontend/types/agent-activity.ts) has phases and target IDs. Some IDs are optional and legacy phases are normalized; migrate at boundaries rather than forcing unrelated tools into one rewrite.

**Acceptance:** the same operation has the same terminal state across surfaces; a reconnect cannot show a stale running badge forever; switching presentation preserves the actual live block and target.

### C. Precise context selection and keyboard flow

Selection should produce a visible context attachment: what was selected, source, scope, size, and version/observation when relevant. Users can inspect or remove it before sending. Keep focus predictable when opening a diff or jumping from a tool card to its surface.

Use existing command contributions and shared controls. Add context-sensitive actions such as Inspect selected item, Explain selection, Attach to agent, Open result, and Run saved action. Preserve widgets, tabs, canvas, and OS presentations, including HUD behavior.

**Existing base:** [kronterm-palette-rows.ts](/Users/albsheralsadi/kronterm/frontend/app/workspace/kronterm-palette-rows.ts) already registers workspace commands through the Hermes contribution registry. Do not recreate a parallel command system based on older notes saying no registry existed.

**Acceptance:** complete the inspect → attach → act → inspect-result loop with the keyboard; context never silently jumps to another workspace or renderer. Use rendered before/after checks during implementation; this strategy pass did not inspect the current screen.

## 2. Foundation: strengthen shared boundaries

### A. One operation identity through the whole path

Carry run/session/turn/tool IDs, event ordering, target identity, timestamps, and terminal state across ACP, the native bridge, MCP, Hermes adapter, and UI. Map provider IDs explicitly. Persist the subset needed to recover state and render history without repeating actions.

**Already present:** [acp-observability.ts](/Users/albsheralsadi/kronterm/emain/acp/acp-observability.ts) provides trace IDs, operation IDs, sequences, timing, and failure categories. [tool-execution.ts](/Users/albsheralsadi/kronterm/mcp-kron-term/src/tool-execution.ts) provides request IDs, deadlines, cancellation signals, target metadata, and bounded diagnostic samples. The improvement is correlation and durable projection across these existing pieces.

**Gate:** duplicate/out-of-order events do not duplicate cards or regress completed state. Lost transport leaves interrupted/uncertain state where appropriate. A trace connects a user-visible failure to the actual adapter/tool request.

### B. Explicit result contracts

Add a versioned internal result envelope for owned tools: outcome, structured data, artifacts, target, timings, and failure/recovery details. Adapt external MCP/ACP content at boundaries; preserve useful raw content and protocol fields.

Current `normalizeToolResult` recognizes several legacy failure shapes. Keep it as a compatibility fallback while owned tools adopt typed outcomes. A command's stderr is not automatically a failure; a completed transport call is not automatically a successful action.

**Gate:** typed errors survive Python/TypeScript transport and UI rendering. Text-only external tools remain usable. Tables and diffs open using references rather than parsing prose.

### C. Cancellation, recovery, and resource ownership

Audit cancellation from UI to transport to actual operation owner. A local timeout means the caller stopped waiting; it does not prove an external operation stopped. Keep uncertainty visible until observation or receipt resolves it.

Extend current session recovery with explicit pending questions, artifacts, and relevant tool results. Make cleanup ownership clear for terminals, worktrees, browser surfaces, and sandboxes. Retain existing scoped runtime owners instead of adding a central process manager for everything.

**Gate:** cancel while connecting, awaiting permission, streaming, and running a tool; no wrong-session cancellation; no automatic replay of uncertain mutations; recover completed results without executing them again.

## 3. Compatibility: publish what actually works

Compatibility has four independent dimensions:

| Dimension | What must be recorded and tested |
| --- | --- |
| Agent integration | CLI launch versus structured ACP session, supported protocol version, advertised capabilities, authentication, resume/cancel semantics. |
| Model/provider | Accepted input types, tool-call format, structured-output support, context limits where known, streaming and error behavior. Preserve chosen provider/model settings. |
| Tool integration | MCP transport/schema/content support, aliases, result envelopes, dynamic availability, auth/connection state. |
| Execution target | Local workspace, remote host, browser widget, native app, VM, or device; actual host/OS requirements and target ownership. |

### A. A capability view built from runtime facts

An agent row should say **CLI only**, **structured integration ready**, **needs setup**, or **unavailable**, followed by feature details where useful. Show negotiated support separately from behavior verified by conformance tests.

**Existing base:** [agent-provider-catalog.ts](/Users/albsheralsadi/kronterm/frontend/hermes/app/contrib/agent-provider-catalog.ts) is a declarative CLI launcher. [acp-agent-manager.ts](/Users/albsheralsadi/kronterm/emain/acp/acp-agent-manager.ts) already negotiates capabilities and manages sessions. [acp-harness.ts](/Users/albsheralsadi/kronterm/emain/acp/acp-harness.ts) already has profiles, toolsets, and capability leases. Connect their facts; launching a command does not prove all harness features work.

**Concrete example:** If an adapter cannot accept embedded images, the composer offers a supported context path or a clear explanation before dispatch. If resume is unavailable, do not imply a fresh session is native resume.

**Gate:** missing capabilities are treated as unsupported; the UI explains which capability is missing and which supported alternative exists. Do not silently substitute a different agent or execution target.

### B. A conformance suite for every supported adapter

Use deterministic fake-agent/fake-tool fixtures first, then opt-in smoke tests against installed providers. Cover initialize/auth/new session, text streaming, tool intent/result, images where supported, questions, cancellation, malformed messages, process exit, resume, and unknown extension fields.

Store adapter/version/host test results. Avoid claiming “all providers compatible” because they share an API shape. Start with Hermes, bundled KronosCode, and the next two adapters actually used by beta users.

**Existing evidence:** [the October 16 reliability report](/Users/albsheralsadi/kronterm/output/research/hud-tool-reliability-2026-10-16.md) records a 205-tool canonical/exposed-name contract check and focused tests. That is valuable historical evidence; it is neither a current rerun nor certification of every application workflow. Extend the existing coverage instead of restarting the test effort.

### C. Negotiate versions, keep migrations explicit

Track UI/backend contract, agent protocol, tool schema, and artifact format separately. Preserve compatibility identifiers. An unsupported newer feature should degrade deliberately while baseline supported features keep working where possible.

Primary references checked for this direction: [ACP initialization/capability negotiation](https://agentclientprotocol.com/protocol/v1/initialization) and [MCP tool contracts](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). The ACP docs distinguish stable v1 from a v2 draft; inspect negotiated support before considering migration, and do not implement draft behavior merely because it appears in current docs.

## 4. Tools on the harness, and tools for the harness

### Tools agents use to do work

1. **Context inspection:** inspect exact bound workspace, source references, selected objects, and environment. Improve existing inventory tools and return bounded structured results.
2. **Long-running operations:** consistent start/status/cancel/result handles, backed by the operation owner; don't introduce fake cancellation around a still-running command.
3. **Artifact access:** list/read/open paged table, diff, screenshot, and file results by stable references. Keep large data outside the prompt unless requested.
4. **Structured input:** request editable values and resume the same task using the existing question lifecycle.
5. **Small tool packs:** task-appropriate tools and instructions from current leases/discovery, with visible unavailable prerequisites. No new universal execution bypass.

### Tools maintainers and agents use to diagnose the harness

Proposed names below are design placeholders, not registered or implemented tools.

| Proposed diagnostic capability | Useful result | Initial boundary |
| --- | --- | --- |
| `harness_status` | Runtime versions, readiness, selected adapter, negotiated capabilities, active target, and actionable setup faults. | Read-only; sanitized status, no secrets or raw environment dump. |
| `harness_trace_read` | Ordered event path for one run/operation, including routing, duration, failure category, and recovery state. | Paginated and scoped to the selected task; reuse current trace metadata. |
| `harness_contract_check` | Detect mismatch between discovered tool names, exposed aliases, schemas, and callable handlers. | Manifest/fixture verification first; no live mutations needed. |
| `harness_fixture_run` | Reproduce a reported adapter/parser failure using sanitized recorded events and expected outcomes. | Clearly fixture mode; side effects disabled. Reuse the ordinary code path with controlled transports. |
| `harness_tool_inspect` | Input/output contract, required target/capability, availability reason, timeout/cancel behavior, and examples. | Extend existing discovery metadata, not another tool catalog. |

A “dry run” is only valid when an operation explicitly implements a non-mutating preview. Never wrap an arbitrary shell/browser action and imply it has been safely simulated.

**Gate:** a maintainer can move from a failed UI card to the exact trace and reproduce the failure with a fixture. Diagnostic tools do not become a new source of cross-workspace access or credential leakage.

## Delivery order

### Milestone 1: one end-to-end contract

Pick a terminal command and a browser observation. Trace each from user input through adapter, tool, result, artifact, and UI. Document current IDs/state/timeout behavior and add the failing fixtures that matter. Establish baseline latency, failure, and rendering behavior.

Deliver result-envelope v1 for those two paths, correlation IDs, and typed tool cards with working Open result actions. This is the first concrete implementation batch.

### Milestone 2: compatibility people can understand

Expose installed/setup/CLI/structured states and negotiated capabilities in the existing agent UI. Add adapter conformance fixtures, alias/schema regression checks, and actionable setup failures. Test the bundled paths first.

### Milestone 3: dependable controls across surfaces

Harden cancellation/reconnect/pending-input behavior. Preserve context, selection, focus, and result navigation through chat, workspace, and HUD presentations. Verify with rendered screenshots, keyboard use, and targeted lifecycle tests.

### Milestone 4: make the foundation extensible

Add artifact references/paging, typed selection inputs, small tool packs, inspectable context packs, and the diagnostic capabilities above. Then add correction forms and row actions on the stable contract.

These are sequenced milestones, not calendar commitments. Estimate after tracing the two initial paths and identifying where current adapters already satisfy the contract.

## Release checks and next action

- One operation is traceable end to end and has consistent state across surfaces.
- Advertised capabilities match negotiation and conformance results; unknown support is labeled unknown.
- Tool failures and uncertain outcomes survive every adapter and remain visible in summaries.
- Cancel/reconnect/restart cases preserve ownership and do not replay effects.
- Users can attach context, inspect output, and return to their task without losing keyboard focus.
- Rendered checks cover actual desktop widths, narrow panels, theme, reduced motion, and empty/error/loading states.
- Run appropriate existing Vitest, MCP node:test, Python adapter checks, and `task check:ts` during implementation. No product checks were run in this strategy-only pass.

**Next concrete batch:** a terminal command and browser observation using one typed result contract, consistent tool cards, and end-to-end trace IDs. Follow with the compatibility view and conformance fixtures. This improves the UI and foundation together and creates a repeatable path for every later harness tool.
