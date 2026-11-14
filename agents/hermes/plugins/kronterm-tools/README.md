
### Scoped smart delegation

KronTerm bundles Nous Research's Advanced Delegation provider and adds the
`kronterm_smart` backend. `delegate_task` accepts per-task `scope` (`sandbox`,
`widgets`, `inherit`) and `required_tools`. Computer mode defaults to sandbox.
A main-process lease fixes the owning chat, caller, selected computer and control
generation before the core creates a worker. A sandbox permits one delegated job
at a time; permissions are checked again on every tool call. Takeover, disabling
Computer mode, expiry or a control-generation change invalidates the lease.
Workers inherit the parent's restricted toolsets; model routes never grant tools.

Hermes 0.22.5 or newer is required. From the KronTerm repository run
`npm run prepare:hermes`, then restart KronTerm. This prepares a pinned isolated
runtime under `~/.kronterm/runtimes/` without changing an existing Hermes checkout.
Explicit `KRONTERM_HERMES_BIN` still takes precedence. Settings → Delegation
manages named model routes in `delegation.backends.model_map.options`; credentials
remain in the existing provider configuration. No route means the parent's model.
The managed backend refuses session switches to other delegation backends for
scoped jobs. Start a new session after changing model routes to refresh schemas.

Tool schemas are staged in a private manifest before Hermes starts, so an HTTP
startup failure cannot permanently register an empty toolset. Live availability
is cached briefly per chat and private worker lease; execution still checks the
current permissions. Failed preflight returns a tool error without spawning or
falling back to host tools.

## Local task tracing

Set `KRONOS_HERMES_TRACE_DB` to an absolute path in a private local directory
before launching KronOS or the managed Hermes process. Hermes creates the SQLite
database and keeps the newest 4,096 events. With the variable unset, the adapter
registers no trace callbacks. Use a fresh database for each benchmark run.

Export ordered NDJSON or summarize timings by execution boundary:

```sh
sqlite3 "$KRONOS_HERMES_TRACE_DB" 'SELECT payload FROM trace_events ORDER BY seq'
sqlite3 -header -column "$KRONOS_HERMES_TRACE_DB" '
  SELECT json_extract(payload, "$.event") AS event,
         json_extract(payload, "$.status") AS status,
         count(*) AS samples,
         round(avg(json_extract(payload, "$.duration_ms")), 1) AS mean_ms
  FROM trace_events GROUP BY event, status ORDER BY event, status
'
```

The trace records turn start and finalization, LLM and tool middleware duration,
and subagent start and stop. Process-local pseudonyms connect sessions, turns,
requests, tool calls, and parent/child relationships. Join turn start and end
on the session and turn pseudonyms to calculate elapsed wall time. An interrupted
turn is recorded when Hermes reports it at finalization. Worker status and duration
come from the subagent stop hook.

Execution timing covers the synchronous downstream middleware call. It has no
first-token marker, and excludes work before entering the middleware and any
stream consumption after the call returns. A `returned` status means that the
call returned normally, including tool responses that report errors in their
body. The trace has no renderer, Electron IPC, independent cancellation-request,
or approval-phase markers. A terminated process or an unavailable database may
leave gaps. Prompts, arguments, outputs, exception messages, credentials, images,
and reasoning are omitted. The database stays local.
