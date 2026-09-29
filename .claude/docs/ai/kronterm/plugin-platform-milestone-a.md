# KronTerm Plugin Platform — Milestone A (Specification)

Companion to `plugin-system-opus-5.5-plan.md`. Date: 2026-09-28. Status: **for review — no product code written.**

This document covers Phase 0 (repository truth, decision records) and Milestone A (manifest, permission, lifecycle,
placement specs, file-by-file plan). Implementation should not start until the open decisions in §9 are answered.

---

## 1. Repository truth (audited against the working tree, `d0f61e79` + uncommitted changes)

### 1.1 Existing registries a plugin platform must absorb

| Registry | Location | Shape today | Plugin impact |
| --- | --- | --- | --- |
| Block views | `frontend/app/block/block.tsx:52-75` | Module-level `Map<string, ViewModelClass>`, 24 static `set()` calls; unknown view → `makeDefaultViewModel` ("No View Component") | Needs a registration API and a lazy/unavailable model instead of a blank frame |
| Launchable apps | `frontend/app/store/app-registry.ts` (`BuiltinViewApps`, `AppDescriptor`) | Static array + installed native apps; has `kind`, `launchPolicy`, `capabilities`, `aliases`, `category` | Closest existing analogue to a plugin `applications` contribution; reuse `SystemAppDescriptor` |
| Widgets bar | `pkg/wconfig/defaultconfig/widgets.json`, `settingsconfig.go:413` (`Widgets map[string]WidgetConfigType`), user `~/.config/waveterm/widgets.json` | `defwidget@*` built-ins + user-defined custom widgets | Plugin widgets should appear here with a reserved prefix (`plugin@<id>/<widget>`) |
| Command center | `frontend/app/workspace/command-center-events.ts` | Only three `CustomEvent`s; there is **no command registry** | Commands contribution requires building a real registry — new work, not an adaptation |
| Settings UI | `frontend/app/view/kronsettings/*` (~20 hand-written category panels) | Bespoke React per category, `kronsettings-model.ts` | Schema-rendered plugin settings are new; must reuse `kronsettings-shared.tsx` controls |
| Typed config | `pkg/wconfig/settingsconfig.go` + `add-config` skill | Go struct → generated TS | Plugin settings must **not** become Go struct fields; need a namespaced `plugin:<id>:*` map |
| Hermes plugins | `agents/hermes/plugins/kronterm-tools/plugin.yaml`; discovery in `emain/hermes-runtime.ts:177-179,463` | One bundled Python backend plugin; memory note: backend loads only the `third_party` bundled copy | Hermes contributions must be staged into the location Hermes actually scans, then restart Hermes |
| ACP agents | `emain/acp/acp-agent-manager.ts` (per-conversation managers) | Backends are code-defined | Needs a descriptor registry for plugin specialists |
| Shared skills | `mcp-kron-term/src/shared-skills.ts` (`KRONTERM_SHARED_SKILL_DIRS`, root containment check) | Env-var directory list, frontmatter parse | Plugin `skills/` dirs can be appended to this list per scope |
| MCP servers | `pkg/mcp/`, `kronsettings-mcp-panel.tsx` | User-configured | Plugin MCP servers go through the same config with plugin provenance |
| Upstream provenance | `NOTICE` (Orca notice added, uncommitted), `third_party/source-imports/*.lock.json`, `README.md` | Lock-file-per-upstream convention already exists | Reuse this convention instead of inventing `third_party/orca/` + `source-manifest.json` separately |
| Persistence | `db/migrations-wstore/` (latest `000013`) | SQLite migrations | Grants, enablement, health history → `000014_plugins` |

### 1.2 Findings that change the plan

1. **KronosChamber is not removed.** `block.tsx` still registers `kronoschat`, `chathubv2`, `kronoschamber`;
   `app-registry.ts` maps the alias `"kronoschamber"` to `hermes`; `emain/chathubv2-*` is live. The plan's Phase 0
   "confirm removal state" resolves to: *not removed.* Plugin APIs must simply never reference it; its removal stays a
   separate change.
2. **No `will-attach-webview` handler exists** (`grep` across `emain/` returns nothing), and the tab view enables
   `webviewTag: true` (`emain-tabview.ts:141`). Today a compromised renderer could attach a `<webview>` with an arbitrary
   preload or `nodeintegration`. This must be fixed *before* any plugin renderer uses webviews — it is a prerequisite
   security fix, independently valuable, and should ship as its own PR.
3. **No command registry exists.** The plan treats commands as a registry to "adapt"; it must be built.
4. **Capability tokens cannot confine a Node process.** A plugin service running as a normal child process has the
   user's full filesystem/network authority regardless of what KronTerm's RPC allows. Tokens only confine what the
   plugin can do *through KronTerm*. The plan's "service attempts undeclared network/filesystem access" test is
   unachievable without OS-level confinement. See ADR-3.
5. **Orca provenance is partially in place** (`NOTICE` entry, `widget-tabs-layout.scss` mentions Orca) but has no
   pinned commit. Audited now: `stablyai/orca` is **MIT** at `main` = `d606be3adef44c80214de3c29e28717b4c80d2be`;
   `CopilotKit/openmuse` MIT; `sk-ruban/notchi` **GPL-3.0** (confirms the plan's exclusion).
6. **The working tree is heavily dirty** (ACP, emain, Hermes plugin, sandbox, docs). Milestone B must start from a clean
   branch or a worktree so plugin commits don't entangle with that work.

---

## 2. Architecture decision records

### ADR-1 Ownership split

> **Revised 2026-09-28 (Milestone B):** Orca (MIT) ships a tested, Electron-free TypeScript plugin manifest and
> capability model (`src/shared/plugins/`). Adapting it is cheaper and safer than a Go rewrite, so **manifest types,
> validation, capability definitions, and consent canonicalization now live in TypeScript** at
> `frontend/app/plugins/manifest/` (zod), shared by Electron main and the renderer. Go still owns persistence
> (grants, enablement, receipts in SQLite) and exposes them over RPC; it never parses manifests. The table below is
> superseded for the "Manifest types, validation" row only.

| Concern | Owner | Reason |
| --- | --- | --- |
| Manifest types, validation, package store, grants DB, enablement | **Go (`pkg/plugin`)** | wavesrv already owns config, filestore, and SQLite; `wsh` and MCP need the same answers; types flow to TS via `task generate` (single source of truth) |
| Process spawning, `kronterm-plugin:` protocol, webview attach policy, session/network policy | **Electron main (`emain/plugins`)** | Only main can create sessions, utility processes, and intercept protocols |
| Contribution projection, placement planner, widget host, settings rendering | **Renderer (`frontend/app/plugins`)** | Consumes registry snapshots over RPC; never touches packages or processes |
| Hermes/ACP projection | `emain/hermes-runtime.ts`, `emain/acp/` | Already the staging owners |

The renderer receives a read-only `PluginRegistrySnapshot` (WPS event `plugins:registry`) and invokes actions through
RPC. Go never touches frontend atoms (AGENTS.md anti-pattern).

### ADR-2 Third-party renderer isolation — **recommend `<webview>` per plugin widget**

| Option | Process isolation | Per-plugin storage | Network policy per plugin | Existing plumbing |
| --- | --- | --- | --- | --- |
| Sandboxed `<iframe>` in tab renderer | Only with OOPIF + distinct origin; shares renderer crash domain in practice | Origin-scoped only | No (shares tab session) | None |
| **`<webview>` + `persist:plugin:<id>` partition** | Yes (guest process) | Yes (partition) | **Yes** (`session.webRequest` per partition) | `web` block already hosts webviews, focus and layout work |
| Declarative UI protocol (JSON tree rendered natively) | N/A — no plugin code in renderer | N/A | N/A | Tsunami VDOM exists but is not a stable public contract |

Decision:
- **v1 third-party widgets:** `<webview>` with a dedicated partition, `src` limited to `kronterm-plugin://<id>/…`
  served by main from the verified package directory, main-injected CSP, main-controlled preload
  (`preload-plugin.ts`) exposing only a `MessagePort`, `nodeintegration` forcibly off. `will-attach-webview` rejects
  any attach that doesn't match this exact policy.
- **First-party widgets** (Orca-derived, built-in): native React registered through the same contribution registry
  with `trust: "builtin"`. They skip the webview but still go through registry, permissions for side effects, and
  placement.
- **Declarative UI:** defer; revisit once the webview path proves the contract.

### ADR-3 Service plugins — trust tiers, not pretend confinement

- Services run via Electron `utilityProcess.fork` with stdio JSON-RPC and a short-lived session token.
- Because a Node process has ambient user authority, the install UI must state: *"This plugin runs code on your
  computer with your user permissions."* Grants govern KronTerm-mediated actions only.
- v1 allows service plugins only for `builtin`, `organization-signed`, and `local-dev` (with a persistent dev badge).
  Marketplace third-party services are deferred until OS-level confinement exists (candidates: `pkg/sandbox` VM, macOS
  `sandbox-exec` profile, Node permission model if Electron 41's Node exposes it reliably — to be spiked, not assumed).
- MCP plugins carry the same caveat; they are processes too.

### ADR-4 Package storage

```
<GetWaveDataDir()>/plugins/
├── store/<id>/<version>+<sha256-12>/   # immutable, content-addressed, read-only after install
├── data/<id>/                          # plugin-owned persistent data, survives updates
└── staging/                            # install/update work area, cleaned on startup
```

Enablement, grants, active version pointer, health history, and suppression preferences live in SQLite
(`000014_plugins`), **not** in `settings.json`: settings are user/agent-editable text and must never be a grant channel.
Plugin *preferences* (non-authority) live in settings under `plugin:<id>:<key>`.

Repository plugins (`<repo>/.kronterm/plugins/`) are discovered but never enabled until the user trusts that repository
root for plugins; trust is keyed by repo path + manifest hash, so a changed manifest re-prompts.

---

## 3. Manifest specification (schema v1)

Authoritative Go types in `pkg/plugin/types.go`; TS generated into `gotypes.d.ts`. File: `.kronterm-plugin/plugin.json`.

```ts
type PluginManifest = {
    schemaversion: 1;
    id: string;                 // ^[a-z0-9]+(\.[a-z0-9-]+){1,3}$, max 96 chars
    name: string;               // 1–48 chars
    version: string;            // strict SemVer 2.0
    description: string;        // ≤ 200 chars
    publisher: string;          // must equal id's first segment
    license: string;            // SPDX expression
    homepage?: string;          // https only
    engines: { kronterm: string };             // SemVer range; unsatisfied → Incompatible
    permissions: PermissionRequest[];          // §4
    contributes: PluginContributions;
    activation?: ActivationEvent[];            // plugin-level, §5.2
    services?: ServiceEntry[];                 // ADR-3 trust-gated
    metadata?: Record<string, string>;         // only forward-compatible escape hatch, ≤ 32 keys
};

type PluginContributions = {
    widgets?: WidgetContribution[];
    applications?: ApplicationContribution[];  // reuses SystemAppDescriptor fields
    commands?: CommandContribution[];
    settings?: SettingContribution[];
    skills?: { path: string }[];
    hermestools?: HermesToolContribution[];
    agents?: AgentDescriptorContribution[];
    mcpservers?: McpServerContribution[];
    artifactrenderers?: ArtifactRendererContribution[];
    worktreeproviders?: ProviderContribution[];
    sourcecontrolproviders?: ProviderContribution[];
    attentionsources?: AttentionSourceContribution[];
};
```

JSON field names are lowercase without underscores (Go convention in AGENTS.md). The plan's camelCase examples
(`schemaVersion`, `defaultSize`) are normalized accordingly.

Deferred from v1 contributions (reject with `E_CONTRIBUTION_UNSUPPORTED`): `automationtriggers`, `backgroundservices`
as persistent daemons, `repositoryproviders` distinct from worktree providers.

### 3.1 Validation rules (deterministic error codes)

| Code | Rule |
| --- | --- |
| `E_SCHEMA` | Unknown top-level field (outside `metadata`), wrong type, missing required |
| `E_ID` | ID pattern, publisher mismatch, reserved publishers (`kronterm`, `builtin`, `wave`) unless builtin |
| `E_VERSION` / `E_ENGINE` | Invalid SemVer; engine range unsatisfied |
| `E_PATH` | Any contribution path absolute, contains `..`, resolves (after `EvalSymlinks`) outside package root, or points at a missing file |
| `E_DUP` | Duplicate contribution ID within plugin; collision with a builtin or another enabled plugin (first-enabled wins, loser marked `Conflicted`) |
| `E_PERMISSION_UNDECLARED` | A contribution requires a permission family not in `permissions` (e.g. a Hermes tool with `effects: ["terminal.write"]`) |
| `E_SIZE` | Manifest > 256 KiB, > 64 contributions per kind, package > 200 MiB |
| `E_TRUST` | Service/MCP entry in a plugin whose trust tier forbids it (ADR-3) |
| `E_INTEGRITY` | `integrity.json` hash mismatch for any file |

Contribution IDs are namespaced automatically: a widget `review` in `acme.git-tools` is `acme.git-tools/review`.
Block view name: `plugin:acme.git-tools/review`.

---

## 4. Permission specification

```ts
type PermissionRequest = {
    permission: PermissionId;          // e.g. "git.read", "terminal.write"
    resources?: ResourceSelector[];    // narrows scope; absent = "ask per use"
    reason: string;                    // shown verbatim in the prompt, ≤ 140 chars
    optional?: boolean;                // plugin must degrade, not fail, if denied
};

type ResourceSelector =
    | { kind: "workspace" }                          // active workspace only
    | { kind: "path"; glob: string; root: "workspace" | "repo" | "plugin-data" }
    | { kind: "domain"; host: string }               // exact host or *.suffix; no bare "*"
    | { kind: "secret"; name: string }               // named reference only
    | { kind: "view"; view: string };
```

### 4.1 Permission IDs (v1)

| Risk | IDs |
| --- | --- |
| Low (grantable at install) | `workspace.read`, `workspace.widget`, `workspace.focus.request`, `notifications.attention`, `git.read`, `files.read.selected`, `settings.own` |
| Medium (grantable at install, per scope) | `files.read`, `files.watch`, `terminal.read`, `browser.read`, `agents.tool.register`, `agents.evidence.publish`, `network.domain` |
| **High (never pre-granted, never in "allow all", prompt at first use)** | `terminal.create`, `terminal.write`, `shell.exec`, `files.write`, `files.write.outside`, `git.write`, `git.destructive`, `git.push`, `network.any`, `secrets.value`, `native.accessibility`, `native.screencapture`, `agents.kronoscode.invoke`, `runtime.background`, `runtime.remote` |

`git.destructive` covers force-push, branch delete, `reset --hard`, worktree removal with uncommitted changes.

### 4.2 Grants

```ts
type PermissionGrant = {
    pluginid: string;
    pluginversion: string;   // grants for "plugin-version" scope don't carry across updates
    permission: PermissionId;
    resource: ResourceSelector | null;
    scope: "once" | "run" | "workspace" | "repository" | "plugin-version" | "plugin";
    decision: "allow" | "deny";
    source: "user" | "organization-policy" | "builtin";
    createdts: number;
    expirests?: number;
    runid?: string;          // required for scope "run"
};
```

Evaluation order: organization deny → explicit deny → most-specific allow whose scope matches current
workspace/repo/run → otherwise **prompt**. If no approval surface is reachable (headless, window closed, Hermes
approval channel down) → **deny** with `E_APPROVAL_UNAVAILABLE`. Delegation: a KronosCode run invoked by Hermes on
behalf of plugin P gets `grants(P) ∩ grants(Hermes run)`, never the union.

### 4.3 Receipts

Every mediated action writes `{receiptid, pluginid, version, permission, target, runid, decision, grantid, ts,
outcome}` to the plugin audit log (SQLite, 30-day rolling, exportable). Receipts are what the run card and Plugin
Health Center display.

---

## 5. Lifecycle specification

### 5.1 Plugin states (Go-owned, broadcast via WPS)

```
Discovered ─validate─▶ Invalid (terminal until files change)
     │
     ▼
 Installed(disabled) ─enable─▶ Activating ─health ok─▶ Active ─▶ Degraded ─▶ Active
     ▲                            │                      │  │
     │                            └─timeout/crash────────┘  └─crash×3/5min─▶ Failed
     │                                                                        │
     └──────────────────────── disable / rollback ◀──────────────────────────┘
 Incompatible   (engine range unsatisfied; auto-rechecked after KronTerm upgrade)
 Conflicted     (contribution ID collision; user resolves)
 Uninstalling ─▶ removed
```

- `Activating` budget: 10 s for services, 5 s for webview first paint; exceed → `Failed` with reason.
- Restart policy: exponential backoff 1 s/4 s/16 s, max 3 restarts per 5 minutes, then `Failed`.
- Contribution registration is **atomic per plugin**: the snapshot flips from "none" to "all" only after validation and
  health succeed. Disable removes all contributions in one snapshot.
- Declarative-only plugins go `Installed → Active` without a health check.

### 5.2 Activation events (lazy load)

`onCommand:<id>`, `onView:<view>`, `onUri:<scheme>`, `onFileType:<ext>`, `onWorktreeSelected`,
`onHermesRun`, `onArtifact:<kind>`, `onApprovalPending`, `onStartup` (builtin only). No `*`.

### 5.3 Install / update / rollback / uninstall

Follow plan §10 with these concrete rules:
- Install writes to `staging/`, verifies integrity, validates, then `rename()`s into `store/`; the active-version pointer
  in SQLite flips in the same transaction that records enablement.
- Update = install new version + permission/contribution diff dialog + pointer flip. Previous version kept until the next
  successful activation plus 7 days. Failed activation → automatic pointer flip back, receipt recorded.
- Migrations (`migrations/*.js`) are deferred to v2; v1 plugins must handle their own data versioning in `data/<id>/`.
  This removes the "untrusted migration before consent" risk entirely for v1.
- Uninstall: open widgets become an `UnavailablePluginView` placeholder (keeps block ID, layout, and `plugin:*` meta so
  reinstall restores them); `data/<id>/` retained by default with explicit "Delete plugin data" checkbox.

---

## 6. Smart widget placement specification

The planner is a **pure function** (`smart-widget-planner.ts`) — trivially unit-testable, no atoms inside:

```ts
planWidgetPlacement(request: WidgetRequest, ctx: PlacementContext): PlacementDecision

type WidgetRequest = {
    widgetid: string;
    trigger: "user" | "activation" | "hermes" | "kronoscode" | "attention";
    relatedblockid?: string;      // terminal/file/browser/Hermes surface that caused it
    urgency: "background" | "normal" | "attention";
};

type PlacementDecision =
    | { kind: "reuse"; blockid: string; focus: boolean }
    | { kind: "create"; presentation: Presentation; target: PresentationTarget; focus: boolean }
    | { kind: "badge"; blockid?: string }          // update only, no layout change
    | { kind: "suggest" }                          // launcher/context chip only
    | { kind: "suppressed"; reason: "never-auto-open" | "rate-limited" };
```

### 6.1 Hard rules (evaluated before scoring, in order)

1. `trigger === "user"` → always open, focused, honoring user pin location.
2. Widget suppressed ("never auto-open") and trigger ≠ user → `suppressed`.
3. Existing live instance matching singleton scope (`global | per-workspace | per-worktree | per-related-block`) →
   `reuse`; focus only if trigger is user/attention.
4. `urgency === "background"` → `badge` (or `suggest` if no instance exists). Background never creates layout.
5. Auto-opens limited to 2 per workspace per 60 s → excess become `suggest`.
6. Viewport < 900 px wide or target tile would be < widget `minsize` → tabs presentation (focused tab) or OS sheet;
   never a sub-minimum tile.

### 6.2 Scoring (only chooses *where*, among valid targets)

For each candidate target, `score = Σ wᵢ·fᵢ` with each feature normalized to [0,1]:

| Feature | Weight | Definition |
| --- | --- | --- |
| user pin location | 100 | 1 if target is the user's pinned slot |
| related-surface adjacency | 8 | 1 if adjacent to `relatedblockid`, decays with layout distance |
| presentation compatibility | 6 | 1 if current presentation ∈ `preferredpresentations` |
| available space | 5 | free area / preferred area, capped at 1 |
| recent use | 3 | recency of this widget in this slot |
| plugin hint | 2 | matches `placementhints` |
| interruption penalty | −6 | 1 if target would resize the focused block |
| resource cost | −2 | plugin reported heavy + > 6 live webviews |

Weights live in one exported constant so tests pin them. Ties break by stable block order.

Per-presentation targets: **tabs** → new tab after related tab; **widgets** → split beside related block along its longer
axis; **canvas** → nearest free slot to related node via existing `workspace-canvas-utils` collision avoidance;
**os** → current Scene/app group + AppStream rail entry.

Every non-user placement emits a toast with **Undo** and **Never auto-open this widget**. Undo restores the prior layout
snapshot, not just closes the block.

### 6.3 Widget runtime states

Plan §7.4 states map onto the plugin lifecycle: widget `Failed` never closes the block — it renders a recovery panel
(Reload, Disable plugin, Open diagnostics). `Suspended` destroys the webview after 10 min hidden (configurable) and
restores from `data/<id>/` + block meta.

---

## 7. File-by-file change plan

Milestone letters match plan §13. `new` = new file, `mod` = modified. Generated files are never hand-edited.

### Prerequisite PR (before B) — webview hardening

| File | Change |
| --- | --- |
| `emain/emain-web.ts` (mod) | `app.on("web-contents-created")` → `will-attach-webview` allowlist: strip unknown preloads, force `nodeIntegration=false`, `contextIsolation=true`, validate partition naming (`persist:web*` for browser blocks, `persist:plugin:*` reserved) |
| `emain/emain-web.test.ts` (new) | Policy unit tests |

### B — Plugin core (no executable code)

| File | Change |
| --- | --- |
| `pkg/plugin/types.go` (new) | Manifest, contribution, permission, grant, state types |
| `pkg/plugin/validate.go` + `_test.go` (new) | §3.1 rules; fixture corpus under `pkg/plugin/testdata/` (valid minimal/full, traversal, symlink escape, dupes, oversized) |
| `pkg/plugin/store.go` + `_test.go` (new) | ADR-4 layout, staging, atomic rename, integrity |
| `pkg/plugin/discovery.go` (new) | builtin (`resources/plugins`), user, repo (trust-gated), dev roots; precedence builtin > org > user > repo > dev |
| `pkg/plugin/manager.go` (new) | §5.1 state machine, WPS broadcast |
| `db/migrations-wstore/000014_plugins.{up,down}.sql` (new) | `plugin_state`, `plugin_grant`, `plugin_receipt`, `plugin_trust` |
| `pkg/wshrpc/wshrpctypes.go` (mod) → `task generate` | `PluginListCommand`, `PluginGetCommand`, `PluginEnableCommand`, `PluginDisableCommand`, `PluginDiagnosticsCommand` (follow `add-rpc` skill) |
| `pkg/wps/` (mod) | `plugins:registry` event (follow `wps-events` skill) |
| `cmd/wsh/cmd/wshcmd-plugin.go` (new) | `wsh plugin list|info|enable|disable|validate <dir>` (follow `add-wshcmd`) |

### C — Declarative contributions

| File | Change |
| --- | --- |
| `frontend/app/plugins/contribution-registry.ts` (new) | Singleton model consuming snapshot; merges builtins + plugins |
| `frontend/app/plugins/command-registry.ts` (new) | First real command registry; builtins registered here too |
| `frontend/app/block/block.tsx` (mod) | `registerBlockView()`/`resolveViewModel()`; unknown `plugin:*` view → `UnavailablePluginView` model |
| `frontend/app/store/app-registry.ts` (mod) | Merge plugin `applications` into `AppDescriptor` list |
| `frontend/app/view/kronsettings/kronsettings-plugins.tsx` (new) + sidebar (mod) | List, detail, schema-rendered settings using `kronsettings-shared.tsx` |
| `pkg/wconfig/settingsconfig.go` (mod) | `PluginSettings map[string]map[string]any` for `plugin:<id>:*` (follow `add-config`) |
| `emain/hermes-runtime.ts` (mod) | Stage enabled plugin `skills/` into Hermes scan path; restart Hermes on change |
| `mcp-kron-term/src/shared-skills.ts` (mod) | Accept plugin skill roots with plugin provenance |

### D — Secure runtime

| File | Change |
| --- | --- |
| `emain/plugins/plugin-protocol.ts` (new) | `kronterm-plugin://` handler, path containment, CSP header |
| `emain/plugins/plugin-session.ts` (new) | Per-plugin partition, `webRequest` domain filter from grants |
| `emain/preload-plugin.ts` (new) | MessagePort-only bridge; versioned `KronTermPluginApi` shim |
| `emain/plugins/plugin-service-host.ts` (new) | `utilityProcess`, JSON-RPC, token, health, backoff |
| `emain/plugins/plugin-permissions.ts` (new) | Prompt broker → renderer dialog; fail-closed |
| `pkg/plugin/permissions.go` + `_test.go` (new) | §4.2 evaluator, delegation intersection, receipts |
| `electron-builder.config.cjs`, `electron.vite.config.ts` (mod) | Build `preload-plugin` entry |

### E — Widgets

| File | Change |
| --- | --- |
| `frontend/app/plugins/smart-widget-planner.ts` + `.test.ts` (new) | §6 pure planner |
| `frontend/app/plugins/plugin-widget-host.tsx` (new) | ViewModel wrapping the webview; states from §6.3 |
| `frontend/app/plugins/plugin-widget-placement.ts` (new) | Applies decisions per presentation using existing layout/canvas/OS models |
| `frontend/app/tab/widget-picker-popover.tsx` (mod) | Plugin widgets section |

### F — Hermes / KronosCode

| File | Change |
| --- | --- |
| `agents/hermes/plugins/kronterm-tools/__init__.py` (mod) | Dynamic tool projection from registry with `source` field |
| `emain/acp/acp-agent-manager.ts` (mod) | Plugin agent descriptors; delegated grant intersection |
| `frontend/app/plugins/run-card.tsx` (new) | Shared delegated-run card (plan §9.3) |

### G / H — Marketplace, first-party Orca vertical slice

Unchanged from plan, with one constraint: the repository/worktree plugin must be built **only** against APIs from B–F.
Any privileged escape hatch it needs is documented in the plugin's README as a platform gap to close.

### Provenance files (with first Orca-derived code)

| File | Change |
| --- | --- |
| `third_party/source-imports/orca.lock.json` (new) | `{upstream, commit: "d606be3a…", license: "MIT", imports: [...]}` — matches existing `hermes-agent.lock.json` convention |
| `third_party/source-imports/source-manifest.json` (new) | KronTerm path → upstream path + commit + `copied|adapted|replaced` |
| `THIRD_PARTY_NOTICES.md` (new) | Full MIT text for Orca/OpenMuse; Apache text + NOTICE for Apache sources |
| `scripts/upstream-diff.mjs` (new) | Report changed upstream files since pinned commit; never merges |

---

## 8. Verification plan per milestone

| Milestone | Gate |
| --- | --- |
| Prereq | Unit tests for attach policy; manual: existing browser blocks and Hermes webview still work |
| B | `go test ./pkg/plugin/...`, `go vet`, fixture corpus 100% classified; `wsh plugin validate` on fixtures |
| C | `npm test -- --run`, `task check:ts`; all 24 builtin views open unchanged; command center lists builtin commands |
| D | Token replay/expiry, cross-plugin denial, approval-unavailable deny, revocation mid-op, protocol traversal (`..%2f`) |
| E | Planner unit tests for every §6.1 rule; manual matrix of 4 presentations × {user, activation, background, attention} |
| F | Scope visibility, delegation intersection, cancel during tool call, out-of-order events |

---

## 9. Decisions (resolved 2026-09-28 — owner delegated: "do as you see fit")

All seven questions below were resolved in favor of the recommendation in this document:

| # | Decision |
| --- | --- |
| 1 | `<webview>` per third-party widget with `persist:plugin:<id>` partition (ADR-2) |
| 2 | Third-party service plugins out of v1; install UI states services run with user privileges (ADR-3) |
| 3 | `will-attach-webview` hardening ships first as an independent PR |
| 4 | Plugin-supplied migrations deferred to v2 |
| 5 | Implementation on dedicated worktrees/branches, not the dirty `feat/kronsettings-from-kronoschamber` tree |
| 6 | Orca pinned at `d606be3adef44c80214de3c29e28717b4c80d2be` until a release tag is chosen |
| 7 | ~~Manifest JSON uses lowercase field names~~ **Revised:** camelCase, because the manifest is TypeScript-owned (ADR-1 revision), Go never parses it, and it stays close to Orca's manifest for adaptation. Engines use Orca's closed `">=x.y.z"` grammar. |

Original questions, kept for the record:

1. **ADR-2:** accept `<webview>`-per-widget for third-party renderers (vs. iframe or declarative-first)?
2. **ADR-3:** accept that third-party *service* plugins are out of v1 until OS confinement is spiked, and that the UI
   says plainly that services run with user privileges?
3. **Prerequisite PR:** approve shipping `will-attach-webview` hardening first, independently of plugins?
4. **Migrations:** accept deferring plugin-supplied migration scripts to v2?
5. **Branching:** implement on a fresh worktree from `main`, given the current dirty tree?
6. **Orca pin:** adopt `d606be3adef44c80214de3c29e28717b4c80d2be` as the audited commit, or pin a release tag?
7. **Naming:** manifest JSON uses lowercase field names (repo Go convention) rather than the plan's camelCase — OK?
