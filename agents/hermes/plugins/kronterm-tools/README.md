
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
