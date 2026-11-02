# n8n in KronTerm

The `upstream` Git submodule contains the full n8n source. `source.json` records
the pinned revision. The editor, backend, built-in nodes, credentials, triggers,
and execution engine stay upstream. KronTerm adds custom nodes in `nodes/`.

## Build

Use Node.js 24 or newer and npm. The preparation script selects pnpm 12.4.2.
Keep at least 8 GB free for the install and build. From the KronTerm repository
root, run:

```sh
node integrations/n8n/prepare.mjs
```

This initializes the pinned submodule, installs its frozen lockfile, and builds
the full editor and backend. It does not add n8n dependencies to KronTerm's package.
Set `KRONTERM_N8N_NODE` to an absolute Node.js executable path if the desktop
application cannot find Node.js on its PATH.

For an already prepared source checkout, rebuild the native component bundle after
changing an editor adapter:

```sh
node integrations/n8n/build-native-editor.mjs
```

The generated browser assets live in `public/workflow-native/`. Runtime, main,
or preload bridge changes require a complete Electron restart; reloading a tab
alone does not update those processes.

KronTerm's first-run account gate uses the shared account form. Existing configured
accounts continue into the workspace without another signup. Open the left
**Workflows** tab, then select a saved workflow or choose **Workflow actions →
New workflow**. The right inspector provides **Nodes**, and **Executions** becomes
available after the selected workflow has execution history.

The native layout uses original Vue nodes, controls, picker, node editor, and
management content in OS scene/chrome/detail slots. The original Viewport subtree now mounts through Vue into the shared OS world;
its external geometry adapter uses the OS viewport and camera. OS notes,
windows, and original node wrappers share individual scene-order ranks. The
engine/providers and screen-fixed controls remain outside the world. Independent
graph background and pan/zoom behavior are disabled. There is no iframe or
webview for workflow nodes, and no raw DOM reparenting.

The runtime listens on a random localhost port and stores its database and
encrypted credentials under
`~/.kronterm/runtimes/n8n/<workspace-and-tab-hash>/`.

## KronTerm nodes

- **Hermes Agent** runs a scoped Hermes workflow worker and is the default in new workflows.
- **KronTerm Harness** runs a bounded task. The default backend is Hermes; KronosCode remains selectable.
  The agent receives the existing harness tools and approval rules.
- **KronTerm Tool** calls any tool available to the originating workspace surface.
  Select **Discover Tools** to get the current tool names and argument schemas.
  To call a tool, set its exact name and a JSON argument object. n8n expressions can bind
  values from previous nodes.
- **KronTerm Widget** lists, launches, observes, and controls widgets. Use
  `List Widgets` to discover configured widgets and `List Blocks` for their IDs.
  Other tools remain available through the Tool node.

Configured widgets also get individual launch nodes. Widget nodes expose `blockId` when returned by the tool, so later nodes can target them. Each node keeps the raw `result` and n8n item links. Failed
tool results fail the node. Bridge tokens stay in the managed process environment.
The renderer receives runtime status, workflow data, and scoped API results. Session
cookies and runtime bridge tokens remain in Electron main.

The runtime keeps its original workspace and tab scope. Stop it before switching
its attachment. Stopping Hermes stops n8n and revokes its tool caller. n8n's
database persists. Scheduled workflows require the runtime to stay running.
Existing KronTerm saved workflows remain available; there is no automatic format
conversion between KronTerm graphs and n8n workflows.

## Validation

```sh
node --test integrations/n8n/nodes/nodes.test.cjs
npx vitest run emain/n8n-runtime.test.ts
node integrations/n8n/smoke.mjs
```

The smoke test creates a temporary local n8n account and database. It checks the
editor, loaded node catalog, and a real n8n workflow against an authenticated test
bridge. It does not run live agent tasks or change workspace widgets.

## Distribution

The imported source retains n8n's license and notices. Full source access does not
unlock enterprise or cloud-only services. Surfacing the editor in a distributed
product requires the applicable n8n OEM agreement:
https://docs.n8n.io/deploy/host-n8n/deploy-as-an-oem-integration.md

The current launcher supports the development checkout. A packaged distribution
must ship the production closure from `upstream/compiled` as `n8n/runtime` and the
`nodes` folder as `n8n/nodes` in Electron resources, after the distribution terms
are settled.

## OS workflow surfaces

Hermes owns workflow folders and selected-workflow state. The canvas, executions,
and evaluations follow that selection. Credentials, data tables, insights, users,
project roles, and API keys open in the same native component host with the same
local runtime and account. Templates are disabled. n8n licensing and role
checks still apply to each page.

The canvas keeps n8n's node picker, node editor, expressions, and AI tool nodes.
Its execution inspector shows real execution history. Management content opens in
an OS detail slot while the editable graph stays mounted. Original Assistant
actions open regular Hermes chat. The Hermes tools use public catalog schemas,
graph edits, parameter validation, and execution evidence. It does not invoke n8n's hosted AI builder.
Edits require the latest workflow version/checksum and a clean draft to protect user changes.

The `kronterm-workflows` Hermes profile is cloned from the user's default profile
on first use. Its worker retains the originating workspace, tab, and workflow
scope. Interactive approval or credential requests stop the bounded worker with
an actionable error; answer those requests through Hermes chat or the credential
surface. Workers do not auto-approve or recursively delegate.

## Original component verification

`node integrations/n8n/smoke.mjs --components` exposes an isolated browser fixture
using the same original-component bundle and an ephemeral backend. It supports
checking picker, parameter dialogs, credentials, and live execution updates.
The normal smoke also invokes the registered Hermes graph-edit tool and executes
the resulting workflow, checking the output value. No live agent credentials are
used by these checks. Runtime tokens and account cookies remain in Electron main;
the renderer uses a scoped API proxy with session renewal.


## Verification status

The integrated targeted Vitest run passed 82 tests across 16 files, including
runtime/authentication boundaries, document commands, OS camera contracts,
shared account gating, and sidebar/inspector behavior. Isolated fixture checks
have shown original picker/node-editor rendering, adding Hermes Agent,
authenticated credential navigation, and real execution output `answer: 42`.

Visual and interaction verification of the complete Electron OS workspace is
partial. The actual left navigation displayed without a separate login, and the
new-workflow form opened. Full native creation, graph gestures, execution, and
management navigation remain pending and must not be reported as passed.
See [the composition and remaining acceptance gates](../../docs/os-mode/workflow-canvas-plan.md).

### Latest native adapter evidence — 2026-10-29

The final original-component bundle builds successfully. Five Node tests pass
across `editor/native-axios.test.mjs` and `editor/native-patches.test.mjs`. These
cover API envelope preservation, byte-view upload boundaries, multipart filename
and MIME data, native cancellation, external-origin rejection, and repeatable
source patches. The isolated real-engine smoke also completed registered Hermes
graph editing and execution with `answer: 42`, followed by the generated-widget →
Hermes Agent → Widget → Tool flow against its authenticated test bridge.

The latest source changes make the canonical workflow role explicit. Management
execution previews cannot replace the OS graph's camera, object registry, or
commands. Management pages keep the editable document mounted and avoid its
initialization, cleanup, and undo reset. Remote document hydration restores the
active node by ID after a rename and restores selected node IDs. Programmatic OS
selection suppresses the reciprocal selection event for that Vue tick; unchanged
geometry does not cause repeated OS object updates.

Opening a different workflow requests an OS fit only after original node/port
measurement. Explicitly reopening an existing workflow can call `fitWorkflow()`;
revision refresh and management navigation do not refit the camera. The native
picker parks its original mounted component when its inspector tab is hidden,
and opening it preserves an existing connection/AI-filter context. Health checks,
notifications, confirmation dialogs, theme, and CSS variables use the native host
transport or slots rather than changing the global OS document.

Before these final source refinements, the fixture showed original nodes beside
an OS note and verified matching 100%/200% scaling (node width 96→192 pixels;
note width 214→428 pixels). That checks the shared scene projection, not the full
Electron acceptance matrix. The final role, selection, fit, and context-retention
changes still require native visual/interaction verification; their successful
build and source tests do not establish that acceptance gate.


### Shared-world source update — 2026-10-30

The previous passive sibling graph layer is superseded in source by a Vue-managed
Viewport mount beneath `.os-mode-world`. The OS ancestor owns the painted
transform; native carriers do not isolate the whole graph in one stacking
context. An external geometry adapter supplies OS camera/viewport measurements
for original node and port calculations.

A shared `sceneOrder` now includes windows, ordinary OS objects, and live workflow
nodes. Original node wrappers receive the same per-object rank map as windows
and notes. Legacy window-only order is preserved for focused/carousel layouts;
workflow records and ranks are excluded from OS layout persistence. Forty model
tests pass across the shared-order and existing OS model suites, including
explicit window raises and safe workflow deselection.

The new native component bundle is still being built/validated. Earlier fixture
runs and backend execution checks do not verify its mixed-object painting,
selection, or pointer geometry. Final acceptance must overlap and alternately
raise nodes, notes, and windows; pan/drag/connect at zoom 0.5/1/2; and check the
actual Electron workspace before claiming this integration complete.
