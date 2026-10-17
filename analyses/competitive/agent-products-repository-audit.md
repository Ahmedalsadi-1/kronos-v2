# Agent Product Repository Audit

Audited: 2026-09-28

Repositories:

1. [sk-ruban/notchi](https://github.com/sk-ruban/notchi)
2. [stablyai/orca](https://github.com/stablyai/orca)
3. [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot)
4. [ykushch/notchagent](https://github.com/ykushch/notchagent)
5. [CopilotKit/openmuse](https://github.com/CopilotKit/openmuse)

## Executive Summary

These projects occupy three adjacent, not identical, product categories:

| Product | Primary job | Product shape | Breadth | Maturity signal |
| --- | --- | --- | --- | --- |
| Notchi | Make Claude Code and Codex state visible and personable without returning to the terminal | Native macOS notch companion | Focused | Shipped, signed/notarized releases; active 1.2.x line |
| Orca | Run, compare, supervise, and ship work from many coding agents in parallel | Cross-platform agent development environment | Very broad | Large production-oriented codebase, desktop/mobile/remote runtimes |
| OpenMausBot | Operate a team of persistent personal/work agents as if they were contacts in a messaging app | Local-first Electron/web/server agent platform | Very broad | Early but end-to-end; frequent packaged releases |
| NotchAgent | Monitor and respond to agents managed through herdr, locally or over SSH | Native macOS notch controller and screen saver | Focused | Functional, testable, much smaller ecosystem and hard herdr dependency |
| OpenMuse | Provide an inspectable personal-agent app with durable work, browser, files, plans, and rich results | React Native/web template plus server and workers | Medium | Explicit alpha; verified demos and tests, several roadmap boundaries |

The strongest direct comparison is Notchi versus NotchAgent. Orca, OpenMausBot, and OpenMuse overlap around agent execution and supervision, but each is hired for a different job: Orca is code-production infrastructure, OpenMausBot is a multi-agent messaging environment, and OpenMuse is a customizable personal-agent application template.

## Audit Method

This audit used each repository's `main` branch, README and documentation, package/build definitions, source layout, tests, release notes, and implementation-specific files. Feature claims are classified as:

- **Implemented**: supported by source structure, tests, release notes, or concrete setup documentation.
- **Conditional**: implemented but dependent on platform, credentials, a third-party service, or another runtime.
- **Planned/partial**: explicitly described as roadmap, future work, or an adapter seam that is not wired to a deployment.

Repository size is not a quality score. It is included only as a signal of implementation surface.

## Source Snapshot

| Product | Audited commit | Tracked files | Stack | License |
| --- | --- | ---: | --- | --- |
| Notchi | `b1ebb38` | 433 | Swift/AppKit/SwiftUI, shell/Python hooks | GPL-3.0-only |
| Orca | `64569a8` | 30,527 | Electron, React, TypeScript, native helpers, mobile/relay packages | MIT |
| OpenMausBot | `e1dff93` | 2,986 | Electron, React/Vite, TypeScript server, native/computer helpers | Apache-2.0 with additional notices |
| NotchAgent | `32cd6cb` | 228 | Swift 6, AppKit/SwiftUI, POSIX sockets | Apache-2.0 |
| OpenMuse | `34b15bc` | 166 | React Native/Expo, TypeScript server/workers, CopilotKit/AG-UI | MIT |

GitHub popularity counts are volatile and intentionally not used as feature or quality evidence.

## 1. Notchi

### Product and architecture

Notchi is a macOS notch companion for Claude Code and Codex. It installs provider hooks, receives JSON over a Unix socket, parses provider events, feeds them into a state machine, and renders animated provider-specific mascots. It is not an agent runner: the coding agents continue to run in their normal terminal or desktop host.

Data flow:

`Claude Code / Codex -> managed hooks -> Unix socket -> provider parser -> session/state model -> notch UI`

### Implemented feature inventory

#### Live agent state

- Detects thinking, working/tool use, permission requests, questions, compaction, errors, aborts, completion, and session lifecycle events.
- Tracks multiple concurrent Claude Code and Codex sessions.
- Gives each session a provider-specific mascot and state animation.
- Shows the current turn duration and provider/permission mode.
- Keeps recent session context, titles, prompt previews, and activity history in the expanded panel.
- Opens the hosting terminal application or Codex desktop thread when the user jumps back to a session.
- Understands sessions hosted by T3 Code and remembers the originating app.

#### Interaction and control

- Answers Claude `AskUserQuestion` prompts from the notch, including grouped choices and free text.
- Approves or denies supported Claude permission requests inline.
- Displays Codex prompts when the integration cannot safely submit a reply.
- Supports keyboard selection and Escape cancellation for pending questions.
- Lets users enable, disable, install, and uninstall provider hooks independently.
- Detects whether recent Codex versions registered, enabled, and trusted Notchi hooks; provides setup commands when approval is missing.

#### Usage and cost visibility

- Shows Claude and Codex quotas and rate-limit windows.
- Can display session or weekly quota in the compact bar.
- Combines Claude and Codex cost history in an All view.
- Reads and incrementally processes local session/transcript information.
- Prices model usage using models.dev data and reprices cached history when rates change.
- Shows daily charts, provider/model breakdowns, extra-usage limits, stale/error states, and account changes.
- Links sessions to their Git branch and detects an open GitHub pull request after push/creation.

#### Mascot and notch experience

- Claude and Codex sprite families with idle, working, waiting, compacting, sleeping, error, and emotional states.
- Optional prompt-sentiment analysis through Anthropic, OpenAI, or a compatible custom API endpoint.
- Emotional states include happy, elated, sad, neutral, and sob.
- Grass, water, and ground terrains, plus automatic terrain cycling.
- Optional grass/island hiding, idle sprite hiding, panel sizing, expand-on-hover, opacity, animation speed, and screen placement.
- Prompt bubbles support inline Markdown, attached-image previews, and file-mention chips.
- Reduce Motion handling, haptics, hover behavior, sprite mirroring, and transition polish.

#### Sound, localization, and distribution

- Event sounds, custom sound import and preview, and automatic muting while the terminal is focused.
- English, Japanese, Korean, Vietnamese, Simplified Chinese, and Traditional Chinese localization.
- Sparkle auto-update path with signed release notes.
- Signed/notarized macOS distribution and DMG installation.

### Requirements and constraints

- macOS 15+ and a MacBook with a physical notch.
- Claude Code and/or Codex must already be installed.
- Sentiment analysis sends prompt content to the configured model provider and requires a key; the core status integration does not require it.
- License is GPL-3.0-only, which matters if code reuse is contemplated.
- It observes and controls supported agent prompts but does not orchestrate worktrees, launch agent fleets, or provide a general terminal/IDE.

### Distinctive strength

Notchi has the richest visual personality, provider-specific activity parsing, and usage/cost presentation of the two notch products. Its interaction surface is useful but deliberately secondary to the running coding-agent host.

## 2. Orca

### Product and architecture

Orca describes itself as an Agent Development Environment for supervising a fleet of coding agents. It combines an Electron desktop client, native terminal/runtime helpers, a mobile companion, a cloud relay, remote/SSH execution, a browser, source control, editor/viewers, and a substantial CLI/RPC surface.

The organizing model is repository -> worktree -> agent session -> tabs/panes/terminal, with desktop, web/mobile, and remote runtimes sharing state through explicit protocols.

### Implemented feature inventory

#### Parallel agents and worktrees

- Creates isolated Git worktrees for parallel tasks.
- Fans the same prompt across multiple agents and lets users compare results.
- Starts agents in local, remote, and SSH-backed worktrees.
- Tracks sessions, status, unread/attention state, history, provenance, and restored terminal output.
- Supports checkpoints, handoff/orchestration workflows, session search, quick open, hibernation, and resume behavior.
- Supports folder contexts and repositories outside the simplest local-worktree flow.

#### Agent compatibility

- First-class documentation/integration for Claude Code, Codex, OpenCode, Pi, Cursor CLI, GLM Agent, and many additional CLI agents.
- Advertises compatibility with any CLI agent through generic terminal execution.
- Provider-specific support includes Claude hooks/memory, Codex hot-swap, usage tracking, native chat, and transcript/session-history recovery.
- Bundles/shareable agent skills and has security boundaries and install contracts for skill packages.

#### Terminal and workspace shell

- GPU/WebGL terminal rendering with persistent scrollback.
- Arbitrary pane splitting and tab/pane/session restoration.
- Terminal links, drag/drop, rich clipboard handling, IME/platform keyboard behavior, and agent-aware status detection.
- Extensive performance gates for typing latency, high-output terminals, hidden/restored TUIs, scale, idle CPU, and renderer hot paths.
- Desktop support for macOS, Windows, and Linux, including native helpers and platform-specific packaging.

#### Editing, files, and artifacts

- File explorer and Monaco-based code editing.
- Markdown rendering/editing and viewers for supported artifact types.
- Opens files, diffs, and artifacts directly from agent sessions.
- Drag-and-drop files into an agent context.
- Creates and shares HTML/Markdown artifacts through CLI/runtime APIs.

#### Git and code review

- Source-control status, commit, push, branch/worktree management, and diff viewing.
- Annotates AI diffs with review comments.
- Tracks attribution and supports review workflows before accepting agent changes.
- Integrates with GitHub, Linear, Jira, and task-provider identity mappings.
- Handles large repositories, unusual Git layouts, remote repositories, and malformed worktree recovery cases.

#### Browser and design mode

- Embedded browser with profiles and agent/browser automation.
- Design mode for visually selecting and changing web interfaces.
- Browser control is exposed through the Orca CLI for scripted or agent-driven operation.
- Computer-use/native helpers exist for supported desktop operations, with smoke and end-to-end coverage.

#### Remote execution

- SSH hosts and remote worktrees, including reconnect/recovery behavior.
- Headless Linux server runtime (`orcad`) and nested/remote runtime paths.
- SSH-aware filesystem, terminal, browser, credentials, host-key, and compatibility boundaries.
- Remote agent configuration and session authority are treated as explicit protocol concerns.

#### Mobile companion and notifications

- iOS and Android companion clients.
- Monitors agent progress and sends completion/attention notifications.
- Sends follow-up prompts and controls sessions away from the desktop.
- Uses an included relay service with deployment, regional placement, reconnect, push gateway, database, and incident-operation documentation.

#### Orca CLI and automation

- CLI for worktrees, terminals, files, diffs, browser automation, artifacts, agent skills, and Orca-native tools.
- Scheduled automations.
- Worktree checkpoints and orchestration commands.
- CLI can be registered from desktop settings; Linux uses `orca-ide` to avoid the GNOME Orca name collision.
- Exposes a typed RPC surface and includes catalog/contract verification.

#### Operational quality

- Large Vitest and Playwright suites covering unit, Electron, remote/SSH, source control, terminal rendering, performance, Windows, web/mobile, and recovery behavior.
- Localization catalogs and translated READMEs.
- Telemetry/privacy documentation and opt-out behavior.
- Cross-platform signing/build paths and release packaging.

### Requirements and constraints

- Desktop builds target macOS, Windows, and Linux; platform details and native helpers differ.
- Mobile supervision depends on the relay path.
- Agent quality and authentication remain dependent on installed third-party agent CLIs and the user's subscriptions.
- Its very broad scope creates more operational complexity than the focused notch utilities.
- MIT licensing is permissive, but product names, hosted services, and bundled third-party components still require separate review.

### Distinctive strength

Orca is the most complete coding-agent operations environment in this set. Its differentiator is not merely launching agents; it unifies isolation, terminal persistence, code review, source control, remote execution, browser work, mobile supervision, CLI automation, and recovery around parallel coding sessions.

## 3. OpenMausBot

### Product and architecture

OpenMausBot turns agents into persistent contacts in a messaging-style interface. A local harness on `127.0.0.1` owns provider processes and normalizes their protocols into canonical events delivered over HTTP/SSE. The app is a client of that harness rather than an owner of provider transports.

Its principal abstraction is bot -> channel/thread -> model/engine -> tools/computer/apps, with optional routines and team templates layered above it.

### Implemented feature inventory

#### Bots, chats, channels, and teams

- Creates multiple named bots with instructions, profile/avatar, model, engine, computer, apps, voice, and per-thread memory.
- Messaging-app operations: pin, unread state, edit, duplicate, hide, delete, and copy conversation IDs.
- Channels provide separate transcripts, shared instructions, working folders, responder rules, and bot rosters.
- Supports individual threads, multi-bot contexts, Chief-of-Staff/team patterns, task assignment, and asynchronous handoffs.
- Imports complete teams from portable Markdown/YAML packages.
- Exports teams, bots, channels, routines, playbooks, starter notes, and connector slots while excluding credentials, conversations, permissions, and computer access.
- Organization library and preset-bot flows support controlled distribution.

#### Models and agent engines

- Runs Claude, Codex, and Grok CLIs using the user's existing local installations/logins.
- Provider/model picker with availability explanations and mid-conversation model switching.
- Custom engine paths allow wrappers or versioned CLI builds.
- ACP and native provider protocols are normalized by driver adapters.
- Optional backup-model recovery and process/session continuity mechanisms exist in the release line.

#### Approvals and execution safety

- Inline approval cards for shell commands, file changes, and agent questions.
- Permission broker centralizes allow/deny and response flow across local and remote computer contexts.
- Multiple approval levels/presets, including safer Ask defaults for imported bots.
- Unavailable or unknown drivers fail closed/degrade to unavailable rather than crashing the fleet.
- External MCP control intentionally excludes approval grants, deletion, credentials, arbitrary settings, and computer lifecycle.

#### Computer use

- Cloud Linux desktops through Boat, with live preview and browser takeover.
- Isolated local VM option.
- Host-computer control on macOS and opt-in Ubuntu Xorg where the boundary is certified.
- Ubuntu Wayland host control is disabled; preview, cloud, and local VM remain available.
- Screenshots and computer activity can be folded into transcripts.
- Packaged computer-use runtimes include provenance, hashes, allowlists, third-party notices, and an SBOM-oriented inventory.

#### Connected applications and tools

- Composio marketplace for Gmail, Slack, GitHub, Notion, Linear, and hundreds of other app actions.
- User-added MCP servers with no application code changes.
- Skills and portable playbooks attached to bots/teams.
- Stdio MCP control plane for external clients to inspect, create, configure, message, wait, search transcripts, change models, and interrupt work.

#### Routines, triggers, and proactivity

- One-time, weekday, and interval schedules from five to 1,440 minutes.
- Schedules stay aligned to their start time and skip overlapping occurrences.
- Optional execution limits for stuck work.
- Webhook triggers use a separate localhost receiver with per-trigger secrets and a deliberately narrow route surface.
- Routines share the task executor and produce calendar/receipt data.

#### Voice and multimodal experience

- Text-to-speech using ElevenLabs, Fish Audio, xAI/Grok, built-in macOS voices, or a local Chatterbox server.
- Per-bot voices and automatic read-aloud.
- macOS call mode with on-device dictation, spoken progress, and spoken approval requests.
- Composer microphone uses native Apple speech recognition on macOS.
- Streaming responses, tool-activity chips, screenshots, and mascot/cursor expressions.

#### Secrets, persistence, and deployment

- Local-first state under `~/.openmausbot` for transcripts, credentials, configuration, and canonical NDJSON events.
- Secrets are write-only from the renderer perspective; UI receives configured/not-configured flags.
- Electron desktop builds for Apple silicon/Intel macOS, Windows x64, and Ubuntu 24.04 x64.
- Browser/server operation through Node 24+, plus Docker/Podman/VPS deployment guides.
- Desktop-to-desktop companion mode over Tailscale.
- Android and iOS companion code exists; hosted/mobile connectivity is still described as developing.
- Organization/control-plane and cloud broker packages exist alongside the local product.

### Conditional and incomplete areas

- Boat computers, Composio connectors, and hosted voices require third-party accounts/keys and may incur costs.
- Calls and native dictation are macOS-only at the audited point.
- Ubuntu support is beta; Wayland host control is intentionally disabled.
- Windows installer is not yet code-signed according to the README snapshot.
- Always-on hosted webhook delivery and some hosted/mobile flows remain under development.
- The project says “early but real”: core message -> agent -> streamed tools -> approval -> computer-use works, but breadth exceeds polish.

### Distinctive strength

OpenMausBot has the broadest multi-agent “team in a chat app” model. Team packaging, channels, personalities, computers, app connectors, voice, routines, and MCP control make it closer to an open agent operating environment than a coding IDE.

## 4. NotchAgent

### Product and architecture

NotchAgent is a native macOS supervisory surface for sessions exposed by `herdr`. A reusable `HerdrClient` library handles Unix sockets, models, state reconciliation, prompt classification, response planning, actions, SSH tunnels, and terminal activation. The same core powers the notch UI, a headless `notchctl` CLI, and a privacy-safe screen saver.

### Implemented feature inventory

#### Ambient status and attention

- Minimal color-coded line under the notch.
- State model: working, blocked, done/unseen, and idle.
- Line width communicates contributing agent count up to five.
- Optional persistent agent count and hover reveal.
- Configurable decay behavior: blocked pulse, temporary done emphasis, narrowed/dimmed idle state.
- Opens the relevant interaction when a session becomes blocked.

#### Fleet overview

- Aggregates every discovered herdr session.
- Displays status, prompt, elapsed time, pane activity, and a direct jump to the terminal pane.
- Maintains a session registry and reconciled snapshot store.
- Completion summaries and unread/done behavior.
- Notifications and sounds for attention-worthy state changes.

#### Questions, approvals, and agent modes

- Classifies terminal prompts into supported questions/approvals and fallback cases.
- Presents explicit action buttons where confidence is sufficient.
- Preserves terminal fallback for ambiguous or unsupported prompts.
- Supports approve, deny, reply, navigation, and interrupt actions when the provider/session exposes them.
- Shows and cycles Claude and Codex interaction modes from the focused panel.
- Includes Claude Auto mode when the runtime reports it.
- Has an OpenCode-native provider path.

#### Local and remote operation

- Connects to local herdr sockets.
- Tracks remote herdr sessions through SSH.
- Uses normal OpenSSH configuration, including aliases, identities, jump hosts, and `ProxyCommand`.
- Manages SSH tunneling and remote command execution through the client layer.
- Activates/focuses the correct terminal pane for a session.

#### macOS integration

- Accessory app with no Dock icon and a non-activating, always-on-top panel.
- Multiple display placement options.
- Global hotkeys, sound settings, Do Not Disturb, and launch at login.
- Optional Accessibility permission only for global agent action shortcuts.
- Menu bar controls and settings UI.
- Daily update check that advises the Homebrew/manual upgrade path but does not self-update.

#### Screen saver

- Installable macOS screen saver plus direct full-screen `screensave` mode.
- Classic, Aurora Observatory, and Current Wallpaper visual styles.
- Shows agent status without prompt bodies, terminal output, or response controls.
- Runs across displays and exits on normal user input.
- Caches static wallpaper imagery rather than reproducing animated wallpapers.

#### Headless and diagnostic tooling

- `notchctl list`: sessions plus rollup state.
- `notchctl watch`: status streaming and block classification.
- `notchctl read`: classified prompt for a pane.
- JSON evidence and proposed response plans.
- Offline fixture inspection for classifier/action development.
- Swift-testing suites over recorded fixtures and UI/core units.

### Requirements and constraints

- macOS 14+ on Apple silicon.
- Requires Swift 6.2/Xcode 16+ to build.
- Requires herdr to be installed and running with a terminal client attached.
- Remote use requires non-interactive SSH access.
- Release bundles are ad-hoc signed, not notarized, so Gatekeeper and Accessibility re-approval can create friction.
- Uses only Apple frameworks plus POSIX sockets at runtime; there are no third-party Swift package dependencies.

### Distinctive strength

NotchAgent is the more operational and privacy-conservative notch controller. Its strongest ideas are confidence-gated action handling, one core shared by UI/CLI/screen saver, remote host visibility, and a lock-screen-safe status board.

## 5. OpenMuse

### Product and architecture

OpenMuse is an alpha personal-agent application and developer template built with CopilotKit React Native and AG-UI. It includes a mobile/web client, API server, durable task worker, browser worker, optional Linux computer, shared domain packages, integration adapters, and tests.

The product emphasizes visible, resumable work: chat creates durable tasks and plans; workers execute browser/terminal/document operations; the app shows structured results and allows takeover or review.

### Implemented feature inventory

#### Chat and rich results

- Headless CopilotKit chat with streamed AG-UI events.
- Stable main conversation and side chats.
- Send/stop control in one composer; stopping preserves drafts.
- Visible follow-up queue with held/resumable messages.
- Delegated tasks.
- Inline email, browser, PDF, plan, finance, approval, and task/result cards.
- Thread renaming, archiving, restoration, persistence, and replay through CopilotKit Rich Threads.

#### Durable tasks and activity

- Plans, steps, progress, receipts, and input requests.
- Pause, resume, cancel, retry, and approval states.
- SQL-backed leases recover interrupted worker execution.
- Durable notifications and background-update preferences.
- Terminal reviewed actions remain terminal when history is replayed.

#### Agent computer

- Persistent Chromium profiles.
- Browser navigation/content extraction and an inline live result surface.
- Take Control opens the same browser session for the user.
- Optional isolated non-root Linux workspace.
- Command execution with saved command receipts.
- Bounded filesystem helper and editable workspace files.
- PDF transfer between the computer and application.

#### Ideas, goals, and monitoring

- Suggested ideas carry source evidence.
- Users can edit, accept, or dismiss suggestions.
- Completed work and already-sent replies are excluded from repeated suggestions.
- Goals and milestones.
- Recurring public-page checks for page changes, text availability, and USD price thresholds.
- Deduplicated alerts and failure backoff.

#### Documents and email

- Local/sample mailbox plus Google mail adapters.
- Full email thread reading, drafts, attachments, and mailbox search.
- Permission-slip workflow: attachment -> PDF -> requested field values -> filled copy -> reviewed reply -> receipt.
- Native/web PDF viewing, paging, zoom, supported form fields, and sharing.

#### Gmail and Calendar

- Google OAuth integration adapters.
- Mail threads, drafts, attachments, and search/read flows.
- Calendar discovery.
- Reviewed event creation, update, and deletion.
- Live Google credentials are required for real account operation.

#### Finance and personal context

- Imports a transaction CSV.
- Produces category summaries and transaction views.
- Creates a savings-goal action.
- Editable name, tone, avatar, and memories.
- Durable in-app notifications and background behavior settings.

#### Platforms and development

- iOS, Android, and web client from the React Native/Expo application.
- TypeScript server and worker processes.
- Configurable OpenAI, Anthropic, or Google model provider through CopilotKit.
- AI Mock mode runs repeatable demos without a live model while retaining real tool flows.
- Browser and Linux-container verification in CI/test commands.
- Server-only provider/project keys.

### Conditional, partial, and roadmap areas

- OpenMuse explicitly labels itself alpha and a template for self-hosting/building.
- CopilotKit Rich Threads require a CopilotKit Intelligence project key.
- Open-ended live reasoning and Google account flows require separate credentials/configuration.
- Graphical Linux desktops and autonomous checkout are future work.
- OpenBot compatibility is a disabled, contract-tested adapter seam; live identity/session bridging and computer wiring are not complete.
- Health, banking, social connectors, device push, voice, generated executable tools, and automatic reservations/payments are roadmap items.
- Native PDF support needs an Expo development build.

### Distinctive strength

OpenMuse has the clearest reference architecture for a consumer-facing, cross-platform personal agent with durable tasks and structured result cards. It is also the most candid about the line between reproducible sample flows and production-ready general autonomy.

## Canonical Feature Comparison

Legend: **Deep** = core, broad implementation; **Yes** = implemented; **Partial** = limited or conditional; **No** = outside current product; **External** = delegated to another required runtime.

| Capability | Notchi | Orca | OpenMausBot | NotchAgent | OpenMuse |
| --- | --- | --- | --- | --- | --- |
| Primary coding-agent supervision | Yes | Deep | Yes | Yes | Partial |
| Runs agent processes itself | External | Deep | Deep | External (herdr) | Deep |
| Multiple concurrent agents | Yes | Deep | Deep | Yes | Yes |
| Isolated Git worktrees | No | Deep | Partial/working folders | No | No |
| Persistent terminal | No | Deep | Computer/agent terminal | No | Yes, optional Linux |
| Code editor/file explorer | No | Deep | Partial | No | Workspace files |
| Git diff/review/commit/push | PR link only | Deep | Agent-dependent | No | No |
| Browser automation/takeover | No | Deep | Via computers | No | Deep |
| Host computer control | No | Yes | Conditional | Terminal focus/actions | No |
| Remote/SSH agent sessions | No | Deep | Companion/host paths | Yes | Worker deployment |
| Mobile client | No | Yes | Partial/companion | No | Yes |
| Inline approvals/questions | Yes | Yes | Deep | Yes | Yes |
| Scheduled/recurring work | No | Yes | Deep | No | Yes |
| Webhook triggers | No | Automation-dependent | Yes | No | No |
| App/service connectors | No | GitHub/Linear/Jira/etc. | Deep via Composio/MCP | No | Google + adapters |
| Voice/dictation | Sounds only | Notifications | Deep, macOS calls | Sounds only | Planned |
| Agent usage/cost dashboard | Deep | Yes | Model availability/config | No | No |
| Notch-native UI | Deep | No | No | Deep | No |
| Screen saver status | No | No | No | Yes | No |
| Team templates/sharing | No | Skills/artifacts | Deep | No | Template repository |
| CLI/API control plane | Hook scripts | Deep CLI/RPC | MCP + HTTP/SSE | `notchctl` | Server APIs |
| Cross-platform desktop | macOS only | macOS/Windows/Linux | macOS/Windows/Linux | macOS only | Web/mobile; server |
| Local-first core | Yes | Yes | Yes | Yes | Self-hosted |

## Jobs-to-be-Done and Likely Users

| Behavioral persona | Job | Best fit | Why |
| --- | --- | --- | --- |
| Solo coding-agent user | Know when Claude/Codex needs attention without watching a terminal | Notchi | Rich provider state, playful visibility, usage/cost views |
| Agent operator using herdr across machines | Monitor, classify, and answer blocked agents from a restrained native surface | NotchAgent | SSH, confidence-gated actions, CLI and screen saver |
| Parallel software builder/team | Run many coding agents safely across worktrees and review/ship results | Orca | Deep worktree, terminal, Git, review, remote, and mobile workflows |
| Power user assembling an AI staff | Maintain specialized bots with apps, computers, schedules, voices, and shared channels | OpenMausBot | Persistent bot/team abstraction and broad integrations |
| Product team building a personal-agent app | Start from a transparent cross-platform application with durable tasks and structured outputs | OpenMuse | Small inspectable template, CopilotKit/AG-UI, mobile/web, verified workflows |

## Strategic Classification for KronTerm

This section identifies ideas worth learning from, not a recommendation to copy code or expand scope indiscriminately.

### Must match or preserve

- **Agent attention clarity:** Notchi and NotchAgent make working/blocked/done/idle legible at a glance. KronTerm's activity overlays and Hermes/KronosChamber should retain equally clear state semantics.
- **Durable supervision:** Orca's persistent session state, scrollback, restore, and mobile follow-up establish a high bar for long-running coding work.
- **Explicit approvals:** OpenMausBot, NotchAgent, and OpenMuse all treat risky actions and questions as durable structured interactions, not transient chat text.
- **Visible evidence:** Orca diffs/artifacts, OpenMausBot screenshots/receipts, and OpenMuse structured result cards all make agent work inspectable.

### Strong opportunities

- **Ambient agent surface:** A restrained KronTerm OS/notch/menu-bar companion could reuse KronosCode's existing typed activity model without adopting another agent runtime.
- **Fleet rollup semantics:** NotchAgent's count-weighted state signal and privacy-safe lock-screen projection are strong models for an optional status-only surface.
- **Usage and cost intelligence:** Notchi's provider-aware quota/cost views are unusually polished and could complement KronTerm's agent overlays.
- **Portable agent teams:** OpenMausBot's secret-free Markdown team packages are a compelling distribution model for KronosCode skills, agent profiles, routines, and workspace templates.
- **Structured durable work cards:** OpenMuse's plan/progress/input/receipt lifecycle maps naturally to KronosChamber task and evidence graphs.
- **Mobile supervisory control:** Orca demonstrates the value of notify -> inspect -> follow up, while keeping full desktop work on the host.

### Avoid conflating

- A notch indicator is not a replacement for an agent runtime or ADE.
- A chat roster is not automatically a safe multi-agent orchestrator.
- A large connector count does not prove depth or reliability for each connector.
- Demoed personal-agent workflows do not imply general autonomous capability.
- Supporting “any CLI agent” at the process level does not imply deep semantic support for every agent.

## Build, Partner, or Borrow the Pattern

| Capability | Suggested posture for KronTerm | Rationale |
| --- | --- | --- |
| Activity state, approvals, task/evidence graph | Build/core | Already central to KronosCode and differentiates the workspace |
| Ambient notch/menu-bar/status projection | Build a thin client | Can consume existing typed activity rather than introduce a second runtime |
| Provider quota/cost adapters | Build adapters or partner on data | Valuable UX; provider APIs and transcript formats change frequently |
| Git worktree/session durability | Build/core | Core to trustworthy coding-agent operations |
| Generic app connectors | Partner/MCP | Commodity breadth is expensive; preserve clear approval and identity boundaries |
| Team/template exchange format | Build an open portable schema | High leverage and product-specific semantics |
| Hosted relay/push | Partner or isolate as infrastructure | Operationally heavy and not a core desktop differentiator |
| Voice providers | Partner behind a provider boundary | Voice generation is commodity; interaction and approval UX are differentiating |

## Risks and Caveats

- This is a source audit, not a hands-on acceptance test of every packaged binary, external service, account flow, or platform combination.
- Repository documentation can overstate runtime completeness; this report gives lower confidence to claims without supporting source/tests or with explicit roadmap language.
- Orca and OpenMausBot are changing rapidly. Their audited commits should be used when revisiting specific behavior.
- External dependencies materially affect product behavior: agent CLIs, herdr, CopilotKit Intelligence, Boat, Composio, model providers, SSH configuration, and platform permissions.
- Code reuse requires license review. Notchi is GPL-3.0-only; the others use permissive licenses but include third-party code/assets and service-specific terms.

## Analysis State and Next Reassessment

- Starting state: **CPA2 — Features Without Taxonomy**.
- Current state: **CPA5 — Features Unmapped**, improved to a canonical taxonomy and preliminary behavioral-persona mapping. True buyer/user validation and observed switching evidence are still absent.
- Reassess when any project announces a major architecture change, new mobile/remote runtime, new general-computer boundary, or production/stable milestone.
- For implementation planning, the next useful step is a focused gap analysis against KronTerm's existing activity model, KronosChamber, worktree/runtime layer, mobile Labs client, and KronTerm OS surfaces.
