# Hybrid desktop validation

## Implemented

- Explicit Sandbox / Hybrid choices per computer in the agent's Computer menu.
- Hybrid combines the selected VM's desktop, terminal, files and browser with normal workspace widget, terminal, file, browser, layout and LSP tools.
- Grants remain workspace-bound; takeover and generation fences still apply.
- Hybrid scope reaches tool discovery, native execution policy, IPC state and agent instructions.
- VM-capable inherited workers receive the same reservation, generation and single-controller checks as sandbox workers.
- Native XFCE launchers focus an existing app window before launching a new process.

## Automated checks

- 64 targeted Vitest tests passed.
- Full MCP suite: 160 passed, no failures.
- TypeScript check passed.
- Targeted lint: no errors; three existing warnings in kronterm-native-tool-bridge.ts.
- Main/preload build passed.

## Adapter repair and live verification

A dedicated local app bundle at `make/stable/KronTerm.app` uses bundle ID `dev.kronterm.local` and the compiled frontend, avoiding generic Electron target collisions and renderer hot reload. It is an ad hoc signed local review build that shares compiled resources with this checkout, rather than a distributable installer. Its bootstrap pins the existing workspace/config paths. A cold relaunch was verified visibly after replacing the launch-services environment override with that bootstrap.

Verified in the live VM through the desktop adapter:

- Terminal accepted a typed printf command and rendered a sequence of 300 lines.
- Scroll input changed the visible scrollback from the end of the output to earlier rows.
- Switching Terminal -> Files -> Terminal kept a single maximized app visible and preserved Terminal's previous scrollback state.
- The Hybrid menu visibly showed its selected checkmark and the viewer showed Agent has control.
- A read-only agent smoke test reported successful tool discovery, a workspace_snapshot result, and sandbox_vm_exec output HYBRID_GUEST_ACCESS_OK. The test conversation is saved in the app.

No precise end-to-end latency or lag-free guarantee is claimed. The host disk filled during packaging; only task-created failed build outputs were removed. About 500 MB remained, so disk pressure is still a material performance limit.
