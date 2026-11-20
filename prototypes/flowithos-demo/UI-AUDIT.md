# FlowithOS Beta 0.2.16 UI audit

Scope: static inventory from the supplied macOS DMG. The vendor app was not executed. A packaged file or localization key verifies that the artifact contains that material. It does not establish that a screen is reachable, nor does it verify rendering, feature flags, or exact interaction behavior.

- **DMG-1:** `Contents/Resources/app.asar`, SHA-256 `8029a28198bc2824a06056158e925ba9608404ca65a9533c448f65e1a4e8a7b8`. ASAR inventory returned 32,033 paths, including the 34 renderer HTML entries below.
- **DMG-2:** `Contents/Resources/locales/en.json`. Used the browser, Flow, and agent UI keys as evidence of labels and intended states. This evidence does not verify live behavior.
- **REA-1:** `ev_a3cfcab79665ed215fad44678c54dfe5ee3c85c4659314dba6b2293222169ed4`. REA CLI analysis of 42 selected renderer files extracted from DMG-1, including HTML entries and focused browser and preview bundles. The full ASAR analysis was stopped after inventory reported 25,666 candidate source files, including dependencies. REA-1 covers the selected tree.
- **Public Canvas reference:** [Flowith Agent Neo Canvas documentation](https://flowith.io/docs/en/agent-neo/canvas-navigation/). Used for search and document nodes and detail panels. The packaged `PreviewCanvas` chunk and Flow labels did not establish that a complete standalone Canvas editor is bundled. Its exact desktop layout and complete node set remain unverified.

| Surface | Package evidence | Previous demo | Current demo |
| --- | --- | --- | --- |
| Browser frame and home | `index`, `navBar`, `homePage`; home actions and tab state labels | Vertical tabs, prompt, presets, sample sites | Adds tab context actions and an address-to-page workflow; retains existing prompt actions |
| History | `history.html`; search, time ranges, selection, removal, clear | Bare dialog list | Dedicated page with ranges, search, selection, delete confirmation, and open in new tab |
| Downloads | `download.html`, `downloadNotification.html`; filters, search, empty, selection | Markdown export only | Dedicated list with a sample file and generated task exports; filters, search, confirmation, and repeat export |
| Bookmarks and folders | `folderTab` entry; collection creation, renaming, deletion, import, and bookmark actions in locale | Bare dialog list | Dedicated page with collections, moving bookmarks, search and deletion. Import and collection rename/delete are pending |
| Flow library | Flow labels for listing, creating, pinning, renaming, and leaving flows | New Canvas only | Persistent sample flow list with create, open, pin, rename, and remove |
| Canvas | `PreviewCanvas` chunk, Flow labels, and home Canvas action; public docs for nodes | Two fixed nodes and notes | Prompt, search and document nodes, inspector, source tabs, branches, zoom, outline, and Markdown export |
| Command palette | `commandPalette/index.html` | Missing | Searchable local commands via Cmd+K and browser menu |
| Settings | `settings.html` and locale sections | Two selectors in a dialog | Dedicated settings page with appearance and agent preferences plus navigation to history and downloads. Device, diagnostics, update and billing workflows are outside this local implementation |
| Agent | `agentWidget.html`, `agentRing`, `planProposal.html`; timeline, files, controls, modes, plans, skills, to-dos | Steps and Files, task controls, presets | Steps and Files plus editable Plan, To-dos, Skills, task-state examples, retry/cancel/archive, and searchable task history |

Renderer HTML inventory, grouped by likely purpose from file naming and the matched locale keys. Inclusion is static evidence only.

- Browser and workspace: `index.html`, `homePage/index.html`, `navBar/index.html`, `folderTab/index.html`, `history.html`, `download.html`, `downloadNotification.html`, `settings.html`, `commandPalette/index.html`.
- Agent and work views: `agentRing/index.html`, `agentWidget.html`, `globalCapsule/index.html`, `planProposal.html`, `taskExitConfirm/index.html`, `takeoverLockscreen/index.html`, `codeEditor.html`, `imagePreview.html`, `terminal.html`, `claudeCodeTab/index.html`, `imAgentTab/index.html`, `movieDirector/index.html`.
- Account and support: `loginModal.html`, `whitelistGate.html`, `invitationCodesModal.html`, `rewardPage.html`, `bugReport.html`, `quitWarning.html`, `updateToast.html`.
- Window chrome and internal test entries: `splitterOverlay/index.html`, `tabBorderOverlay/index.html`, `windowsTitleBar.html`, `browserControlTest/index.html`, `schedulerTest/index.html`, `workspaceTest/index.html`.

Pending parity includes the exact tab context menu, live sessions, download progress and toast behavior, vendor skill catalog and workspace management, and Canvas node types beyond the three reconstructed here. UI reachable only in the signed vendor runtime or loaded from its services remains unverified. Demo components and sample data are independently implemented.

## Agent panel pass

- **DMG-1 and REA-1:** the packaged renderer contains a plan proposal entry and an agent widget entry. Entry presence is static evidence.
- **DMG-2, `agentWidget.planProposal` and `agentWidget.planPreview`:** preview, source, split, editing, task lists, and plan confirmation, cancellation, and expiration labels informed the local proposal panel.
- **DMG-2, `agentWidget.todo*`, `agentWidget.status`, `agentWidget.controls`, and top-level `status`:** checklist summaries, waiting for confirmation, active, paused, wrapping, completed, failed, cancelled, and archive indications informed the local task views. Local durations, retry fixtures, and transitions are demo choices.
- **DMG-2, `agentWidget.skills` and `agentWidget.modes`:** evidence for skill checking and matching and for Pro/Fast behavior. The searchable catalog, skill details, and five sample workflows are demo designs. The package evidence reviewed does not establish the vendor catalog or its exact layout.

The agents and tasks in this walkthrough run on local fixtures. An approved proposal supplies the checklist and sequence for a timed simulation. User-entered plan text and notes remain on this Mac.
