# Aside settings static inspection

Inspected extension version `1.26.1118.1753` shipped in the installed Aside browser. Source root: `/Users/albsheralsadi/Library/Application Support/Aside/AsideAgentManager/1.26.1118.1753`. Only packaged code was read; profile databases, cookies, credentials, and personal storage were excluded.

## Evidence and scope

- `source-inventory.json` records focused shipped module paths and SHA-256 digests.
- `settings-index.json` extracts 21 pages from the shipped settings search catalog in `assets/route-Co9NN2bA.js`.
- `focused-evidence.json.gz` contains the complete immutable REA CLI output for six byte-identical settings/layout modules; `evidence-summary.json` provides the compact metadata and limitations. Evidence ID: `ev_3ff5932587a5b343ddfb601c50ed3f540bb9ac4bacb17321a6a2c70453141044`. It parsed all six files with zero parse failures and recorded 501 findings. These files were copied unchanged into `/tmp/aside-settings-focused-20261119` for bounded analysis; their digests match the original shipped artifacts.
- A complete-extension REA pass was cancelled after more than five minutes without progressing beyond an unrelated client bundle. No complete-extension REA evidence is claimed. The focused graph's complete coverage refers only to its six inventoried files; imported dependencies outside that subset remain unresolved.
- The findings below are static source observations. They establish declared UI structure and code paths, not successful execution or native enforcement.

## Structure and interaction

The shipped navigation groups are Personal (General, Appearance, Account, Plan & Usage, Security & Privacy), Agent (Agents, Projects, Models, Plugins & MCPs, Memory), Features (Passwords, Routines, Channels, Developers, Mini popup, Lasso), and Archived (Archived chats). Some internal-only entries are gated. The catalog additionally indexes nested settings pages.

Settings search ranks page names, section names, field titles, descriptions, and optional search terms. It returns up to 12 results with keyboard Up/Down, Enter, and Escape handling. Selecting a result navigates to its page and locates the field/section for scroll and temporary highlight. `assets/route-Co9NN2bA.js` contains this implementation.

The settings sidebar uses `clamp(9rem,30vw,13rem)` width, compact 32px rows, neutral selected background, and muted icons. The content panel has a 22px radius. Ordinary detail pages use a centered `max-w-2xl` column, 32px horizontal inset, 64px top inset, and generous bottom padding. Headings use 24px type at weight 450. Grouped list rows have a 52px minimum height, 14px titles, 12px descriptions, and compact trailing controls. Source: `assets/route-CaRfp4_Z.js`, `assets/-layouts-M6Ra33Cl.js`.

A small section navigator is derived from rendered `[data-settings-section]` elements. It appears with two or more sections at container widths >=720px, tracks the active section while scrolling, and scrolls to clicked sections. It resets the scroll offset on route changes. This is a useful navigation pattern for long pages, rather than a separate settings category.

The shipped `assets/globals-BMU1XZ3U.css` defines light and dark material tokens. Light secondary surfaces use white at 85% opacity; dark secondary surfaces use `oklch(98.5% 0 0 / .06)` over the base. Text and surfaces should be translated to KronOS theme tokens, rather than forcing the observed dark screenshot onto light users.

## Browser features

`assets/general-BCeZID85.js` declares address bar search engine selection, Search/Ask new tab mode, automatic Picture-in-Picture, screenshot menu enablement, ordered preferred languages, spell check, browser/profile import, bookmark import, and browser/background-service version status. Controls use capability checks, loading/disabled states, mutation feedback, and cache updates. Search and language controls use native `asideBrowserPreferences` methods rather than local placeholder state.

`assets/appearance-69H9Yerh.js` declares System/Light/Dark theme, horizontal or vertical tab style, horizontal tab shrinking, zoom, recent chat count, sidebar section selection, tab switcher order, tab insertion position, background transparency, tidy-tabs instructions, and shortcut editing. Inactive-tab closing stores a validated value under `aside.tabs.autoArchiveHours`; choices are 0, 12, 24, 168, or 720 hours. Its explanatory UI excludes pinned, grouped, active, audible, private, and agent-controlled tabs and states that inactivity timers reset on restart. This explanatory text alone does not prove the background close algorithm enforces those exclusions.

`assets/privacy-7Ed82PJI.js` declares browsing history access, data clearing, third-party cookie preference, analytics preference, adblock/filter management, and links to native privacy/site/security pages. Data clearing accepts all time, 15min, 30min, 24h, 7d, or 4w, and one or more of history, cookies, cache, download history, autofill, or site storage. Its declared implementation maps selected kinds to `chrome.browsingData.remove`, with site storage expanding to cacheStorage/fileSystems/indexedDB/localStorage/serviceWorkers/webSQL. Native links are `aside://history/`, `aside://settings/content`, `aside://settings/security`, and `chrome://settings/adPrivacy`; Electron cannot be assumed to support these destinations.

## Sessions and profiles

There is no dedicated browser-sessions settings entry in the inspected complete settings search catalog. This is a bounded negative finding about that catalog, not proof that no other surface exposes sessions.

`assets/developers-DU1iuTuh.js` includes a "Save sessions" switch whose description explicitly concerns CLI/MCP agent sessions in the chat list. It invokes the CLI setting command `save-sessions`. It must not be presented as browser-tab session persistence.

The same page selects a default browser profile, grouped by account and browser profile, with a Last used fallback and locked profiles disabled. Its mutation uses `set-default-profile`. This provides a useful profile selection pattern but does not establish KronOS session isolation semantics.

For KronOS, browser-session inventory, persistent versus temporary partition labeling, live tab counts, session-specific history/downloads, and explicit data management should be treated as product adaptations backed by KronOS APIs. Do not claim these are a one-to-one Aside session page reconstruction.

## Remaining gaps

- Static inspection does not verify native API success, defaults from live user preferences, authorization rules, filter enforcement, or inactivity exclusions.
- The settings search catalog may omit hidden, conditional, or non-settings surfaces.
- Browser import and native privacy pages depend on Chromium customization that cannot be reproduced by copying UI labels.
- Account, password-vault, billing, payment, and channel features require their own real backend capabilities. Their presence in Aside is not a reason to ship unsupported KronOS controls.
