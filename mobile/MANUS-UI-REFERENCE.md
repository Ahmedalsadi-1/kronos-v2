# Composer widget strip and takeover reference

## Investigation boundary

The user supplied a Manus screenshot and a 9.19-second screen recording and explicitly invoked
`reverse-engineer-anything`. The installed `/Applications/Manus.app/Contents/Resources/app.asar` was inspected
read-only. No Grok Bot artifact was found in the bounded installed-app search. No original Grok Bot or Manus source
project was supplied. No bulk application code was imported into KronTerm.

The worker's full REA CLI analysis was stopped during parsing of 1860 sources. A root REA MCP analysis of the isolated
UI chunk timed out after 300 seconds. Neither produced an Evidence ID. Findings below are direct archive observations
and recording observations; they must not be described as a completed REA graph or observed Manus runtime execution.

## Direct static observations

- `/package.json` identifies Manus version 1.7.4.
- `/dist/windowManager/windows/MainWindow.js` selects `app://manus/app` or `app://manus/login` in production.
- `/frontend/out/_next/static/chunks/1log9f9put5tj.js` contains compiled chat and computer-view UI. It is 6616344 bytes;
  SHA-256 `27a0fc8666ed9390e2085ba1fe7a43b86cfe317d13336d9178340d96ee3a5046`.
- Function `eyc`, near character 1839132, renders a normally 72 x 48 thumbnail, 30 x 20 when stopped, with 8 / 4 px
  corner radii. Clicking invokes `chatSidebarController.openSidebar` for the workspace with source `todo`.
- The adjacent header selects working, input-needed, failure, stopped or completed states from task state.
- Function `reH`, near character 6475648, renders a fixed takeover overlay using an origin rectangle and expanded
  fullscreen state. It includes Exit takeover and an Escape handler.
- Function `reR`, near character 6473715, selects authenticated WebRTC with interactive VNC fallback. Its VNC adapter
  explicitly controls viewport scaling, click focus and read-only input.

These are compiled artifacts, not original TSX. Package metadata alone does not establish a reusable license for the
entire UI and its service dependencies.

## Recording observations

The recording shows an expanded browser, Exit takeover, a note dialog with Send and continue, then a watch view.
Extracted frames used for inspection are in `../output/iphone-concepts/manus-reference/interaction-sheet.jpg`.

## KronTerm implementation

- Chat uses a dark composer and a shared widget strip directly above it, rather than large widgets inside the transcript.
- Multiple open widgets appear side by side. Agent-targeted widgets take precedence, then working widgets, then the
  last used widget. One tile expands while other tiles remain available in a horizontal strip.
- Remote previews use their existing actual screenshot/stream data. The local terminal shows real console output;
  the desktop publishes real framebuffer snapshots. Local browser miniatures load the same URL in a read-only frame.
- Clicking opens the corresponding widget and browser page. Local widget instances remain mounted when returning
  to chat, so tabs and the temporary desktop survive view switching.
- Take control pauses an active local agent operation before enabling direct input. Exit takeover removes input access
  and opens the handoff-note dialog. A local handoff returns to the local agent; a configured model receives the note.
  Without model configuration, the draft remains and settings open. Remote handoff uses the existing host session API.

## Remaining gaps

- This adapts the confirmed interaction into KronTerm; it is not a wholesale transplant of Manus or Grok Bot.
- A local browser miniature is another read-only URL viewport, not a capture of its exact scroll/authentication state.
  Sites may block embedding. The native iPhone browser needs a dedicated view/snapshot bridge for full fidelity.
- The graphical and console guests remain separate, and native iPhone compilation/installation is still unverified.
- Actual model-provider continuation requires an explicitly configured model endpoint and credentials.

Checklist: installed Manus UI structure answered statically; recording interaction answered visually; composer dock
and takeover adaptation implemented; original Grok Bot source and complete original-source reuse unresolved.
