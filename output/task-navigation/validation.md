# Task navigation changes — 2026-11-02

- `terminal_open` reuses a local interactive shell in the owning tab by default. An explicit cwd requires an exact metadata match. Remote and command blocks are excluded. Reuse only focuses; it never types into a possibly running process. `newSurface=true` explicitly requests another session.
- Terminal opens are serialized per tab, preventing parallel calls from independently seeing an empty inventory and creating duplicates. Failed operations release the queue. Different tabs remain independent.
- CLI reuse explicitly scopes `blocks list` to the captured owning tab, handles the CLI's empty response, and skips reuse if no tab owner is known.
- HUD machine inventory retains exact VM identity and kind, allowing Computer launches to find an existing viewer even when the HUD's local block cache lacks metadata.
- Shared agent operating instructions require reuse of existing/background surfaces, a task handoff with owner/block/project/environment identities, one canonical project copy, explicit file mappings and verified transfers. These are model instructions, not an enforced widget cap or persistent synchronization service.
- `sandbox_vm_status` now includes the bound task owner, guest root, selected mode, and explicit `filesystemsShared: false`. Host project root remains unknown until the agent discovers it; no misleading inferred root is returned.

Validation: 47 focused frontend/native tests; all 163 MCP tests; TypeScript check; production build. Targeted ESLint has no errors (four existing warnings). Code review caught and fixed the CLI cross-tab lookup and empty-tab parsing cases; follow-up review found no machine-inventory regression.

Limitations: No shared mount, automatic project import, bidirectional sync, conflict resolution, or durable transfer ledger was added. Existing file/terminal and guest tools remain the transfer mechanism. Agent adherence to the handoff protocol still needs real task evaluation.

Applied the compiled main/preload/renderer to `output/computer-desktop/package-app/dist`, then reopened `make/stable/KronTerm.app` through the desktop adapter. The restored workspace rendered successfully. No live end-to-end model-driven project transfer was performed.
