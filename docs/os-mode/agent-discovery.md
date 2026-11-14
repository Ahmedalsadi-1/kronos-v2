# KronOS Agent discovery and context

Hermes exposes the workspace catalog as `kronterm_tool_search`; MCP clients use
`tool_search`. Both share the same search implementation and current scope policy.

```json
{"query":"","family":"workflow","limit":10}
```

Search with a short task phrase, an exact tool name, or a family. Common plurals,
separators, and filler words are normalized. Exact names rank first. All meaningful
terms must still match; search does not silently replace an unknown tool with a
different action.

```json
{"query":"files read","readOnly":true,"includeSchemas":true}
```

Results include available family counts, the filtered total, `nextOffset`,
`observedAt`, and the caller's workspace/tab/block and computer scope. Pass
`nextOffset` as `offset` to retrieve the next page. The maximum page size is 100.
Capability tokens and internal caller identities are excluded. These are enabled
tools, not a health check of every target, provider, account, or VM.

## Skills

Find operational guidance with `shared_skill_list`, then read the exact returned
ID with `shared_skill_read`. General routing lives in `kronterm-tool-workflows`;
workspace controls live in `wave-surface`. Their recovery guidance covers the
November 9 audit, including OS presentation prerequisites, stale references,
missing files, n8n ownership, and uncertain actions.

Skill search matches words across names and descriptions, including multiline
frontmatter descriptions. Removed roots do not break other roots, and skill-file
symlinks cannot escape allowlisted roots. Hermes translates canonical tool names
in skill instructions to its registered aliases while preserving exact skill IDs.
Ordinary page and widget content is not rewritten. Skill reads and status checks
are marked read-only in the tool manifest.

## Context and recovery

The system prompt now requires current catalog checks for optional capabilities,
distinguishes missing tools from disconnected runtimes, and explains when to refresh
discovery. It asks the model to retain a compact task handoff: outcome, constraints,
target ownership, canonical project and host/guest mapping, run IDs, verified
outputs, failures, and next action. This is guidance for conversation continuity;
it does not introduce a new durable memory store or guarantee model compliance.

The runtime refreshes its saved capability when workspace ownership changes even
if the tab ID stays the same. Scope resolution continues to use the task owner,
not whichever workspace is visible.

## Validation and rollout

183 MCP tests, 31 Python adapter tests, and 36 targeted runtime/prompt tests passed.
The full TypeScript check and `git diff --check` also passed.
The discovery integration test checks real registered handlers, pagination,
scope filtering, and omission of capability secrets. No live model task or user
workspace was mutated for these tests.

Restart the rebuilt desktop to load the updated plugin and manifest. Start a new
chat to exercise the updated system context without older conversation assumptions.
