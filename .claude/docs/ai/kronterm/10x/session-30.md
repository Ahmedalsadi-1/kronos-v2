# 10x Analysis — Proprietary canvas and browser references for KronOS

Session 30 | 2026-11-18

**Study Milanote for capture, Apple Freeform and Miro for canvas navigation, and Safari and Microsoft Edge for browser organization. Build “Pin to Canvas” first.** Capture a finding from a live page, place it beside the other work it informs, and reopen the exact evidence when you return. That gives both surfaces a reason to be used together every day.

## Current Value

KronOS can put a live browser, terminal, editor, and preview in one persistent workspace. The workspace canvas already has free placement, camera controls, four saved camera bookmark slots, notes, task graphs, and workflow links. The separate KronOS Canvas editor already has a frame outline for its own content. Browser Grab and Research can capture an excerpt, a source URL, a selector, a note, and a timestamp, and supply selected findings to the agent. The browser widget also has session partitions and per-block navigation history. [Workspace canvas](../../../../../frontend/app/tab/workspace-canvas.tsx) · [Canvas editor outline](../../../../../frontend/app/view/kronoscanvas/canvas-cowork/outline-panel.tsx) · [Research store](../../../../../frontend/app/view/webview/browser-research-store.ts) · [Research panel](../../../../../frontend/app/view/webview/browser-research-panel.tsx) · [Browser widget](../../../../../frontend/app/view/webview/webview.tsx)

The initial audience is a hypothesis. Developers and technical creators who regularly compare references, inspect a preview, and make a decision or edit are the natural first users. The repository shows what they can do, while usage frequency and reported pain still need user evidence.

## The Question

Can someone stop halfway through a browser-heavy task, reopen one place tomorrow, and immediately see what they were comparing, what they found, and what to do next?

## Established proprietary apps to study

| Rank | App | Pattern to adapt | Where it fits in KronOS |
| --- | --- | --- | --- |
| 1 | **Milanote** | Clip text and images straight to a board. Use ordered columns to make captured material easy to scan and rearrange. | Add **Pin to Canvas** to the existing browser Research panel. Send findings to the current section or a sources column. [Web Clipper](https://help.milanote.com/en/articles/1015930-milanote-web-clipper-for-chrome) · [Columns](https://help.milanote.com/en/articles/10478526-columns) |
| 2 | **Apple Freeform** | Save named views of one board and jump between them in order. | Create a scene from the current viewport and find it by name. Give keyboard users a direct route to “Sources,” “Implementation,” or “Review.” [Freeform scenes](https://support.apple.com/en-my/guide/freeform/frfm7cc55b64/mac) |
| 3 | **Safari** | Named tab groups inside recognizable browsing profiles, with visible identity and separation of site data. | Let a KronOS project choose a browser profile. Show that profile on browser blocks and carry it through new-tab actions from the project. [Safari profiles](https://support.apple.com/en-ie/105100) · [Tab Groups](https://support.apple.com/en-mide/guide/safari/ibrwa2d73908/mac) |
| 4 | **Microsoft Edge** | Durable sets of tabs and a two-page comparison in one view. | Save and reopen an identified set of browser blocks. Put two selected pages side by side and let the pair become a canvas scene. Edge's v2 migration removed shared-workspace collaboration, so the relevant precedent is the durable tab set. [Edge release notes](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-archive-stable-channel) · [Split Screen](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/splitscreenenabled) |
| 5 | **Miro** | A frame list that makes a big board navigable and gives a review a clear sequence. | Let a project walk through sources, options, and a decision in order, with each frame opening the relevant live blocks. [Miro frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames) |
| 6 | **Figma / FigJam** | Sections move with their contents and have direct links. Figma can name and inspect previous versions. | Make a canvas section a linkable unit that can move together. Later, let users inspect how the section looked when a decision was made. [FigJam sections](https://help.figma.com/hc/en-us/articles/4939765379351-Organize-your-FigJam-board-with-sections) · [Figma version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history) |
| 7 | **Google NotebookLM** | Citations jump to the passage behind an answer. | Have KronOS Agent cite a specific canvas finding. Clicking it opens that card, with a route back to the original page. [NotebookLM citations](https://blog.google/innovation-and-ai/products/notebooklm-goes-global-support-for-websites-slides-fact-check/) |
| Historical | **Arc** | Separate durable pins from temporary browsing. Keep capture near the page through Easels. | Use durable pins for references worth revisiting. Arc desktop is scheduled to shut down December 22, 2026, and Easels are absent from its successor Dia, making this a historical interaction reference. [Arc desktop release notes](https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes) · [Arc sunset FAQ](https://resources.arc.net/hc/en-us/articles/44413577819159-Arc-Sunset-Frequently-Asked-Questions) |

## Massive Opportunities

### 1. Save and reopen a working set

Save selected browser blocks, canvas scene, notes, evidence, and references to project files or terminals. A designer could switch from “Search redesign” to “Release QA” and back, with the right pages and review context in place. Start on one device. Restore browser URLs and block positions, and offer an explicit reconnect action for terminals. Load browser views on demand to keep large working sets usable. Scope and preview exactly what a shared working set contains before exploring handoff to another user.

**Evaluation.** High impact for people who switch projects daily, with broad reach among workspace users. Strong differentiation when the set includes the work around the tabs. Saved project context and accumulated findings compound with use. High effort. The main risks are broken references, ambiguous restore behavior, and lazy loading that feels slow when returning to a task. **Strong after the capture loop proves useful.**

### 2. Hand off a decision with its evidence

Package one canvas section into a review someone else can open. Start with a read-only view of the decision note, selected findings and screenshots, and links back to the sources. The reviewer can inspect the evidence in order and reopen material they can access. A later version could attach the agent's before/after comparison and let reviewers suggest changes to the decision.

**Evaluation.** High value at reviews and handoffs, with narrower reach than personal capture. Different from sending a list of links because it preserves what was observed and how it informed the decision. Teams gain an archive of reasoning over time. High effort once permissions and shared state enter the picture. Test a local export with a second reader before investing in shared editing. **Maybe until teams repeatedly ask to share sections.**

## Medium Opportunities

### 1. Make browser findings first-class canvas cards

Extend the existing research finding instead of creating a parallel capture system. The card shows a quote or selected image, page title, saved time, and note. **Open source** tries the captured anchor and falls back to the page if it has moved. **Ask Agent** sends selected cards and makes replies link back to those cards. Keep the saved excerpt visible when a page changes. Start with text, then add selected image capture and explicit snapshot refresh.

**Evaluation.** High impact and daily frequency for research-heavy work, with medium reach across users. Capture itself is established. The distinctive workflow is an evidence card that connects to live browser work, project files, and agent replies. Value compounds as workspaces accumulate useful references. Medium effort. **Must do.**

### 2. Make the workspace canvas navigable at project scale

Extend the four existing camera bookmark slots with names and command-center search. Add titled sections for live blocks and cards once people use scenes to return to work. A section should open from search or a direct link and move its contents together. Keep one owner for each live block as users move between canvas and browser presentations. The separate canvas editor's existing outline provides a local reference for navigation. [Workspace presentation conventions](../../../../../frontend/app/tab/AGENTS.md) · [Canvas editor outline](../../../../../frontend/app/view/kronoscanvas/canvas-cowork/outline-panel.tsx)

**Evaluation.** High frequency and broad reach as boards grow. Camera bookmarks are familiar, while named locations that lead straight to live work have more product value. The benefit builds with the number of useful areas a workspace holds. Medium effort for sections, lower effort for saved views. **Strong.**

### 3. Make browser comparison a saved project action

Choose two existing pages and open **Compare Side by Side** through the workspace's existing blocks and layout. Start with independent navigation. Use it for staging versus production, two documentation pages, or a reference beside a local preview. Save the pair to a scene with their labels and current URLs. Keep profile identity visible when the pages use different accounts.

**Evaluation.** High frequency for QA, design review, and research, with medium reach. The split interaction is table stakes. Saving the pair with findings and review context makes it reusable. Medium effort if the existing split path can be reused. **Strong.**

## Small Gems

- **Pin an existing finding to Canvas.** Support one text card from Research, place it near the active block, and make the action reversible. High frequency, medium reach, low-to-medium effort for the first slice. **Must do.**
- **Name and find saved views.** Add names and command-center search to the four existing camera bookmark slots. Broad utility for busy canvases, modest differentiation, and low relative effort. **Strong.**
- **Open link beside.** Let a user keep the current page in view while opening a reference in an adjacent browser block. Frequent for reference work and relatively low effort if it reuses the split path. **Strong.**
- **Show browser profile in the block header.** Name the active session beside the URL or title. Useful when comparing accounts and a low-effort confidence win. **Strong.**

## Recommended Priority

### Do Now

1. **Pin to Canvas** for existing text findings. One durable card, one source link, one undo path.
2. **Name existing Canvas bookmarks** and reopen them from the command center.
3. **Open Link Beside** in the existing split layout.

### Do Next

1. Add searchable canvas sections and an ordered Sources area.
2. Let the agent cite selected findings with links back to cards.
3. Save and restore a named set of two or more browser blocks. Bind the set to an explicit project profile when multi-account use warrants it.

### Explore

1. Restore a complete project working set after restart, including the scene, browser set, and project file references.
2. Share an evidence-backed review with a second person. Prototype it as a read-only export and watch whether the recipient can reconstruct the decision.

### Backlog

Large template libraries, general-purpose whiteboard drawing parity, real-time multiplayer, and a browser-wide AI sidebar. Each is less directly tied to completing and resuming a browser-heavy task than the work above.

## Questions

### Answered

- **Which three apps should we study first?** Milanote for browser-to-canvas capture, Freeform for the first canvas navigation increment, and Safari for the browser's project and profile model. Use Edge alongside Safari when prototyping comparison.
- **What should KronOS own?** The workflow from a live source to saved evidence, to a decision or edit, to the same project context on reopen.

### Blockers

No decision is required to choose the first prototype. Reach and frequency estimates are qualitative. Repository observations are based on source inspection and product references on vendor documentation.

## Next Steps

- [ ] Use one real task such as comparing a staging UI to the production UI. Capture three findings, pin them beside the two pages, save the view, close KronOS, and reopen the project.
- [ ] Compare with the current workflow. Measure time to first useful finding on reopen, manual steps to recover the comparison, and how many findings have a usable source link or saved excerpt.
- [ ] Run the scenario with several target users. Use voluntary scene reopening and repeat capture as signals for whether to invest in named working sets.


## Figma follow-up

**Start with FigJam's section behavior. Make Dev Mode's review loop the bigger bet.** The useful reverse engineering is a behavior spec built from observing Figma and FigJam on a board we control, plus the data and design rules Figma publishes. Each pattern can become a KronOS interaction in the existing workspace.

| Priority | What to inspect in Figma | What to build in KronOS |
| --- | --- | --- |
| **1. Linkable sections** | In FigJam, create a section from a selection. Move the section, drag items in and out, lock only the section, delete the container while keeping its contents, and reopen a direct link. Record what happens to selection, focus, and membership each time. [FigJam sections](https://help.figma.com/hc/en-us/articles/4939765379351-Organize-your-FigJam-board-with-sections) | Select browser blocks, notes, and findings and choose **Create Section**. Name it, move it as a unit, and open it from the command center or a link. Treat browser and terminal blocks as references to the same live instances. Start with one level of sections and keep membership separate from the camera bookmark. |
| **2. Auto layout for evidence** | Add a card to an auto layout frame, change its text length, and resize the frame. Observe insertion, gap, padding, and fixed, fill, and hug sizing. [Auto layout fundamentals](https://help.figma.com/hc/en-us/articles/31351261703063-FD4B-Auto-layout-fundamentals) | Build one ordered column whose evidence cards reflow when added, removed, or resized. Drag a card between two others to reorder it. Start with short text findings beside free-positioned browser blocks. |
| **3. Inspect and compare** | Mark a design ready, change it, then compare versions and open the attached developer resources. [Guide to Dev Mode](https://help.figma.com/hc/en-us/articles/15023124644247-Guide-to-Dev-Mode-in-Figma) · [Dev Mode statuses](https://help.figma.com/hc/en-us/articles/26781702258583-Dev-Mode-statuses-and-notifications) | **Drop a Figma frame link → pin the reference → open a local or staging preview beside it → annotate differences → save a named review.** Keep the source frame, viewport, and comparison timestamp with the review. Start with manual comparison. Add a side-by-side or overlay diff when both captures use controlled dimensions and the same UI state. |
| **4. Components and overrides** | Instantiate a component twice. Change the original and see which explicit instance overrides survive. Study configurable properties and defaults. [Instance properties](https://help.figma.com/hc/en-us/articles/8883757553943-Edit-instances-with-component-properties) | Save a section as a reusable review template. Instantiate it for another project and change its source URL, viewport, and notes. Start with a one-time template copy. Explore linked updates when users need to maintain multiple instances of the same template. |
| **5. Human and agent editing** | Read Figma's engineering write-up on stable IDs, property-level edits, ordering, and undo. Test what happens to unrelated changes when two editors work in the same section. [Figma multiplayer architecture](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) | Use stable object IDs and small, attributable changes for an agent adding or rearranging evidence. Test simultaneous edits to different fields and undo that preserves unrelated edits. Verify the existing canvas synchronization behavior before choosing a collaboration model. |

For actual Figma files, use the supported MCP surface. A frame link identifies the node. The tools can supply an outline, screenshot, and structured design context for accessible selections. A useful first import is a **linked reference card with an explicit refresh**. That gets the design into the review workflow without making editable import a prerequisite. [Remote MCP setup](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) · [Figma MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)

### First prototype

Use one real UI review. Place a Figma frame reference, the live preview, and two browser findings in a section called **Checkout review**. Move the section and reopen its link after restarting. The same browser block should open with its existing identity, the findings should retain their sources, and the saved design reference should still show what was reviewed. Compare time to resume the review against numbered bookmarks and separate links. If the section makes resuming materially faster, add the evidence column and saved review comparison next.

The repository already has numbered camera bookmarks in workspace canvas and a frame outline in the separate canvas editor. Those are the starting points for navigation and organization. The Figma behavior above comes from public documentation. The proposed edge cases are a test plan for a controlled sample board. [Workspace bookmark implementation](../../../../../frontend/app/tab/workspace-canvas.tsx#L2471) · [Canvas editor outline](../../../../../frontend/app/view/kronoscanvas/canvas-cowork/outline-panel.tsx)
