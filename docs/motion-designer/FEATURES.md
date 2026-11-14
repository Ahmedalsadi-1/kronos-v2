# KronTerm feature reference

Reviewed against the shared source snapshot on 2026-11-02. This is a source-backed production guide, not a release certification. Private-beta development means present on this branch; it does not mean generally available or verified in every installation.

## Four workspace presentations

**Status:** Private-beta development

Tiled widgets, focused tabs, a spatial canvas, and the KronTerm OS desktop use shared blocks.

**Show:** Show the same task moving between layouts.

**Source:** `frontend/app/tab/`; `frontend/app/workspace/kronarchy-shell.tsx`

## KronTerm OS shell

**Status:** Private-beta development

Desktop windows, dock, overview, app switching, native app launches, and typed OS actions.

**Show:** Overview to focused window to dock; use current UI footage.

**Source:** `frontend/app/workspace/kronarchy-shell.tsx`; `frontend/app/tab/os-workspace.tsx`

## Spatial canvas

**Status:** Private-beta development

Live widgets, notes, shapes, connectors, pan and zoom.

**Show:** Follow a browser, terminal and note on one canvas.

**Source:** `frontend/app/tab/workspace-canvas.tsx`

## Terminal and connected shell

**Status:** Private-beta development

PTY sessions, shell integration, readable scrollback and connected shell dock.

**Show:** A real command and its result beside the related task.

**Source:** `frontend/app/view/term/`

## Embedded browser

**Status:** Private-beta development

Chromium pages, navigation, loading feedback and agent browser interaction.

**Show:** Real navigation with visible action and result.

**Source:** `frontend/app/view/webview/`

## Files, editor and preview

**Status:** Private-beta development

Grouped files, drag-to-canvas, Monaco editing and document/media previews.

**Show:** File selection, readable edit, and preview.

**Source:** `frontend/app/workspace/native-file-workbench.tsx`; `frontend/app/lsp/`

## KronTerm Agent / Hermes

**Status:** Private-beta development

Chat, sessions, profiles, model controls, tools, slash commands and working indicators.

**Show:** Connect a prompt to the surface where work occurs.

**Source:** `frontend/hermes/`; `frontend/app/view/hermes/`

## KronosCode execution engine

**Status:** Private-beta development

Agent execution, workspace context and tools behind the product interface.

**Show:** Use this name for the engine; KronTerm for the product.

**Source:** `agents/kronoscode/`; `emain/kronoscode-runtime.ts`

## Compact HUD and side chat

**Status:** Private-beta development

Movable chat/composer presentation and activity overlays.

**Show:** Chat stays reachable while widgets remain visible.

**Source:** `frontend/hermes/app/hud/`; `frontend/hermes/app/chat/composer/position.tsx`

## Context and evidence

**Status:** Private-beta development

Selected widgets and task cards can provide focus and quoted evidence.

**Show:** Selection to prompt to inspected result.

**Source:** `frontend/app/tab/`; `frontend/types/agent-activity.ts`

## Task and evidence graphs

**Status:** Private-beta development

Requests, actions, decisions, approvals and outputs connected on the workspace.

**Show:** Trace one request to its evidence.

**Source:** `frontend/app/tab/`; `frontend/app/view/use-agent-overlays.ts`

## Subagents and delegation

**Status:** Development integration

Delegation settings, default/model/profile routes and live subagent surfaces. Requires configured runtimes and providers.

**Show:** Parallel agents with readable identities and visible results.

**Source:** `frontend/hermes/app/agents/subagent-theater.tsx`; `frontend/hermes/app/settings/delegation-settings.tsx`; `agents/hermes/plugins/advanced-delegation/README.md`

## Computer widget

**Status:** Development integration

Computer setup, per-profile bindings, live viewer, fullscreen, reconnect and screenshots.

**Show:** Setup to live computer to fullscreen.

**Source:** `frontend/hermes/computer/upstream/README.md`; `output/hermes-computer/`

## Managed desktops and providers

**Status:** Development integration

Managed computer widgets, provider selection, VNC transport and per-widget connections.

**Show:** Two computer widgets with distinct visible tasks.

**Source:** `emain/computer-plugins/README.md`; `frontend/app/view/linux-vms/`

## Device farms and batches

**Status:** Development integration

Runtime and batch execution support with multi-computer workspace views.

**Show:** Use actual recorded devices; do not invent fleet capacity claims.

**Source:** `emain/device-farm-runtime.ts`; `emain/device-farm-batches.ts`; `output/device-workspace/`

## Computer grants and approvals

**Status:** Development integration

Workspace-scoped computer grants, tool routing and human review boundaries.

**Show:** Approval or human-control state followed by the permitted action.

**Source:** `emain/computer-access-policy.ts`; `output/computer-desktop/approval-review.png`

## Isolated Linux sandboxes

**Status:** Private-beta development; setup dependent

Linux desktop execution with browser, terminal and filesystem in an isolated environment.

**Show:** Show the sandbox identity and visible task.

**Source:** `pkg/sandbox/`; `frontend/app/view/sandbox/`

## Native desktop and app stream

**Status:** Private-beta development; permissions required

Native/remote application streams and permission-aware desktop actions.

**Show:** A real app action with cursor feedback and result.

**Source:** `frontend/app/view/appstream/`; `mcp-kron-term/src/computer-target-tools.ts`

## Native workflow canvas / n8n

**Status:** In development; interaction gates pending

Original workflow components integrated into the OS world, node picker, editor and executions. Runtime and prepared editor bundle required.

**Show:** Demonstrate only verified flows; label preview/development.

**Source:** `docs/os-mode/workflow-canvas-plan.md`; `integrations/n8n/README.md`; `frontend/app/tab/os-original-workflow.tsx`

## Workflow tools and nodes

**Status:** In development

Hermes Agent, KronTerm Harness, Tool and Widget nodes connect executable workflows to workspace actions.

**Show:** One node action to visible widget outcome.

**Source:** `integrations/n8n/nodes/`; `mcp-kron-term/src/n8n-tools.ts`

## Workflow account and inspector

**Status:** In development

Shared account gate, workflow navigation, Nodes inspector and execution history.

**Show:** Use dummy project data and hide all credentials.

**Source:** `frontend/app/workspace/kronterm-account-gate.tsx`; `frontend/hermes/app/workflows/`

## Control Center

**Status:** Private-beta development

Connections, host permissions, plugin grants and workspace tools.

**Show:** Open a control and show its actual state.

**Source:** `frontend/app/components/system-ui/`; `README.md`

## Changes and worktrees

**Status:** Private-beta development

Per-file changes, diffs, staging/discard controls and parallel project worktrees.

**Show:** Readable diff review and separate agent workspaces.

**Source:** `README.md`; `frontend/app/components/system-ui/`

## Scheduled automations

**Status:** Private-beta development

Saved agent prompts with schedules, run-now and pause/resume. Runtime must remain available.

**Show:** Schedule a task then show real execution activity.

**Source:** `README.md`; `frontend/app/components/system-ui/`

## Lifecycle scripts

**Status:** Private-beta development

Workspace setup, teardown and run commands with output and exit status.

**Show:** One setup or run task with visible outcome.

**Source:** `README.md`

## Activity Center

**Status:** Private-beta development

Jobs, approvals, waiting state and runtime recovery.

**Show:** A request transitions through working and review states.

**Source:** `README.md`; `frontend/types/agent-activity.ts`

## SSH and remote work

**Status:** Private-beta development

Remote terminal, file and preview surfaces with durable session behavior.

**Show:** Label remote context visibly.

**Source:** `pkg/remote/`; `README.md`

## Command palettes and settings

**Status:** Private-beta development

App/workspace commands, agent palette, themes, minimal UI and configuration.

**Show:** Show the actual shortcut hints in the captured build.

**Source:** `frontend/hermes/app/command-palette/`; `frontend/hermes/app/settings/`

## MCP, CLI and skills

**Status:** Private-beta development

External agents and scripts can use workspace tools, wsh commands and task-specific skills.

**Show:** Tool action to the same visible workspace surface.

**Source:** `mcp-kron-term/README.md`; `cmd/`; `agents/`

## Plugin platform

**Status:** In development

Manifest, capabilities, contribution declarations and consent model.

**Show:** Use settings or diagrams with development label.

**Source:** `README.md`; `frontend/app/plugins/`

## Desktop companion / Coucou

**Status:** Development; appearance varies by project

Pet and overlay surfaces; recent directed film uses a Coucou companion. Older art also includes a pixel cat.

**Show:** Choose the companion matching the current brief; keep identities consistent.

**Source:** `desktop-pet/`; `frontend/pet/`; `brag-output-2026-10-28-054553/storyboard.md`

## Voice

**Status:** Experimental; optional dependencies

Speech capture, transcription and speech output.

**Show:** Label Experimental and demonstrate only a configured working run.

**Source:** `audio-engine/`; `README.md`

## iPhone and phone control

**Status:** Labs / Experimental

Mobile client and explicitly paired phone/computer bridges.

**Show:** Keep a Labs label visible if included.

**Source:** `mobile/README.md`; `.agents/skills/kronterm-phone-control/SKILL.md`

## System information

**Status:** Private-beta development

Workspace surfaces for system monitoring.

**Show:** Use actual values without implying performance benchmarks.

**Source:** `README.md`

## Product site and existing films

**Status:** Reference material

Product imagery, visual stories, edited footage and editable video compositions.

**Show:** Use as source material; distinguish concepts from captured UI.

**Source:** `website/public/assets/`; `video/README.md`; `brag-output-2026-10-28-054553/`

## Video Studio

**Status:** Registered development surface; release/capture verification required

Video source/project and caption editing.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/videostudio/`

## Audio Studio

**Status:** Registered development surface; release/capture verification required

Audio import, local transcription engine and SRT caption import/edit/save.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/audiostudio/`

## Document Studio

**Status:** Registered development surface; release/capture verification required

Markdown report editing and source/reference handling.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/documentstudio/`

## Data Studio

**Status:** Registered development surface; release/capture verification required

Dataset loading, tabular inspection and filtering.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/datastudio/`

## Image Studio

**Status:** Registered development surface; release/capture verification required

Connect to a local ComfyUI server, import API workflow JSON and queue generation jobs.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/imagestudio/`

## Blender Project

**Status:** Registered development surface; release/capture verification required

Blender project and scene integration; requires local Blender setup.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/blenderproject/`

## Game Studio

**Status:** Registered development surface; release/capture verification required

Game project surface with a playable preview.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/gamestudio/`

## Media Library

**Status:** Registered development surface; release/capture verification required

Browse and search local media by filename and path.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/medialibrary/`

## Personal productivity

**Status:** Registered development surface; release/capture verification required

Personal workspace productivity surface.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/personal/`

## Tapflow device sessions

**Status:** Registered development surface; release/capture verification required

Device sessions, watch URL connection and bot farm task controls. Phone work remains Labs.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/tapflow/`

## Additional canvas and workflow surfaces

**Status:** Registered development surface; release/capture verification required

Registered KronosCanvas and plugin workflow-canvas surfaces coexist with the native OS integration; they are distinct source paths.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/kronoscanvas/; frontend/app/view/workflowcanvas/`

## Additional agent and bot surfaces

**Status:** Registered development surface; release/capture verification required

Registered bot and Warp-style agent interfaces; naming and availability differ from the primary KronTerm Agent.

**Show:** Inspect in the prepared build before proposing this as a hero shot.

**Source:** `frontend/app/view/bots/; frontend/app/view/warpagent/`

## Registered surface inventory

For completeness, these are the actual registrations in `frontend/app/block/block.tsx`. A registration is source evidence, not confirmation that the surface is ready to film or released. Compatibility IDs and alternate implementations remain in this list.

| Source view ID | Implementation |
| --- | --- |
| `videostudio` | `VideoStudioViewModel` |
| `audiostudio` | `AudioStudioModel` |
| `documentstudio` | `DocumentStudioModel` |
| `datastudio` | `DataStudioModel` |
| `blenderproject` | `BlenderProjectModel` |
| `medialibrary` | `MediaLibraryViewModel` |
| `imagestudio` | `ImageStudioModel` |
| `personal` | `PersonalViewModel` |
| `gamestudio` | `GameStudioModel` |
| `plugin:kronterm.openhuman-workflow/canvas` | `WorkflowCanvasModel` |
| `plugin:kronterm.tapflow/devices` | `TapflowModel` |
| `workflowcanvas` | `WorkflowCanvasModel` |
| `bots` | `BotsModel` |
| `term` | `TermViewModel` |
| `preview` | `PreviewModel` |
| `web` | `WebViewModel` |
| `waveai` | `WaveAiModel` |
| `warpagent` | `WarpAgentViewModel` |
| `workflow` | `WorkflowViewModel` |
| `cpuplot` | `SysinfoViewModel` |
| `sysinfo` | `SysinfoViewModel` |
| `vdom` | `VDomModel` |
| `tips` | `QuickTipsViewModel` |
| `help` | `HelpViewModel` |
| `launcher` | `LauncherViewModel` |
| `tsunami` | `TsunamiViewModel` |
| `aifilediff` | `AiFileDiffViewModel` |
| `waveconfig` | `WaveConfigViewModel` |
| `kronsettings` | `KronSettingsViewModel` |
| `kronoscanvas` | `KronosCanvasViewModel` |
| `hermes` | `HermesViewModel` |
| `review` | `ReviewViewModel` |
| `sandbox` | `SandboxViewModel` |
| `appstream` | `AppStreamViewModel` |
| `installedapps` | `InstalledAppsViewModel` |
| `computers` | `ComputersViewModel` |
| `linux-vms` | `LinuxVmsViewModel` |
