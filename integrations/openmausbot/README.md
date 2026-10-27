# OpenMausBot source integration

Upstream: https://github.com/milind-soni/OpenMausBot.git
Pinned commit: `1123705e6e70741e3e8b92925266d0604257b9a7`.

The `upstream/` directory contains actual upstream files, not reimplementations.
`upstream-source.json` records each imported file's SHA-256 before integration patches.
Apache-2.0 LICENSE, NOTICE, LICENSING and bundled third-party notices are retained.
The separately licensed `enterprise/` tree is excluded. KronTerm uses its own product
name and COUCOU companion rather than the OpenMausBot mascot.

Selected scope: bot profiles and creation, avatar customization, defaults/presets,
channel creation/configuration, messaging, durable individual-bot pause/resume,
engines/models, computers and live views, approvals/questions, connected apps,
custom MCP servers, skills/tools and persistent memory.

The integration retains the upstream store, HTTP/SSE server, drivers, permission
broker and persistence. KronTerm adapters provide the managed process lifecycle,
trusted desktop access, workspace mapping, KronosCode ACP default and COUCOU rendering.
Runtime state is separate from the user's standalone OpenMausBot data.

Build with `npm run build:agents`; audit original file hashes with
`npm run check:agent-source`. Development and production builds run the source
build automatically when integration inputs change.

The workspace setup embeds the original `NewRoomPanel` and `NewBotDialog`.
Saved groups open the original application, including its messaging and settings.
The default avatar uses COUCOU with small cat ears; explicit upstream body choices
continue to use the original avatar renderer.

Validation: the original Vite/server builds and frontend typecheck pass; 95
upstream tests cover defaults, presets, holds, memory, MCP configuration and
request authentication. KronTerm integration tests cover workspace mapping and
request credentials. An isolated Electron smoke test verifies the real managed
backend, rendered embedded creation form, authenticated iframe requests and
scoped frame policy. External OAuth services, cloud computers and host-control
runtimes require their normal installation/configuration and were not exercised
against live accounts. Markdown verification documentation was copied separately
for local development; the checksum manifest covers the imported application.

Bot desktops are provisioned by `emain/agent-bot-workspaces.ts` and the private
`agent-bot-desktop-bridge.ts`. Saved bot IDs map to workspace metadata
`agent:botid`; each desktop has persistent Terminal, Files and Browser blocks.
Provisioning repairs interrupted widget creation and reuses existing block IDs.
The original messaging UI adds a desktop link for the selected bot/group.
The KronosCode custom ACP adapter prepares the bot desktop before each turn and
attaches its authenticated MCP tools to that workspace/tab. Explicit tool
selection still applies. Other upstream engines retain their original behavior.
These are separate KronTerm desktops on the host; this does not provision a
separate VM or claim filesystem isolation for each bot.

The ACP core is now the eighth adapted upstream file. Its integration calls the
KronTerm-owned server adapter; all other imported driver code remains original.
