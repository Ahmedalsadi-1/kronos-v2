# Flowith canvas and Warmwind OS investigation

Date: 2026-10-14. Inspected in the user's BrowserOS desktop window through native accessibility and screenshots. Dedicated BrowserOS Neo MCP tools were unavailable. This is interaction reverse engineering, not recovered source code or a verified account of either backend.

## Coverage

Flowith: inspected the supplied conversation, camera menu, insertion menu, node search, search filtering, result navigation, node context menu, selected-node controls, and composer menu. Generation was not executed; the account displayed zero credits. Warmwind: homepage and login page inspected; authenticated desktop inspection is pending login. No product implementation has been changed.

Sources:
- https://flowith.io/conv/51ecf122-8654-4fc3-b379-0bf3eec9a170
- https://warmwind.com/
- https://warmwind.com/login

## Flowith: observed interactions

| Surface | Observed behavior | KronTerm adaptation |
| --- | --- | --- |
| Canvas | Dark spatial surface with compact cards, directed edges, vertical progression and wide rows of parallel results. Named dashed groups surround result batches. | Arrange task lineage vertically, siblings horizontally; retain free placement for live widgets. |
| Navigation | Zoom In/Out, Fit, Selected, Top and Bottom. Menu displays Command shortcuts and double arrow shortcuts for ends. | Add one camera menu using existing camera helpers; show all, selected, run start and latest result. |
| Insert | Free Node menu contains Text and Upload. | Keep one Add entry point for notes, files, live widgets and tasks. File nodes should reference real workspace resources. |
| Search | Overlay with search field, All/Text counts, card grid and Export entry point. Typing Bytebot changed count from 60 to 24 and highlighted matching substrings. | Search node title/body/type with matching excerpts, counts and accessible result navigation. Avoid searching only the widget catalog. |
| Search navigation | Clicking a result dismissed search and changed zoom to 90%, but the viewport remained blank across two screenshot observations. Fit restored graph visibility at 15%. | Resolve actual world bounds, account for overlays, and verify the destination intersects the visible viewport. Keep a recovery Fit action. This observation does not establish the cause of Flowith's issue. |
| Node context menu | Quote Node, Group Nodes, Auto-group Nodes, Upload to Knowledge Base, Delete Nodes. Group shortcuts shown as Command+G and Shift+Command+G. | Expose quote/follow selection and reversible group operations. Knowledge actions need a real resource destination. |
| Selected node | Floating toolbar with five color choices, Copy Content, Edit and Delete; nearby View/Edit and Follow Up affordances. | Local selected-node toolbar: Follow up, Quote, Open, Copy and More. Keep destructive actions in More. |
| Composer | Bottom-anchored input expands when context is added. Context appears as removable tokens with a Focus node action. Model/mode controls, attachments, Send, Add node and Branch node appear. | Reuse existing composer context atom and submission event; make context chips explicit and removable. Submission should create a request card with exact context IDs. |
| Composer menu | New Composer entry point. | Multiple composer instances are optional; first make one composer predictably follow the current space and selection. |
| Output modes | Chat, Image, Video, Slides, Website, Auto and model multi-select are exposed. | Only expose modes backed by actual providers and artifact handling. Multi-provider fan-out requires explicit run semantics. |
| Other entries | Comment, Share, Media History and Knowledge Garden are present. | Separate optional collaboration/resource browsing from essential canvas navigation. Their deeper behavior was not verified. |

The spatial pattern suggests a directed task/conversation graph with parallel batches and synthesis nodes. The specific graph layout algorithm, persistence schema, virtualization strategy and backend scheduling are unknown. Labels such as Follow Up and Branch establish affordances, not successful execution semantics.

## KronTerm source mapping

Source inspection confirms existing foundations:
- `frontend/app/tab/workspace-canvas.tsx`: drawing tools, camera helpers, bookmarks, fit/arrange, live block placement, selected context, agent follow and widget insertion.
- Important visibility constraint: `CanvasChromeEnabled = false` at line 108 gates the HUD, tool rail and widget dock in this component. Implemented controls cannot be assumed visible to users. Audit shared shell entry points before restoring or replacing this chrome.
- `frontend/app/tab/workspace-canvas-agent.ts`: request, decision, action, evidence, approval and output card kinds; follow/quote modes; context IDs; activity-derived cards; composer context formatting.
- `frontend/app/tab/workspace-canvas-context.ts`: `workspaceCanvasComposerContextAtom`, composer submission and context-clear events.
- `frontend/app/tab/workspace-canvas-task-graph.ts`: directed edges derived from `contextids`, stable card IDs and aggregates per run. Terminal counts include failed and cancelled cards, so completed count is not a success count.
- `frontend/app/tab/workspace-canvas-workflows.tsx` and `workspace-canvas-workflow-model.ts`: editable workflow graph surface and draft model. Keep reusable executable workflows distinct from conversational lineage.

These are source observations, not verification of the running KronTerm UI. The working tree contains substantial pre-existing changes; this report does not alter them.

## Proposed canvas implementation sequence

1. Audit visible controls and shared-shell integration. Provide Add, Search and Camera entries without two competing toolbars. Preserve existing drawing shortcuts.
2. Add node search and reliable camera reveal. Index actual cards and notes, display excerpt/type/run, and open the selected result using world-space bounds.
3. Add explicit context chips and selected-node Follow up/Quote actions using existing context state. Store exact parent IDs on the request before execution begins; do not silently change submitted context when selection changes.
4. Introduce durable task groups and DAG arrangement. A group references member IDs and stores title/collapsed/presentation state; edges remain derived from context IDs. Define behavior for missing parents and multiple roots. Keep manual placement unless the user invokes Arrange.
5. Add fan-out and synthesis only after runtime support is established. Each child gets a distinct run/task identity, cancellation and retry state. A synthesis request records all chosen outputs as parents. Show actual failed/cancelled/succeeded states separately.
6. Add artifact browsing and knowledge pinning against existing file/evidence resources. Use references and bounded previews instead of duplicating full terminal output or files into every card.

Acceptance checks: a submitted branch retains parent IDs after reload; quoting two nodes creates two edges; arrangement leaves unrelated live blocks untouched; search always reveals its result; groups preserve membership and bounds; switching Canvas/OS does not remount live block sessions; keyboard controls work outside text fields; reduced motion uses direct camera changes.

## Warmwind: initial inspection (superseded by public research below)

Verified homepage positioning: visual AI workers use their own computers to automate workflows. Homepage exposes Desktop app and Mobile app entries. The actual desktop, launcher, worker/task controls, remote screen interaction, history, handoff, scheduling and persistence have not been inspected. The login page appeared rather than an authenticated app.

Do not derive a Warmwind OS specification from its marketing page or login wallpaper. Authenticated inspection should answer:
1. What is the primary object: worker, computer, task or workspace?
2. How does a user open a desktop and see current worker state?
3. How are instruction, execution evidence and resulting files connected?
4. Which actions pause, resume, stop or transfer control, and how is ownership indicated?
5. How are multiple tasks/computers navigated and recovered after reconnect?
6. Which shell controls remain visible, and which appear only during a task?

Candidate KronTerm direction, pending evidence: bind a task inspector to the active live computer block and show instruction, phase, evidence and artifacts alongside its screen. Use the existing canonical block owner and typed `os.*` actions. Preserve the OS contract's connected top shell, flat overview, shared app registry and stable live sessions. A task-oriented computer surface is a design proposal, not an observed Warmwind feature.

## Remaining work

- Authenticated Warmwind inspection is outside scope: the user has no account and does not want to pay. Use public evidence below.
- Inspect Flowith's full reader, grouping behavior and deeper composer/context workflows in a disposable canvas if execution or saved edits become necessary.
- Reconcile the adaptation with KronTerm's running Canvas/OS surfaces before implementation.

## Warmwind public research: no account required

Inspected in BrowserOS on 2026-10-14:
- [Official FAQ](https://warmwind.com/help)
- [Official product walkthrough](https://www.youtube.com/watch?v=7cscwG3nuNk), embedded in the FAQ. Sampled desktop frames around 1:09, 1:59 and 2:47.

This replaces the earlier login dependency. Public evidence supports an adaptation specification; it does not establish runtime reliability or recover the private implementation.

### Documented behavior

The FAQ describes each worker as an isolated cloud desktop with installed browser/native apps. It cannot control software installed only on the user's local computer. Tasks contain ordered goals and optional notes, with the active step indicated in the sidebar. Teaching mode or text input generates a task for review and editing. Step menus allow insertion above/below.

Schedules use time-based instructions; waiting for the next run is separate from execution. A red Pause control and active-app focus animation indicate execution. Reset clears task progress while preserving installed apps, logins and open app state. Workers currently coordinate through shared external resources rather than direct communication. These are vendor-documented behaviors, not independently tested results.

### Visually demonstrated OS layout

| Region | Demonstrated elements | KronTerm adaptation |
| --- | --- | --- |
| Top center | Compact recessed app dock with app icons, active indicator and Add | Reuse connected shell and shared app registry. |
| Main desktop | App window over wallpaper, compact titlebar, expand/close controls | Keep canonical live block content and stable session identity. |
| Left edge | Labeled previews of other open apps, including Mail and Notion | Optional live-window rail; focusing reuses the existing block. |
| Right edge | Schedule card and ordered task steps with associated app icons | Task inspector linked to actual runtime state, block IDs and evidence. |
| Bottom center | Task description and Teach entry while idle; large Pause control while running | State-aware task controls with explicit idle/running/paused/waiting states. |
| Bottom left | Worker selector, Add and status icon; History within desktop | Durable project-space and agent identity, connected to Activity Center. |
| Center overlay | Expandable chat/history with Hide chat | Optional Kronos inspector that preserves task context. |
| App catalog | Searchable All apps panel with result rows and install affordances | Existing launcher/registry with accurate native versus sandbox availability. |

The demo uses extensive translucency. KronTerm should retain opaque application content and readable semantic materials. The demo also displays reasoning-like prose; KronTerm should show concise status and evidence without exposing hidden reasoning. Exact motion timing, blur values, backend scheduling, capture/replay semantics and recovery behavior remain unknown.

### Proposed OS implementation order

1. Bind a task inspector to canonical live blocks; store task identity independently of window bounds.
2. Add ordered steps with editable goals/notes, block references, phase and evidence. Edits should not silently alter an in-flight task.
3. Back Run, Pause/Resume and Cancel with actual runtime operations and visible acknowledgements.
4. Add an optional live-window preview rail using persistent block owners; preserve the connected top shell and flat overview.
5. Distinguish schedule waiting from execution, showing next-run time and timezone after scheduling capabilities are verified.
6. Treat Teaching mode as a separate feature: scoped interaction capture, user review, editable task generation and replay. The demonstrated entry point does not establish its implementation.

Acceptance checks: step selection focuses existing blocks without remounts; phase matches runtime events; pause is acknowledged; resetting a task preserves live app sessions; hiding chat preserves context; scheduled waiting never appears as active execution; reduced motion/transparency are supported.

No account, purchase, software installation or product-code change was made for this research.
