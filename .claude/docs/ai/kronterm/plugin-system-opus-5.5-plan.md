# KronTerm Plugin Platform and Smart Widget Integration Plan

Prepared for: Opus 5.5 implementation agent
Date: 2026-09-28
Status: Architecture and implementation plan only; no product implementation authorized yet

## Source Reuse Decision

This plan authorizes future implementation to reuse and adapt actual upstream source code, subject to license tracking.
It is not limited to recreating behaviors from screenshots or documentation.

| Repository | License at audited revision | Source-reuse posture |
| --- | --- | --- |
| `stablyai/orca` | MIT, copyright Lovecast Inc. | Aggressive direct adaptation is allowed with retained copyright/license notices |
| `CopilotKit/openmuse` | MIT | Direct selective adaptation is allowed with retained notices |
| `milind-soni/OpenMausBot` | Apache-2.0 | Direct selective adaptation with Apache notices, modification notices, and dependency review |
| `ykushch/notchagent` | Apache-2.0 | Direct selective adaptation with Apache notices and modification tracking |
| `sk-ruban/notchi` | GPL-3.0-only | Do not merge into KronTerm core without an explicit licensing decision accepting GPL obligations |

This is an engineering plan, not legal advice. Before distribution, review all upstream `LICENSE`, `NOTICE`, asset,
font, icon, generated-code, and dependency terms—not only the repository-level license.

### Mandatory provenance for reused code

- Add `THIRD_PARTY_NOTICES.md` entries with repository URL, audited commit, license, copyright, paths used, and material
  modifications.
- Preserve required copyright and license text in substantial copied files or the distribution's notices.
- Mark adapted files with concise provenance comments where practical.
- Keep a machine-readable `third_party/source-manifest.json` mapping KronTerm paths to upstream paths and commits.
- Never copy secrets, service credentials, release signing files, hosted infrastructure identity, telemetry identifiers,
  or vendor account logic.
- Review upstream updates intentionally; do not blindly overwrite KronTerm adaptations.

## Orca 1:1 Web Tabs Mode Decision

KronTerm's web-tabs presentation should intentionally use Orca's open-source renderer implementation as its starting
point. The goal is 1:1 parity in layout, density, spacing, interaction behavior, navigation, worktree sidebar, tab bar,
panes, right sidebar, terminal chrome, source-control panels, settings components, empty/loading/error states, and
keyboard flows.

“1:1” applies to product behavior and visual composition. It does not mean shipping Orca's name, logo, product marks,
hosted-service identity, account UI, telemetry identity, or misleading users about product origin.

### Source areas to adapt first

From Orca's `src/renderer/src/components/`:

- `tab-bar/` — tab strip, creation/search, badges, drag/reorder, worktree identity;
- `tab-group/` — pane grouping and active-tab behavior;
- `sidebar/` — repository/worktree hierarchy, agent rows, smart sorting, status lanes, virtualization, drag/drop;
- `right-sidebar/` — source control, checks, review, contextual details;
- `terminal/` and `terminal-pane/` — terminal shell, toolbar, status, reconnect, pane integration;
- `browser-pane/` — browser chrome, profiles, remote routing, annotations, computer use;
- `settings/` — settings shell, navigation, controls, search, panes, notices, setup cards;
- `cmd-j/` — worktree/session quick navigation and search;
- `new-workspace/` and `workspace-*` — creation, cleanup, metadata, icon/emoji, lifecycle;
- related renderer stores, shared types, tests, CSS tokens, and utility functions required by those components.

### Integration rule

Do not mount the Orca renderer as a separate application inside KronTerm. Adapt its components behind KronTerm's own:

- canonical block identity;
- Jotai models and service boundaries;
- WSH/RPC and Electron preload boundaries;
- Hermes parent-agent model;
- KronosCode delegated-agent model;
- Tabs/Widgets/Canvas/OS presentation model;
- theme tokens, product naming, icons, and accessibility contract;
- plugin contribution registry.

### Target web-tabs shell

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ KronTerm title bar / command center / workspace controls                 │
├───────────────────┬───────────────────────────────────────┬──────────────┤
│ Orca-derived      │ Orca-derived tab bar                 │ Orca-derived │
│ repository and    ├───────────────────────────────────────┤ contextual   │
│ worktree sidebar  │ KronTerm canonical block panes       │ right panel  │
│                   │ Terminal / Editor / Browser / Hermes │ Git/checks/  │
│ agent rows        │ Files / Preview / plugin widgets     │ evidence     │
│ status lanes      │                                       │              │
├───────────────────┴───────────────────────────────────────┴──────────────┤
│ Optional status/activity/attention bar                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

Hermes can occupy a canonical tab or pane. KronosCode appears within Hermes as delegated-run cards and can open/focus
Terminal, Editor, Diff, Preview, Browser, or plugin widgets in the center pane area.

### Visual parity acceptance

- Side-by-side reference captures at 1920×1080, 1440×900, and 1280×800.
- Matching sidebar width behavior, row heights, indentation, status placement, hover/focus, empty states, tab density,
  pane separators, right-sidebar behavior, dialogs, settings layout, and keyboard navigation.
- Pixel-diff thresholds defined per surface; intentional KronTerm branding differences documented.
- Interaction parity tests for tab creation/close/reorder, splits, worktree navigation, sidebar drag/drop, quick open,
  source-control reveal, terminal focus, and session restoration.
- Reduced-motion, keyboard-only, screen-reader, high-contrast, Windows, macOS, and Linux behavior verified.

### Upstream synchronization

- Vendor or mirror the exact Orca commit used for adaptation under a clearly named `third_party/orca/` source reference
  or patch-tracking mechanism; do not treat a temporary clone as provenance.
- Maintain a patch ledger describing which upstream components are copied, adapted, replaced, or intentionally omitted.
- Add a scripted upstream comparison that reports changed source files without automatically merging them.
- Port upstream bug fixes selectively through reviewed commits and focused tests.

## 1. Objective

Create a secure, manifest-driven KronTerm plugin platform so future capabilities—including the aggressive Orca-derived
settings, repository, worktree, terminal, source-control, browser, remote, agent-fleet, mobile, automation, and artifact
features—can integrate through stable extension points.

Plugins may contribute:

- widgets and block views;
- workspace applications;
- commands and command-center entries;
- settings pages and typed settings;
- Hermes tools, prompts, skills, and specialist-agent descriptors;
- KronosCode task adapters and evidence renderers;
- MCP servers and connector definitions;
- repository/worktree providers;
- source-control panels and review providers;
- browser, preview, editor, and artifact handlers;
- notifications and attention producers;
- automations and triggers;
- remote/runtime providers;
- background services with tightly scoped capabilities.

The platform must make plugin-provided capabilities feel native without granting arbitrary renderer or Electron access.

## 2. Non-Negotiable Product Architecture

```text
KronTerm
├── Hermes — only user-facing agent experience
│   ├── KronosCode — embedded coding/workspace specialist
│   └── Plugin-contributed tools, skills, and specialists
├── Plugin Host
│   ├── Discovery and manifest validation
│   ├── Trust, signatures, permissions, and policy
│   ├── Lifecycle and process isolation
│   ├── Contribution registry
│   └── Health, diagnostics, rollback, and updates
├── Workspace
│   ├── Canonical blocks/widgets
│   ├── Tabs
│   ├── Widgets layout
│   ├── Canvas
│   └── KronTerm OS
└── Existing services
    ├── WSH/RPC
    ├── MCP
    ├── ACP
    ├── Git/worktrees
    ├── PTY/terminal
    ├── Browser and computer use
    ├── Secrets and connections
    └── Notifications/mobile/voice
```

KronosChamber must not be introduced as a dependency or user-facing concept. Compatibility identifiers may remain until
their separate cleanup, but new plugin APIs must use Hermes, KronosCode, agent, run, workspace, block, and surface terms.

## 3. Design Principles

1. **Manifest before execution.** KronTerm must know identity, version, permissions, contributions, compatibility, and
   entry points before loading any code.
2. **Capabilities, not ambient authority.** Plugins receive narrow handles; no direct Node, Electron, Jotai store, WSH,
   filesystem, shell, browser-session, or secret access.
3. **Native projections.** Plugins provide data and declared views; KronTerm supplies frames, focus, layout, accessibility,
   error states, settings chrome, attention, and lifecycle.
4. **Canonical block identity.** A plugin widget is one live block projected through widgets, tabs, Canvas, and OS.
5. **Hermes remains the supervisor.** Plugin agents and KronosCode are delegated workers, not competing chats.
6. **Fail closed.** Missing permission, unavailable approval channel, invalid manifest, incompatible version, crashed
   service, or ambiguous target must not widen access.
7. **Recoverable operations.** Install, update, disable, rollback, archive, and uninstall must preserve user data or
   explicitly describe what will be removed.
8. **Inspectable behavior.** Every plugin action has plugin identity, requested capability, target, run ID, and receipt.
9. **Progressive loading.** Do not load every plugin renderer or service at startup.
10. **KronTerm owns placement.** Plugins suggest widget behavior; users and KronTerm's layout engine decide placement.

## 4. Plugin Package Format

### 4.1 Proposed layout

```text
my-plugin/
├── .kronterm-plugin/
│   ├── plugin.json
│   ├── integrity.json
│   └── signature.json              # optional for local development; required by managed marketplaces
├── renderer/
│   ├── widgets/
│   ├── settings/
│   └── artifacts/
├── service/
│   └── index.js                    # optional isolated background service
├── skills/
├── agents/
├── mcp/
├── assets/
├── migrations/
└── README.md
```

### 4.2 Manifest identity

Required fields:

```json
{
  "schemaVersion": 1,
  "id": "publisher.plugin-name",
  "name": "Plugin Name",
  "version": "1.0.0",
  "description": "Short user-facing description.",
  "publisher": "publisher",
  "license": "MIT",
  "engines": {
    "kronterm": ">=0.15.0 <0.16.0"
  },
  "permissions": [],
  "contributes": {}
}
```

Rules:

- IDs are lowercase reverse-domain-style identifiers.
- Plugin version uses SemVer.
- Contributions are inert until validated and enabled.
- Unsupported fields are rejected unless explicitly allowed as forward-compatible metadata.
- Installation never implies every requested permission is granted.

### 4.3 Contribution schema

```json
{
  "contributes": {
    "widgets": [],
    "applications": [],
    "commands": [],
    "settings": [],
    "settingsPages": [],
    "hermesTools": [],
    "skills": [],
    "agents": [],
    "mcpServers": [],
    "artifactRenderers": [],
    "previewers": [],
    "repositoryProviders": [],
    "worktreeProviders": [],
    "sourceControlProviders": [],
    "automationTriggers": [],
    "attentionSources": [],
    "backgroundServices": []
  }
}
```

## 5. Permission Model

Permissions must be structured and target-aware.

### 5.1 Permission families

| Family | Examples |
| --- | --- |
| Workspace | Read focused block, create widget, request focus, suggest layout |
| Files | Read selected files, write workspace files, watch paths |
| Terminal | Create terminal, write input, read bounded output, inspect process state |
| Git | Read status/diff, create worktree, commit, push, manage branches |
| Browser | Navigate, inspect DOM, interact, access named profile |
| Network | Declared domains, localhost, unrestricted outbound |
| Secrets | Request named secret reference; never enumerate or read raw values by default |
| Native | Open application, accessibility actions, screen capture |
| Agents | Register tool, invoke KronosCode, register specialist, observe run |
| Notifications | Create attention item or desktop notification |
| Automation | Register schedule/trigger, run in background |
| Runtime | Start isolated service, remote host access, sandbox/VM |

### 5.2 Grant scopes

- Once
- This run
- This workspace
- This repository
- This plugin version
- Always for this plugin
- Deny

Every grant records plugin ID, version, permission, resource selector, timestamp, decision source, and optional expiry.

### 5.3 High-risk permissions

Require explicit approval and cannot be bundled into a generic “Allow all” prompt:

- arbitrary shell execution;
- writes outside the active workspace;
- destructive Git operations;
- push, publish, deploy, or external messages;
- raw secrets;
- unrestricted network access;
- native accessibility control;
- screen capture;
- persistent background execution;
- installing another plugin or executable.

## 6. Runtime and Isolation

### 6.1 Plugin types

1. **Declarative plugin** — manifest, commands, settings, skills, schemas, and native KronTerm renderers. Preferred.
2. **Renderer extension** — sandboxed iframe/webview bundle using a restricted message API. No Node integration.
3. **Service plugin** — isolated subprocess with authenticated JSON-RPC over stdio or loopback; explicit permissions.
4. **MCP plugin** — MCP server launched through the existing tool boundary and scoped to the active context.
5. **Agent plugin** — ACP specialist descriptor invoked through Hermes with scoped KronTerm tools.

### 6.2 Process rules

- Electron main owns plugin processes.
- Renderer never spawns or talks directly to plugin processes.
- Each service receives a short-lived session token and capability manifest.
- Health check must pass before contributions become active.
- Startup has timeout, cancellation, retry budget, and terminal failure state.
- Crashes trigger bounded restart and visible health state.
- Disable/uninstall stops processes and revokes tokens.
- Resume reconstructs UI from persisted plugin state without replaying external side effects.

### 6.3 Renderer API

Expose a versioned `KronTermPluginApi` with narrow methods such as:

- `context.get()`
- `settings.get/watch()`
- `commands.execute()`
- `workspace.requestFocus()`
- `workspace.requestWidget()`
- `workspace.publishAttention()`
- `artifacts.open()`
- `agents.startRun()`
- `agents.publishEvidence()`
- `notifications.create()`

Do not expose Electron, IPC channel names, global Jotai atoms, raw filesystem, raw WSH, or the unrestricted MCP manifest.

## 7. Smart Widget System

### 7.1 Widget contribution

Each widget declares:

```json
{
  "id": "publisher.plugin-name.review",
  "title": "Review",
  "icon": "assets/review.svg",
  "renderer": "renderer/widgets/review.js",
  "defaultSize": { "width": 560, "height": 420 },
  "minSize": { "width": 320, "height": 220 },
  "preferredPresentations": ["tabs", "widgets", "canvas", "os"],
  "singleton": "per-workspace",
  "activation": [],
  "attention": [],
  "placementHints": {}
}
```

### 7.2 Activation rules

Widgets may declare conditions, never imperative placement:

- command invoked;
- file type opened;
- repository/worktree selected;
- Hermes starts a delegated run;
- KronosCode publishes a diff or test artifact;
- approval becomes pending;
- runtime/connector becomes unhealthy;
- user pins widget;
- automation produces a result;
- matching URI opened;
- explicit user enablement.

### 7.3 Placement scoring

KronTerm calculates placement from:

```text
score = user pin
      + current task relevance
      + attention urgency
      + focused surface affinity
      + presentation compatibility
      + available space
      + recent use
      + plugin hint
      - duplication penalty
      - interruption penalty
      - resource cost
```

Rules:

- User-pinned placement always wins.
- Existing matching widget is reused before creating another.
- Background information should update badges, not steal focus.
- Approval or failure may reveal an attention shelf but should not destroy layout.
- Widgets opened by Hermes appear near the active Hermes surface or associated terminal/file/browser.
- In Tabs, activate or create a tab.
- In Widgets, split beside the associated block if space permits.
- In Canvas, place near the related task/surface with collision avoidance.
- In OS, join the current Scene or app group and appear in the AppStream rail.
- On small screens, use a sheet or focused tab rather than a tiny tile.
- Every automatic placement has Undo and “Never auto-open this widget.”

### 7.4 Smart widget states

- Dormant: registered but unloaded.
- Suggested: shown in launcher/context UI.
- Loading: renderer/service starting.
- Ready: interactive.
- Background: updating without focus.
- Attention: badge or attention shelf.
- Suspended: resource-released but restorable.
- Degraded: missing optional capability.
- Failed: clear recovery actions.

### 7.5 Widget-native integrations

Every plugin widget automatically participates in:

- BlockRegistry lifecycle;
- Tabs, Widgets, Canvas, and OS projections;
- command center and app registry;
- focus and keyboard navigation;
- accessibility names and landmarks;
- settings and context menus;
- screenshot/inspection policy;
- agent activity overlays;
- fold/suspend/restore behavior;
- persistence and layout serialization;
- plugin health and update state.

## 8. Settings Integration

Plugins declare typed settings rather than rendering arbitrary settings pages whenever possible.

Supported setting types:

- boolean;
- string;
- password/secret reference;
- integer/number;
- enum/segmented control;
- multi-select;
- path/resource picker;
- keybinding;
- color;
- duration;
- URL with scheme/domain validation;
- structured JSON with schema only for advanced cases.

Each setting includes scope, default, validation, search terms, stability, restart requirement, and permission dependency.

Plugin settings appear under:

- Settings → Plugins → Plugin Name;
- relevant native category when explicitly contributed, such as Browser or Git;
- repository/workspace overrides when allowed;
- command-center search.

## 9. Hermes and KronosCode Integration

### 9.1 Hermes contributions

Plugins may contribute:

- tools;
- skills;
- slash commands;
- prompt fragments with explicit activation rules;
- connector capabilities;
- structured result cards;
- attention items;
- specialist agents.

Hermes must receive only the contributions enabled for the current workspace and allowed by policy.

### 9.2 KronosCode contributions

Plugins may contribute:

- task classifiers;
- repository setup recipes;
- worktree providers;
- test/verification adapters;
- evidence collectors;
- diff/artifact renderers;
- source-control providers;
- deployment/publish adapters requiring approval.

KronosCode never loads arbitrary renderer code and never receives broader authority than Hermes delegated.

### 9.3 Structured run card

Every plugin or KronosCode delegated run uses a shared card model:

- identity and source plugin;
- objective;
- status and elapsed time;
- workspace/worktree;
- actions and requested permissions;
- output preview;
- changed resources;
- evidence;
- cost and budget;
- interrupt/resume/retry;
- final receipt.

## 10. Marketplace, Installation, and Updates

### 10.1 Sources

- Built-in plugins shipped with KronTerm.
- Local development plugins.
- Repository plugins declared by project policy.
- User-installed marketplace plugins.
- Organization-managed plugins.

### 10.2 Install flow

1. Resolve package and immutable version.
2. Verify checksums and signature when required.
3. Validate manifest and KronTerm compatibility.
4. Display publisher, source, permissions, services, widgets, agents, settings, and migrations.
5. User approves install and initial grants separately.
6. Install into versioned content-addressed storage.
7. Run migrations in restricted mode.
8. Start health checks.
9. Register contributions atomically.
10. Offer widget placement/pinning suggestions without taking over the workspace.

### 10.3 Update flow

- Show permission and contribution diff.
- Require approval for new permissions or executable entry points.
- Keep previous version for rollback.
- Switch registry atomically after validation.
- Roll back automatically on startup/health failure.
- Never execute migrations from an untrusted package before consent.

### 10.4 Uninstall flow

- Explain widgets, settings, automations, secrets, and stored data affected.
- Stop services and revoke capabilities.
- Remove live contributions.
- Replace open widgets with recoverable unavailable placeholders.
- Offer export or retention of plugin data.
- Remove package only after state policy is resolved.

## 11. Proposed Code Boundaries

These are planning targets, not implemented files.

```text
pkg/plugin/
├── types.go
├── manifest.go
├── validate.go
├── store.go
├── permissions.go
├── marketplace.go
└── migrations.go

emain/plugins/
├── plugin-manager.ts
├── plugin-discovery.ts
├── plugin-runtime.ts
├── plugin-service-host.ts
├── plugin-permissions.ts
├── plugin-health.ts
├── plugin-updates.ts
└── plugin-ipc.ts

frontend/app/plugins/
├── plugin-model.ts
├── plugin-registry.ts
├── contribution-registry.ts
├── smart-widget-planner.ts
├── plugin-widget-host.tsx
├── plugin-error-boundary.tsx
├── plugin-permission-dialog.tsx
├── plugin-install-dialog.tsx
├── plugin-marketplace.tsx
└── plugin-health-center.tsx

frontend/app/view/kronsettings/plugins/
├── plugins-page.tsx
├── plugin-detail.tsx
├── plugin-settings.tsx
├── plugin-permissions.tsx
└── plugin-diagnostics.tsx

frontend/types/plugin.ts
mcp-kron-term/src/plugin-tools.ts
```

Existing integration points to adapt:

- `frontend/app/block/block.tsx` — dynamic BlockRegistry adapter.
- `frontend/app/store/app-registry.ts` — plugin applications and launcher entries.
- `frontend/app/workspace/command-center-events.ts` and command palette — commands/settings/apps.
- `frontend/app/view/kronsettings/` — native and plugin settings categories.
- `frontend/app/view/hermes/` and `agents/hermes/plugins/` — Hermes contributions.
- `emain/hermes-runtime.ts` — scoped plugin contribution projection.
- `emain/acp/` — specialist agents and KronosCode adapters.
- `mcp-kron-term/` — plugin management/inspection tools with strict policy.
- `pkg/wconfig/` — typed enablement and stable non-secret configuration.

## 12. Phased Implementation Plan for Opus 5.5

### Phase 0 — Repository truth and decision records

Deliverables:

- Confirm current KronosChamber removal state and exclude it from new APIs.
- Inventory all existing registries: blocks, apps, commands, settings, skills, MCP tools, Hermes plugins, ACP agents.
- Write architecture decision records for plugin trust, renderer isolation, service transport, and package storage.
- Write the user-visible install/update/uninstall and permission contracts.
- Define explicit non-goals for v1.

Exit criteria:

- No unresolved ownership between Go server, Electron main, renderer, Hermes, ACP, and MCP.
- Threat model reviewed before executable plugin support.

### Phase 1 — Contracts and validators

Deliverables:

- Versioned manifest TypeScript and Go representations.
- JSON Schema and fixture corpus.
- Semantic validation: IDs, versions, paths, duplicate contributions, incompatible permissions.
- Capability/permission schema.
- Contribution schema.
- Deterministic validation errors.
- Compatibility negotiation.

Tests:

- Valid minimal/full manifests.
- Unknown fields and forward compatibility.
- Path traversal and symlink escape.
- Duplicate IDs.
- Incompatible engine version.
- Permission/contribution mismatch.
- Malformed schemas and oversized manifests.

### Phase 2 — Discovery and lifecycle

Deliverables:

- Built-in, user, repository, organization, and development discovery roots.
- Versioned package store.
- Enable/disable state.
- Health state machine.
- Atomic contribution registration.
- Crash/restart policy.
- Rollback-ready version retention.
- Diagnostics API.

Tests:

- Duplicate plugin versions and precedence.
- Enable/disable races.
- Startup timeout and crash loop.
- Corrupt package recovery.
- App restart and contribution restoration.

### Phase 3 — Permissions and process isolation

Deliverables:

- Permission evaluator and persistent grants.
- Install and runtime permission prompts.
- Short-lived capability tokens.
- Sandboxed renderer bridge.
- Isolated service host over authenticated JSON-RPC.
- Revocation and expiry.
- Audit receipts.

Tests:

- Token replay and expiry.
- Cross-workspace and cross-plugin denial.
- Missing approval channel fails closed.
- Revocation during an active operation.
- Service attempts undeclared network/filesystem access.

### Phase 4 — Declarative contributions

Deliverables:

- Commands.
- App-registry entries.
- Typed settings.
- Settings pages generated from schema.
- Skills and Hermes prompt/tool metadata.
- Artifact/preview handler metadata.
- Command-center integration.

Exit criteria:

- Useful plugins can exist without custom renderer or service code.

### Phase 5 — Smart widget platform

Deliverables:

- Dynamic BlockRegistry adapter.
- Sandboxed plugin widget host.
- Widget activation events.
- Smart placement planner for all four presentations.
- Reuse/singleton rules.
- suspend/restore/degraded/failed states.
- automatic placement Undo and per-widget suppression.
- context menu, accessibility, settings, and health integration.

Tests:

- Tabs, Widgets, Canvas, and OS placement.
- Small viewport fallback.
- Existing matching widget reuse.
- User pin wins over automatic placement.
- Attention never destroys layout.
- Plugin crash preserves workspace and recovery placeholder.

### Phase 6 — Hermes and KronosCode extensions

Deliverables:

- Plugin tools/skills projected into Hermes by workspace scope.
- ACP specialist registration.
- KronosCode verification and evidence adapters.
- Shared delegated-run card.
- Plugin identity and permission visibility in tool calls.
- Interrupt/cancel/resume propagation.

Tests:

- Tool visibility by scope.
- Delegation authority cannot exceed parent Hermes grant.
- Duplicate/out-of-order run events.
- Cancellation races and process death.
- Evidence provenance.

### Phase 7 — Marketplace and update safety

Deliverables:

- Marketplace catalog and search.
- Install preview.
- Signature/integrity verification.
- Permission diff on update.
- Atomic update and rollback.
- Safe uninstall and retained-data policy.
- Organization policy hooks.

### Phase 8 — Orca capability plugins

Build first-party plugins or plugin-backed modules in this order:

1. Repository/worktree manager.
2. Worktree/agent fleet sidebar.
3. Source-control and review suite.
4. Advanced terminal profiles/session tools.
5. Remote SSH/runtime manager.
6. Browser profiles/design mode.
7. Session history/search.
8. Mobile supervision bridge.
9. Automations and triggers.
10. Artifact and skill marketplace.

Each must use the same plugin APIs available to third parties unless a capability is explicitly privileged and documented.

### Phase 9 — Hardening and release

Deliverables:

- Threat-model closure.
- Performance budgets and lazy-loading verification.
- Accessibility audit.
- Cross-platform test matrix.
- Migration and rollback drills.
- Plugin developer documentation and sample plugins.
- Marketplace policy and incident response.
- Release-readiness review.

## 13. Suggested Work Breakdown for Opus 5.5

Opus should work in bounded milestones, committing only after each milestone passes its focused tests.

### Milestone A: Specification

- Read all nearest `AGENTS.md` files.
- Inventory current registries and write the architecture map.
- Produce manifest, contribution, permission, lifecycle, and smart-placement specifications.
- Stop for review before production code.

### Milestone B: Plugin core

- Implement manifest types/validation and discovery.
- Implement manager state machine and diagnostics.
- Add fixtures and tests.
- No executable plugins yet.

### Milestone C: Declarative integrations

- Commands, settings, apps, skills, artifact metadata.
- Adapt existing registries behind a contribution registry.
- Verify no behavior regressions for built-ins.

### Milestone D: Secure runtime

- Permission service.
- Renderer sandbox.
- Service JSON-RPC host.
- Capability issuance/revocation.
- Security tests.

### Milestone E: Widgets

- Plugin widget host.
- Dynamic block adapter.
- Smart placement planner.
- All presentation tests.

### Milestone F: Hermes/KronosCode

- Tools, skills, agents, run cards, evidence adapters.
- Cancellation/recovery/event-order tests.

### Milestone G: Marketplace

- Install/update/rollback/uninstall UX.
- Integrity and signature support.
- Local developer workflow.

### Milestone H: First-party Orca-derived plugins

- Implement one vertical slice first: repository/worktree manager plus sidebar widget plus Hermes/KronosCode tools.
- Validate the platform against a real, demanding integration before adding more feature families.

## 14. Verification Matrix

| Area | Required verification |
| --- | --- |
| Manifest | Unit/property tests, invalid fixture corpus |
| Security | Permission bypass, path traversal, symlink, token replay, origin isolation |
| Lifecycle | Install, enable, crash, restart, update, rollback, disable, uninstall |
| Widgets | Four presentations, focus, restore, resize, accessibility, failure |
| Hermes | Scope, tool identity, approval, cancellation, evidence |
| KronosCode | Delegation bounds, worktree ownership, verification adapters |
| Settings | Scope resolution, migration, secret separation, search/deep link |
| Performance | Cold start, lazy load, 50+ plugins, 100+ contributions |
| Cross-platform | macOS, Windows, Ubuntu; platform capability gating |
| Recovery | Corrupt plugin, incompatible update, missing service, app crash |

## 15. V1 Scope

Include:

- local and built-in plugins;
- manifest validation;
- commands, settings, applications, skills, widgets, artifact renderers;
- isolated service plugins;
- Hermes tools and ACP agent descriptors;
- permission grants and audit;
- smart widget placement;
- enable/disable and diagnostics;
- developer reload workflow.

Defer:

- public marketplace payments;
- arbitrary native binary installation;
- automatic cross-device plugin sync;
- organization billing/licensing;
- autonomous plugin-to-plugin installation;
- unrestricted in-process React component loading;
- silent permission expansion on updates.

## 16. Acceptance Criteria

1. A sample plugin can declare a command, settings, Hermes tool, artifact renderer, and widget in one manifest.
2. Installing it shows an exact permission/contribution preview.
3. The widget appears in command center and can be manually opened in every presentation.
4. Context activation can suggest or reveal the widget without destroying layout or stealing focus unnecessarily.
5. User pinning and “never auto-open” override the planner.
6. The plugin cannot access files, network, terminal, Git, browser, secrets, native APIs, or agents without matching grants.
7. Hermes sees only workspace-allowed plugin tools and clearly identifies their source.
8. KronosCode can use an allowed verification adapter without receiving unrelated plugin authority.
9. Plugin crashes do not crash the renderer or lose workspace state.
10. Updates show permission diffs and can roll back.
11. Uninstall explains retained/deleted state and leaves recoverable placeholders for open widgets.
12. Built-in views and applications continue to work through the same adapted registries.
13. The platform supports the repository/worktree vertical slice needed for Orca-derived integration.

## 17. Opus 5.5 Starting Prompt

Use this prompt when implementation is authorized:

> Implement the KronTerm plugin platform described in
> `.claude/docs/ai/kronterm/plugin-system-opus-5.5-plan.md`. Work milestone by milestone and do not skip the Phase 0
> architecture inventory or security boundaries. Hermes is the only user-facing agent; KronosCode is an embedded
> coding/workspace specialist inside Hermes. Do not introduce KronosChamber into new APIs or UI. Preserve canonical
> block identity across widgets, tabs, Canvas, and OS. Begin with Milestone A only: inspect the repository, read every
> applicable `AGENTS.md` and skill guide, produce the concrete manifest/permission/lifecycle/placement specifications
> and a file-by-file change plan, then stop for review before implementation. Do not edit generated files. Use
> `apply_patch` for edits and run focused tests appropriate to each subsequent milestone.

## 18. Current Decision State

- Architecture: ready for review.
- Implementation: intentionally not started.
- First recommended vertical slice: repository/worktree plugin with a smart sidebar widget and Hermes/KronosCode tools.
- Highest-risk decision: whether third-party renderer extensions use sandboxed iframes, webviews, or a declarative UI
  protocol. Resolve through a threat model before coding executable plugin support.
