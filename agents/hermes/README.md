# Hermes tool bridge

The `kronterm-tools` plugin registers the desktop TypeScript tool manifest with
Hermes. Availability comes from the live workspace-scoped tool list; the desktop
validates capability again when a tool executes.

- `browser_navigate` is exposed as `kronterm_browser_navigate` to preserve Hermes's
  own browser tool.
- `tool_search` is exposed as `kronterm_tool_search` to preserve Hermes's discovery
  configuration. It supports task phrases, family filters, pagination, and optional
  input schemas. Results include observed caller scope, family counts, and explicit
  separation between enabled tools and runtime readiness.
- `app_workflow` returns inspection, draft, and publishing recipes for existing
  browser or native app sessions. It does not connect accounts or execute actions.

Capability discovery caches successful responses for one second, scoped to the
bridge URL, token, chat, task, and delegation lease. A failed refresh disables the catalog and caches that failure
for two seconds so availability probes do not flood an unavailable bridge. Failed
calls invalidate the cache. Side-effecting calls are never automatically replayed.

Validate the Python adapter with:

```sh
uv run --with pytest python -m pytest agents/hermes/tests/test_kronterm_tools.py -q
```

The adapter translates tool-search results, capability guides, shared skills, and workflow recipes
to those same exposed names. Search queries translate back to canonical server names;
ordinary widget/page content is never rewritten. Background native workspace calls
use a 130-second transport budget, beyond the server deadline. A transport
failure during a mutation remains explicitly uncertain and is never replayed automatically.

## KronOS Agent harness

Routine shell work uses Hermes's existing headless `terminal` tool and configured
backend. Its persistent shell keeps state within the task/session without adding
terminal widgets. Ordinary calls wait for output; servers and other continuing jobs
use `background=true` and `process_manage`. Sandbox tasks keep using `sandbox_vm_exec`.
The managed runtime enables `kronterm,delegation,terminal,file`, including Hermes's
`read_file`, `write_file`, `patch`, and `search_files`. These built-in tools are separate
from the KronOS discovery catalog. The adapter checks their live scope before both
model advertisement and execution. Workspace chats and inherited workspace workers
can code directly without an external coding-agent executable. Sandbox-only, widget-only,
swarm, and workflow workers do not gain unscoped shell or filesystem tools.
The Hermes adapter requires `visible=true` on `terminal_open` and `block_run_command`
for an explicit user request to show a terminal. Without it, the call returns guidance
and creates no widget. Registration and discovery expose the same opt-in schema;
the shared MCP API remains unchanged. This flag expresses model intent, not a new
permission grant; existing execution approvals and scope checks still apply.

KronOS Agent uses the pinned Hermes runtime for conversations, provider calls,
and tools. The Rust library tracks delegation deadlines and fences identical
writes while a result is pending or uncertain. A worker normally joins the
current turn. An explicitly detached worker keeps a wall-clock deadline and
releases its workspace lease at exit or expiry.
Stop revokes the worker's native tool access and sends abort to its active
calls. The worker waits for tracked operations to settle before it exits.
Once an inline batch returns valid evidence, the parent uses that evidence
to finish the turn. Put independent worker tasks into the same batch.

Build the native library for local development with `npm run build:agent-harness`.
The managed runtime setup and release staging also build it. Run the headless
simulation with the pinned Hermes interpreter:

```sh
~/.kronterm/runtimes/hermes-0.22.5/source/.venv/bin/python agents/hermes/tests/simulate_harness.py
```

Add `--baseline /path/to/old/agents/hermes/plugins --repetitions 3` to compare
against an earlier adapter. Both versions use the same local scripted provider
and workspace fixture in fresh temporary homes. The run measures real turn and
worker lifetimes, bridge requests, and observed writes. Provider reasoning quality
is outside this fixture.

To compare the native deadline APIs, build the library and run:

```sh
python3 agents/hermes/harness/scripts/benchmark_deadlines.py
```

The benchmark uses fresh processes to measure setup time, watcher threads, and
peak RSS increase for idle pending batches. It excludes worker agents and
expiry cleanup. Peak RSS is a high-water mark, so zero increase means setup
did not exceed an earlier process peak.
