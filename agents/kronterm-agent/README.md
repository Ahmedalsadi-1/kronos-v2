# KronTerm Agent

KronTerm Agent is KronTerm's product identity for its OpenCode-compatible ACP specialist. The launcher delegates to a
locally installed `opencode` runtime while KronTerm owns the ACP session, isolated database, scoped tool server,
capability lease, and lifecycle.

The adapter intentionally does not vendor OpenCode source, user data, credentials, artwork, or branding. Existing ACP
sessions that use the internal `opencode` backend identifier remain compatible, but new user-facing sessions should use
`kronterm-agent`.

## Tool boundary

KronTerm starts the specialist with an authenticated loopback MCP endpoint scoped to the invoking workspace tab. The
specialist can discover the complete allowed KronTerm tool manifest, including HUD islands, widgets, browser, terminal,
files, sandbox, native computer use, and shared skills. Approval-required actions fail closed when there is no interactive
approval channel. Nested ACP delegation is blocked.
