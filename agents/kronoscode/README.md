# Bundled KronosCode Agent

This directory is the packaging boundary for KronTerm's primary ACP agent. The desktop's managed runtime locates this
artifact, starts it as a local process, checks its health, and connects Hermes to its JSON-RPC gateway.

Place a release-built KronosCode launcher or standalone binary at:

```text
agents/kronoscode/bin/kronoscode
```

KronTerm discovers the agent in this order:

1. `KRONTERM_KRONOSCODE_BIN`
2. the packaged `agents/kronoscode/bin/kronoscode` artifact
3. `agents/kronoscode/bin/kronoscode` in a development checkout
4. the current external development checkout fallback

Do not vendor a working KronosCode source tree here. It can contain environment
files, databases, generated artifacts, and unrelated applications. Package a
clean release artifact and its license instead.

## Runtime expectations

The packaged launcher must:

- start without writing interactive prompts to standard input;
- expose the gateway and health behavior expected by `emain/kronoscode-runtime.ts`;
- accept the short-lived credentials issued by the desktop runtime;
- keep user session data outside this packaging directory;
- return nonzero on startup failure so KronTerm can show repair guidance;
- shut down cleanly when the Electron main process stops it.

Use `scripts/validate-kronoscode-artifact.mjs` when preparing a release artifact. Keep source checkouts, `.env` files,
SQLite databases, logs, caches, and generated applications out of `agents/kronoscode/bin/`.

## Product boundary

Hermes provides the desktop chat and its system-agent backend. KronosCode remains a separate coding engine exposed
through ACP in that chat. The iPhone Labs client connects to a compatible host API; it does not load a bundled web chat runtime.

KronTerm Agent can delegate a coding task without switching the chat backend. It discovers the bundled specialist with
`acp_list_agents`, then calls `acp_run_agent` with `backend: "kronoscode"` and the task. KronosCode is the default backend
for that tool. Delegation attaches to the desktop's managed connection with its short-lived credentials. Local backends
receive the active tab's scoped tools; remote backends receive no desktop tools. The parent receives the answer, session
ID, and any blocked approval requests. Delegation has a bounded timeout and closes the child session after completion or failure.

The desktop starts the managed server automatically with `--port 0`, waits for its assigned address and authenticated
health check, and passes that address to ACP. Port 4096 is not required. Delegation rechecks health before using an
existing connection; a configured external server must be started by its owner.
