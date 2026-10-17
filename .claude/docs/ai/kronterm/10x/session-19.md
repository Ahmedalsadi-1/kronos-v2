# 10x Analysis: Hermes-First KronTerm with Aggressive Orca Feature Adoption

Session 19 | Date: 2026-09-28

## Corrected Product Architecture

KronTerm has one agent-facing experience:

```text
KronTerm
├── Hermes — primary persistent agent, chat, planning, and control experience
│   ├── KronosCode — embedded coding/workspace specialist agent
│   ├── Other ACP specialists
│   ├── Scoped KronTerm tools
│   └── Skills, browser, terminal, files, preview, and native actions
├── Workspace — tabs, widgets, Canvas, and KronTerm OS over canonical live blocks
├── Development environment — repositories, worktrees, terminals, files, editor, diffs, source control
└── Runtime services — Git, PTY, SSH, sandbox, computer use, MCP, notifications, mobile, voice
```

KronosChamber is not part of the target product. KronosCode should not appear as a second chat application, second
sidebar product, or competing workspace. It is an agent inside Hermes. Hermes delegates coding and repository work to
KronosCode, observes it, receives evidence, and remains the user-facing authority.

## Product Thesis

KronTerm should absorb a very large portion of Orca's development-environment depth while preserving its own larger
advantage: Hermes can coordinate coding, browsers, native apps, files, sandboxes, remote systems, Canvas, and KronTerm OS
inside one persistent workspace.

The target is not “Orca inside KronTerm.” It is:

> **Orca-class repository, worktree, terminal, source-control, settings, remote, and fleet operations—controlled through
> Hermes and extended across the rest of KronTerm.**

## The Primary User Loop

1. The user asks Hermes for an outcome.
2. Hermes decides whether to handle it directly or delegate coding work to KronosCode.
3. KronosCode receives an isolated repository/worktree context and bounded tools.
4. KronTerm opens the relevant terminal, editor, diff, browser, preview, or test surfaces.
5. The sidebar and activity system show every active workspace and agent.
6. The user can inspect, message, interrupt, compare, approve, or take over.
7. KronosCode returns evidence to Hermes.
8. Hermes explains the result and keeps the persistent user relationship.

## Adopt Extremely Aggressively from Orca

The following should be treated as a broad product program, not a handful of isolated features.

---

## 1. Settings System

### UI to adopt

- Dedicated full settings application rather than scattered modal controls.
- Searchable settings catalog with keywords, aliases, descriptions, and deep links.
- Left navigation with clear categories and nested sections.
- Reusable setting rows, sections, disclosures, segmented controls, number fields, searchable selects, warnings, setup
  cards, status badges, and reset-to-default actions.
- Per-setting scope indicator: Global, Repository, Workspace, Hermes Profile, Agent, or Device.
- In-context links from a feature to its exact settings section.
- Import/export and diagnostics controls.
- Experimental settings isolated from stable settings.
- Setup health indicators instead of silently failing configuration.

### Settings categories to add

#### General

- Startup behavior and workspace restoration.
- Default workspace presentation.
- Update channel and update behavior.
- Machine/device name.
- Open-in behavior and external application choices.
- Recent-item ordering and workspace sorting.
- CLI registration and shell integration.

#### Appearance

- Theme: system, dark, light, high contrast.
- Accent and semantic status colors.
- UI density and text scale.
- Sidebar position, width, visibility, and compact mode.
- Tab style and title-bar density.
- Window opacity/background treatment where supported.
- Motion intensity and reduced-motion behavior.
- Icon style and repository icon/color customization.
- Canvas/OS chrome density.

#### Terminal

- Font family, size, weight, line height, letter spacing.
- Cursor shape, blink, and thickness.
- Scrollback size and persistent scrollback.
- Shell path and shell arguments per platform.
- Working-directory behavior.
- Copy-on-select, right-click, option/meta behavior, and link handling.
- Bell, notification, and attention behavior.
- Renderer selection and performance diagnostics.
- Environment variables and startup commands.
- Import compatible Ghostty-style appearance settings where safe.

#### Editor and Files

- Editor font, size, word wrap, minimap, whitespace, rulers, and tab size.
- Autosave and format-on-save.
- Default formatter and language-specific overrides.
- File exclusions and hidden-file visibility.
- Binary/large-file behavior.
- Markdown spellcheck and rendering preferences.
- Default diff behavior and unchanged-region collapsing.

#### Git and Source Control

- Default branch prefix.
- Base-ref selection behavior.
- Compare against upstream/default branch.
- Auto-fetch interval.
- Commit-message assistance.
- Diff whitespace visibility.
- Hosted-review defaults.
- GitHub identity per repository.
- Repository hooks and trusted setup scripts.
- Worktree defaults and cleanup policy.
- Auto-rename branch from task/work.

#### Hermes

- Default profile and model.
- Direct handling versus KronosCode delegation policy.
- Approval level.
- Memory scopes.
- Default tools and connectors.
- Response style and verbosity.
- Voice and notification behavior.
- Background work policy.
- Maximum parallel specialists.
- Time, token, and cost budgets.

#### KronosCode

- Enable/disable embedded agent.
- Default model and reasoning effort.
- Default worktree policy.
- Test and verification policy.
- Auto-open terminal/editor/diff/preview behavior.
- Maximum parallel coding runs.
- Per-run time, token, and cost limits.
- Branch naming template.
- Commit and push permission policy.
- Completion evidence requirements.
- Default isolation: current checkout, worktree, sandbox, SSH, or remote runtime.

#### Agents and Skills

- Installed ACP agents and health.
- Default agent per task class.
- Agent launch arguments and environment.
- Skills installed per Hermes profile or repository.
- Skill provenance, update status, permissions, and removal.
- Agent detection and executable path overrides.
- Agent awake/hibernation policy.

#### Workspaces and Worktrees

- Creation base branch.
- Naming templates.
- Default setup commands.
- Visibility and grouping rules.
- Smart sorting policy.
- Sleep/hibernate thresholds.
- Cleanup behavior for merged, abandoned, and dirty worktrees.
- Automation-generated workspace visibility.
- Detached-head workspace visibility.
- External-worktree discovery.

#### Browser

- Homepage and search engine.
- Default zoom and user agent.
- Profiles and cookie/session management.
- Link-routing rules.
- Localhost-to-worktree labels and routing.
- SSH/remote browser routing.
- Terminal-link action.
- Computer-use enablement and privacy notice.

#### Remote and Runtime Environments

- SSH hosts and config discovery.
- Host identity and trust.
- Remote runtime updates.
- Default Windows runtime: native, WSL, or remote.
- Ephemeral VM recipes and cleanup.
- Sandbox defaults.
- Runtime access grants and revocation.
- Pairing URLs and device access.

#### Mobile

- Pair devices with QR codes.
- Connection route and relay preference.
- Notification detail level.
- Automatic fit/restore behavior.
- Device list, revoke, and last-seen status.
- Mobile control permissions.

#### Notifications and Attention

- Events: approval, blocked, failure, completion, background completion, update.
- Sound selection and per-event sounds.
- Do Not Disturb schedule.
- Quiet completions.
- Badge behavior.
- Desktop pet/HUD/menu-bar projection choices.

#### Privacy and Security

- Telemetry controls.
- Diagnostic-bundle preview and export.
- Screenshot/redaction policy.
- Transcript and retention policy.
- Secret-store health.
- Capability grants.
- Trusted repositories and setup scripts.
- Plugin/skill consent and provenance.

#### Integrations

- MCP server configuration and health.
- GitHub and Git providers.
- Linear/Jira-style task integrations.
- OAuth connectors.
- Local native applications.
- Connector permissions and revocation.

#### Automations

- Scheduled tasks.
- Trigger health.
- Overlap and retry policies.
- Runtime and budget defaults.
- Failure notification policy.
- Automation-generated workspace visibility.

#### Advanced and Developer

- Network diagnostics.
- Runtime endpoints.
- Log levels.
- DevTools.
- Feature flags.
- Session management and kill controls.
- Plugin development.
- Performance instrumentation.

### Backend required

- Typed settings registry containing key, type, default, validation, scope, stability, search metadata, and migration.
- Layered resolution: defaults → device → global → repository → workspace → Hermes profile → run override.
- One settings API for UI, CLI, Hermes tools, and tests.
- Versioned migrations and deprecated-key handling.
- Observable setting changes without requiring full application restart where possible.
- Sensitive values stored through the existing secrets boundary, never regular config.

---

## 2. Repository and Worktree Sidebar

### UI to adopt

- Repository groups with collapsible worktree cards.
- Smart sorting that prioritizes blocked, unread, completed, and actively working agents.
- Agent rows nested under each worktree.
- Status lane for working, blocked, failed, done, dirty, ahead/behind, pull request, and checks.
- Inline rename and branch metadata.
- Pin, hide, sleep, archive, reorder, group, and search.
- Drag-and-drop reordering and parent/child worktree lineage.
- Virtualized lists for large workspace fleets.
- Context menus for every relevant workspace action.
- Compact and comfortable density options.
- Kanban/board view by task status.
- Remote-host sections and badges.
- External/unregistered worktree inbox.

### Backend required

- Canonical repository/worktree registry.
- Worktree lineage and provenance.
- File watching and Git status indexing outside the renderer.
- Agent status projection by worktree.
- Smart-sort inputs with deterministic ordering.
- Sleep/hibernate and restoration semantics.
- Dirty-state-safe deletion and recoverable archival.
- External worktree discovery and registration.

---

## 3. Worktree Creation and Lifecycle

### Features to adopt

- Create from remote default branch, selected branch, tag, commit, or current working tree.
- Create multiple worktrees for the same task.
- Suggested branch/worktree names from the prompt.
- Repository-specific setup scripts with explicit trust.
- Dependency installation progress.
- Environment copy/link rules.
- Checkpoints and snapshots.
- Sleep and hibernation.
- Archive and restore.
- Safe delete with dirty/unpushed/unmerged warnings.
- Preserve abandoned work without forcing commits.
- Detect merged branches and suggest cleanup.
- Remote and SSH worktrees.
- Imported/external worktrees.
- Worktree health and repair.

### KronTerm integration

- Hermes asks KronosCode to create/manage coding workspaces.
- KronosCode receives the resulting workspace lease.
- Terminals, Files, Editor, Browser, Preview, and diff surfaces bind to the worktree identity.
- Canvas and OS show worktree task/evidence cards without creating separate copies.

---

## 4. Agent Fleet UI Inside Hermes and the Workspace

### UI to adopt

- Agent dashboard listing active, blocked, idle, failed, interrupted, and complete agents.
- Per-worktree agent rows.
- Compact status icons and elapsed time.
- Unread and unseen completion state.
- Send follow-up without navigating away.
- Interrupt, resume, retry, duplicate, handoff, and archive actions.
- Agent session search and history.
- Agent output preview on hover or selection.
- Child/subagent hierarchy.
- Compare several agent results.
- Attention-based sorting.

### Hermes-specific behavior

- Hermes remains the parent conversation.
- `/kronoscode` or automatic routing starts KronosCode within the current Hermes task.
- KronosCode output appears as a structured delegated-run card, not a second chat transcript.
- The card contains plan, progress, terminal links, files, diff, tests, evidence, cost, and final handoff.
- User messages sent to the card route to that run; general messages remain with Hermes.
- Hermes verifies and summarizes the result before declaring completion.

---

## 5. Terminal System

### UI and features to adopt

- Fast GPU/WebGL rendering with reliable fallback.
- Infinite horizontal/vertical splits.
- Persistent scrollback across restart.
- Restore terminal title, CWD, process metadata, and agent association.
- Search, command markers, links, file paths, URLs, and diagnostics links.
- Drag files into terminal.
- Context-aware copy/paste and multiline-paste warning.
- Clickable ports and localhost URLs.
- Agent status extraction without scraping fragile presentation text when structured events exist.
- Park/hibernate hidden terminals to control resource use.
- Performance handling for high-output sessions.
- IME, emoji, ligature, accessibility, and platform keyboard correctness.
- Terminal profiles and per-repository launch commands.

### Backend

- PTY ownership outside React.
- Durable terminal session metadata.
- Bounded scrollback persistence.
- Process-tree lifecycle and cleanup.
- Remote/SSH PTY parity.
- Latency and memory instrumentation.

---

## 6. Tabs, Panes, and Workspace Navigation

### UI to adopt

- Browser-style tab strip with agent/worktree identity.
- Arbitrary pane splits.
- Tab search and quick open.
- Jump palette across repositories, worktrees, agents, files, commands, and sessions.
- Reopen closed tab/pane.
- Restore complete session topology.
- Drag tabs between panes/windows.
- Tab badges for approval, blocked, failed, dirty, checks, and unseen completion.
- Keyboard cycling by recency or manual order.
- Quick switch to the worktree containing active attention.

### KronTerm advantage

- The same canonical blocks can also appear in Widgets, Canvas, and OS.
- Tabs are one presentation, not a competing session system.

---

## 7. Source Control and Review

### UI to adopt

- Changed-file tree grouped by staged/unstaged/untracked/conflict.
- Side-by-side and unified diffs.
- Collapse unchanged regions.
- Whitespace controls.
- Per-hunk stage/unstage/discard.
- Inline comments and review threads.
- AI-generated-change attribution.
- Commit, amend, push, pull/rebase, and branch controls.
- Ahead/behind and upstream state.
- Pull-request metadata, checks, review status, and open-in-provider actions.
- Compare a worktree against its base branch.
- Review all agent changes before promotion.
- Conflict-resolution workflow.

### Hermes/KronosCode integration

- KronosCode attaches changed files, diffs, diagnostics, tests, and PR/check state to the delegated-run card.
- Hermes can request fixes against specific review comments.
- Completion requires configurable evidence rather than a plain-text claim.

---

## 8. File Explorer and Editor

### UI to adopt

- Fast virtualized tree with Git decorations.
- Local and remote filesystem parity.
- Reveal active file and follow worktree context.
- Tabs, breadcrumbs, symbol outline, diagnostics, and quick open.
- Monaco editor preferences and language mappings.
- Image, Markdown, JSON, media, PDF, and artifact viewers where supported.
- Drag files into Hermes, Terminal, Browser, Canvas, or OS.
- File history and compare actions.
- Explicit save/conflict handling when agents edit concurrently.

---

## 9. Browser and Design Mode

### UI to adopt

- Browser profiles with visible profile identity.
- Persistent cookies and sessions.
- Worktree-aware localhost routing and labels.
- Inspect/select UI elements for agent tasks.
- Screenshot and DOM evidence.
- Observe, take over, and return control.
- Browser actions accessible from CLI and Hermes tools.
- Remote/SSH browser routing.
- Link routing rules between Browser, external browser, Terminal, and Editor.

### KronTerm advantage

- Browser blocks already coexist with Terminal, Preview, Canvas, native-app streams, and Hermes.
- Design mode should attach visual selections directly to the Hermes prompt and KronosCode task.

---

## 10. Command Palette and Quick Open

### Adopt

- One ranked palette for commands, worktrees, agents, files, tabs, settings, repositories, apps, and recent activity.
- Search aliases and typo tolerance.
- Scope filters.
- Recently used and attention-priority ranking.
- Preview before navigation.
- Command discoverability with shortcuts.
- Deep link directly into a settings row.
- Repository/worktree-specific commands.

This should extend KronTerm's command center rather than add another palette.

---

## 11. Remote Hosts and Runtime Environments

### UI and features to adopt

- SSH host manager using normal OpenSSH configuration.
- Host identity, connection health, reconnect, and trust status.
- Remote repositories, files, terminals, worktrees, agents, and Git operations.
- Headless runtime installation/status/update.
- Explicit local-versus-remote ownership badges.
- Remote setup diagnostics.
- WSL/native Windows runtime choice.
- Ephemeral VM recipes and cleanup.
- Remote browser routing.

### Backend

- Protocol-version negotiation.
- Host-scoped IDs to avoid collisions.
- Reconnect and state reconciliation.
- Clear execution authority: client-hosted versus remote-hosted operations.
- No assumption that credentials or processes exist locally.

---

## 12. Mobile Companion

### UI to adopt

- Pairing by QR code.
- Agent/worktree activity list.
- Notifications for blocked, failed, and complete states.
- Send follow-ups.
- Approve bounded decisions.
- View condensed diffs, tests, screenshots, and artifacts.
- Pause, interrupt, resume, and retry.
- Open terminal transcript and browser preview.

### KronTerm constraint

- Mobile remains a supervisory surface for Hermes and workspace activity.
- It must not become another agent runtime or miniature desktop UI.

---

## 13. Notifications and Attention Policy

### Adopt

- Typed attention policy rather than component-specific notifications.
- Acknowledgement state shared across sidebar, Hermes, desktop, and mobile.
- Priority ordering: approval/blocked → failure → completion → informational.
- Quiet completion rules.
- Per-event sounds.
- Deep links to exact run/worktree/surface.
- Unseen completion expiration/decay without losing semantic state.
- Do Not Disturb and scheduled quiet hours.

---

## 14. Session History and Search

### Adopt

- Search agent sessions across repositories and worktrees.
- Filter by agent, status, date, host, branch, PR, file, or task.
- Resume compatible sessions.
- Inspect provenance and runtime identity.
- Archived and sleeping session handling.
- Search result previews with matched evidence.
- Stable titles generated from work, with manual rename.

---

## 15. Automations, Artifacts, and Skills

### Adopt

- Scheduled automations bound to a repository/worktree or general workspace.
- Automation-generated workspace visibility controls.
- HTML/Markdown artifact generation and sharing.
- Skills catalog with install, update, provenance, permissions, and removal.
- CLI registration and automation access.
- Repository setup scripts with trust prompts.
- Plugin marketplace only after consent, provenance, rollback, and capability review exist.

---

## Component Strategy

Do not paste Orca's renderer wholesale. Adopt its component inventory and interaction contracts, then implement them in
KronTerm's design system and state architecture.

### Shared components KronTerm should have

- `SettingsShell`, `SettingsSidebar`, `SettingsSearch`, `SettingsSection`, `SettingRow`.
- `RepositoryGroup`, `WorktreeCard`, `AgentStatusRow`, `AttentionBadge`, `HostBadge`.
- `CreateWorktreeDialog`, `DeleteWorktreeDialog`, `ArchiveWorktreeDialog`, `RestoreWorktreeDialog`.
- `WorkspaceHealthCard`, `SetupScriptTrustDialog`, `RuntimeStatusCard`.
- `AgentRunCard`, `AgentProgress`, `AgentEvidence`, `AgentActions`, `AgentCostBadge`.
- `ChangedFilesTree`, `DiffViewer`, `ReviewComment`, `ChecksSummary`, `PullRequestBadge`.
- `TerminalPane`, `TerminalToolbar`, `SplitControl`, `PortLink`, `SessionRestoreNotice`.
- `QuickOpen`, `CommandPalette`, `SearchResultRow`, `ScopeFilter`.
- `BrowserProfilePicker`, `TakeoverControl`, `SurfaceEvidencePin`.
- `RemoteHostRow`, `PairingQrCard`, `ConnectionHealth`.
- `NotificationPolicyRow`, `DecisionInbox`, `CompletionReceipt`.

### Design rules

- Use KronTerm visual language, not Orca branding.
- Preserve canonical block identity across Tabs, Widgets, Canvas, and OS.
- Hermes owns conversational hierarchy; workspace components expose execution state.
- Every destructive or authority-expanding action shows target, scope, and recovery path.
- Every status component uses the same semantic agent-state grammar.
- Dense information should be progressively disclosed, not permanently hidden.

## What to Copy Conceptually Versus Directly

Orca is MIT-licensed, but license compatibility is not the same as good integration.

### Strong candidates for direct study or selective adaptation

- Small pure utilities and algorithms: smart sorting, worktree naming, status derivation, search ranking, visibility
  filtering, keyboard ordering, and lifecycle planning.
- Interaction tests describing edge cases.
- Settings information architecture and component contracts.
- Remote/worktree/session protocol lessons.

### Reimplement in KronTerm architecture

- Sidebar and worktree components.
- Settings renderer.
- Terminal ownership and persistence.
- Agent dashboard.
- Browser integration.
- State stores and RPC boundary.
- Mobile UI.

### Do not copy

- Orca branding, names, icons, hosted-service identity, telemetry assumptions, or product-specific account flows.
- A second top-level agent/chat system.
- Any component that would duplicate KronTerm's canonical blocks or layout modes.

## Recommended Priority

### Do Now — Design and Contracts Only

1. Confirm the Hermes → KronosCode embedded-agent contract.
2. Define a complete settings taxonomy and layered settings schema.
3. Define repository, worktree, agent-run, attention, and evidence data contracts.
4. Map every Orca feature above to existing KronTerm capability: keep, deepen, replace, or new.
5. Design the repository/worktree sidebar and delegated KronosCode run card.
6. Specify terminal persistence, worktree lifecycle, and source-control review contracts.
7. Remove KronosChamber assumptions from strategy documents and future product language.

### Phase 1 — Orca-Class Foundation

1. Searchable Settings shell and typed registry.
2. Repository/worktree sidebar with status and smart sorting.
3. Managed worktree create/archive/restore/delete lifecycle.
4. Durable terminal sessions and pane restoration.
5. Source-control tree and diff review.
6. Hermes delegated-run cards for KronosCode.
7. One attention/notification policy.

### Phase 2 — Agent Fleet

1. Several concurrent KronosCode runs.
2. Child-agent hierarchy and per-worktree rows.
3. Compare-results and evidence review.
4. Session history/search/resume.
5. Remote SSH workspaces.
6. Mobile follow-up and approval.

### Phase 3 — Full Environment

1. Browser profiles and worktree-aware routing.
2. Design mode attached to Hermes context.
3. Automations and artifacts.
4. Skill/plugin marketplace with provenance and rollback.
5. Ephemeral VMs and remote runtimes.
6. Team collaboration and hosted review integrations.

## Questions

### Answered

- **Q**: Is KronosChamber retained? **A**: No.
- **Q**: What is the only user-facing agent experience? **A**: Hermes.
- **Q**: What is KronosCode? **A**: An embedded coding/workspace agent inside Hermes.
- **Q**: How aggressively should KronTerm draw from Orca? **A**: Very aggressively across settings, repositories,
  worktrees, terminals, source control, fleet status, remote hosts, browser tooling, mobile supervision, and components.
- **Q**: Should KronTerm clone Orca's application shell wholesale? **A**: No. Absorb the capabilities into KronTerm's
  canonical blocks, four presentations, Hermes hierarchy, and design system.

### Blockers

- Before implementation, confirm whether the current repository still contains compatibility-only KronosChamber files
  scheduled for removal, or whether a cleanup is already underway elsewhere.
- Decide whether the first implementation target is Settings, worktree/sidebar foundation, or Hermes delegated-run UI.

## Next Steps

- [ ] Approve this corrected architecture.
- [ ] Choose the first implementation program: Settings, Worktrees, or Hermes/KronosCode run cards.
- [ ] Produce a file-by-file implementation plan only after approval.
- [ ] Keep product implementation paused until the user explicitly authorizes it.
