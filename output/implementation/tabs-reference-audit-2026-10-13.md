# Tabs reference evidence and remaining work

## Implemented and verified

- Orca's checked-in `src/renderer/src/lib/startup-ui-hydration.ts` and `store/slices/ui/ui-slice-agent-actions.ts` use a 280px default left sidebar. KronTerm's widget sidebar now defaults to 280px, supports pointer and keyboard resizing from 180–480px, persists the preferred width on tab metadata, and caps rendered width at 45% at narrow widths.
- Orca `components/tab-bar/tab-width-rules.ts` specifies 180px tabs, a 72px floor, and 220px tabs from 1280px. KronTerm already matches these dimensions.
- Tabs panes now use integrated BlockChromeProvider with a dedicated contextual toolbar portal host, preserving widget controls while omitting duplicate BlockFrame window chrome. Pane-specific integrated frame styles remove legacy content focus borders/radius/shadows; tab and control keyboard focus remains. A portal-action regression test passes.
- Added `workspace-tabs.preview.tsx`: actual WidgetTabsLayout with seeded WOS objects and MockWaveEnv, visibly labeled as a component preview without terminal/browser/execution runtime. It exercises real tab focus and collapsible sidebar chrome, with static tips/help widgets.
- MCP WorkflowCommandShape preserves launch nodes and compiled launch steps, including term/web/preview view, project root, URL, and connection. Five targeted workflow schema tests pass. Sidebar width restore/clamping/persistence shape and project/connection grouping tests pass; the three targeted Tabs suites pass 24 tests.

## Exact parity remains incomplete

The current widget sidebar groups live widgets by their existing project root and connection and includes the environment launcher. Orca's full application sidebar includes repository/worktree hierarchy, repository/worktree selection, titlebar alignment and navigation controls. Matching the tab width and sidebar width does not establish whole-application visual parity. KronTerm still has its own widget picker, companion pane header, activity timeline, and workbench sizing. Screenshot comparison must cover sidebar open/closed, narrow tab overflow, rename, pin, reorder, split, and agent/companion states. The actual-preview screenshot verifies component chrome only; live Electron widgets and persistent sessions require application testing.

## Supplied installed reference bundles

Read-only Spotlight discovery located both bundles beneath:
`/Users/albsheralsadi/Documents/ChatGPT/New project/app-customization-lab/apps/`

- Comet.app: CFBundleIdentifier `ai.perplexity.comet`; CFBundleShortVersionString `154.0.8037.179`; CFBundleVersion `8037.179`; executable `Comet`. Resources include Chromium-style locales, Assets.car, fonts and a manifest.
- Cursor.app: CFBundleIdentifier `com.todesktop.230313mzl4w4u92`; version/build `3.24.12`; executable `Cursor`. Its Resources/app contains package.json, product.json, out, extensions, node_modules.asar, LICENSE.txt and ThirdPartyNotices.txt. package.json and product.json confirm Cursor 3.24.12.

Only bundle metadata and top-level resource names were read. No account data, credentials, network calls, or installed tools were used. The reverse-engineer-anything skill is available, but REA tools are absent from this session; no decompilation or engine recovery was performed. These metadata observations do not establish computer-use latency, hosted runtime architecture, or reusable workflow execution code. Focused shipped-code/runtime investigation remains separate from the completed UI/schema changes.

## External execution gaps

The current Computer engine remains a KronosCode execution profile. Neither this metadata audit nor the prior Vy client evidence provides a supported reusable Vy engine, a Comet engine adapter, a Cursor cloud runtime, or shared routing across those services. Those integrations require a documented adapter contract and actual service capabilities; faster computer use requires comparative latency and success measurements.
