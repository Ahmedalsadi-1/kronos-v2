# FlowithOS Local Demo

An independent Electron walkthrough of the FlowithOS browser workspace. It starts at **OS is awake** with a local profile and sample content.

Run `npm --prefix prototypes/flowithos-demo start` from KronTerm. The script builds the renderer and opens Electron. It can use the dependencies already installed in the repository. To run this folder on its own, use `npm install` followed by `npm start` inside it.

- Select a task preset and click **Run task**. Watch Neo work through the sample steps, pause or resume the task, and open or download the Markdown result in **Files**.
- Browse the offline site previews. Use the address bar, vertical tabs, Back and Forward, bookmarks, and browsing history.
- Choose **Ask in Canvas** to open a canvas with a sample response. Add and edit branches, then try the zoom controls.
- Use **OS Agent** to browse and save presets. Saved presets appear in **Local Workspace**. Click the color dots or open **Settings** to change the home appearance.

Task history, bookmarks, visits, saved presets, and appearance are stored on this Mac. Sample mode uses offline pages and scripted agent runs. The demo requires no Flowith account or Xcode setup. The browser shell, home, task panel, and Canvas are based on public references. Screens beyond those references use demo layouts.

Visual references: [Beta launch coverage and home image](https://www.testingcatalog.com/icymi-flowith-ai-releases-flowithos-app-in-public-beta/), [task and Canvas screenshots](https://www.uneiaparjour.fr/en/flowithos-2/).

See [UI audit and parity checklist](UI-AUDIT.md) for the DMG inventory, evidence boundaries, and remaining differences.

## Agent panel walkthrough

1. Open **OS Agent → Skills**. Search for a skill, open its details, select it, and click **Run sample**.
2. Open the **Plan Proposal**. Switch between **Preview**, **Source**, and **Split**. Select **Edit Plan** to revise its title or Markdown and add or remove to-dos. Confirm the plan to start.
3. Open **To-dos** to see the edited checklist. Try **Pause task**, **Resume task**, and a manual checkbox. When the run completes, open **Files** and preview or export the sample brief.
4. Click **New task** (the plus in the agent header), then **Examples** to jump to failure, cancellation, an expired proposal, or other task states. **Task history** includes an **Archived** filter.

## Live web

Click **Sample web** in the toolbar to switch the address bar to **Live web**. Enter an HTTP or HTTPS URL or a search query. Live pages run in Electron Chromium views, with separate navigation history per live view and a web profile separate from the app interface. Back, Forward, Reload, bookmarks, and history work with live pages. Site links that request a popup open as a new tab.

Select text on a live page, right-click, and choose **Send Selection to Canvas**. The flow keeps the selected text and source URL. Open its **Online Search** node and click **Open source tab** to revisit the page.

The demo agent still uses scripted sample tasks. A live page has no access to the app's Electron bridge. The existing KronOS Agent and tool broker live in the main KronOS app and have not been connected to this standalone demo.

## Compare two live tabs

Open two pages in **Live web**, click **Compare tabs**, select both tabs, and enter a question. **Ask Pi to compare** reads the loaded page text from those two current tab addresses. It sends up to 14,000 characters per page to the configured model provider. With a local KronOS Hermes OpenAI Codex profile, the app uses Pi's provider SDK with that profile's model and reads its existing session in the Electron main process. The credential is never copied to Pi's config or sent to a browser tab. Pi runs without tools, workspace instructions, or session logging. The app validates the source numbers and attaches the actual tab links itself.

Click **Save cited brief to Canvas**, then open the **Gen Document** node. The numbered citations focus the original tab when it is still open at that address. Otherwise, they open the stored URL in a new tab. The brief and its links are saved locally.

A site can still require its own sign-in or verification. When the app detects a challenge, it pauses the comparison before sending page text to Pi. Click **Open tab to check**, complete the site's challenge in that tab, and retry. The app does not add a separate sign-in or verification gate.

This app uses a dedicated Pi workflow rather than the full Hermes tool catalog. The predefined sample agent tasks are unchanged. Install Pi and sign in through your KronOS Hermes OpenAI Codex profile. The adapter reads the active access token for each run. If the session expires, renew it in Hermes. To use Pi's CLI with a separately configured provider instead, launch with `FLOWITH_PI_EXECUTABLE` set to an absolute Pi executable if it cannot be found. `FLOWITH_PI_PROVIDER` and `FLOWITH_PI_MODEL` optionally override Pi's defaults when launching from a terminal.

## Research from agent chat

Open **OS Agent → Chat** or use the bottom composer. Type a message and press **Enter** or click **Send**. Use **Shift+Enter** for a newline. Normal messages go straight to Pi through the KronOS model provider.

Click **Research** before sending a message if you want a sourced Canvas brief. With two pinned tabs, Pi uses those pages. Otherwise it searches the public web, reads accessible results, adds source tabs, and automatically saves the cited brief to **Flows**. Research applies to that message only.

The conversation, draft, and source choices survive relaunch. Pi receives up to eight relevant recent turns. Click **Open cited Canvas** from a research reply to see the brief. **New chat** clears the current conversation and keeps saved briefs.
