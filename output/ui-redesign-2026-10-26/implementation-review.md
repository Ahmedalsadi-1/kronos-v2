# Connected shell, Hermes bots, files, and devices

## Implemented

- The OS sidebars now use outside corner fillets. The right sidebar extends left into the workspace and the left sidebar extends right, joining the black frame.
- The upper-right Agent plan displays the active Hermes todo list, with workspace activity as fallback. Activity IDs retain rows through state updates; parent IDs produce nested rows. Cycles cannot produce recursive trees. Current workspace blocks and current run scope the activity fallback.
- The plan supports pending, running, done, and failed states, collapse, and reduced motion. Timeline snapshots restore recent activity across presentation remounts.
- The Bots and Desktop Hermes plugin mounts a native bot selector. Selecting Chat in Hermes focuses the original bot/thread ID and updates the current Hermes session. This path does not start the embedded bot app, create an iframe, or change the Hermes chat presentation. The OS Bots launcher and plugin palette route into Hermes. Existing standalone bot settings compatibility remains.
- The plugin exposes the existing desktop companion toggle. Plugin pane cleanup detaches its host target.
- Hermes file rows have a visible click-to-open actions menu using existing copy, reveal, rename, and confirmed-delete behavior. Right-click remains available.
- File drags now advertise both Hermes and OS resource formats. The desktop accepts native file drops. Image resources open in OS preview windows; code files open in the existing Hermes editor inspector.
- Shared system buttons use neutral materials; grouped controls use a selected tab treatment. Semantics remain appropriate to the control's action.
- Simulator rotation follows captured dimensions rather than an assumed portrait initial state. This fixes rotating an already-landscape iOS or Android target back to portrait.

## Validation

- PASS: 86 tests across 11 files, including native bot chat routing, plugin cleanup and palette routing, bot backend, Hermes presentation continuity, plan row identity and session scope, activity history, OS layout, file-resource parsing, and device controls.
- PASS: main TypeScript check.
- PASS: plugin-inclusive TypeScript check against the real Hermes SDK. The normal project intentionally excludes bundled plugin sources and maps the SDK to a stub; a temporary configuration verified this new plugin against the runtime SDK.
- PASS: targeted core ESLint and plugin ESLint using that temporary project.
- PASS: Taste static lint on new plan/plugin and enhanced file-menu/tree sources: zero failures and zero warnings.
- PASS: rendered shell geometry at 1920x1080, 1440x900, and 1280x800 in light and dark appearance without document horizontal overflow. Reduced-motion icons report animation-name none; the checklist collapses correctly.
- PASS: changed-file whitespace checks.

The browser checks used the component preview with fixture data. The later Hermes-todo connection is covered by a DOM regression test. Full Electron window lifecycle, real device boot/transport, and native Finder drag-and-drop were not exercised. Existing unrelated checkout changes were preserved.

## Images

- `hermes-chat-current-ui-concept.png`: generated edit of the supplied screenshot, showing native Hermes bot chat and the checklist.
- `files-devices-current-ui-concept.png`: generated edit of the same supplied screenshot, showing enhanced file/editor, image-preview, and mobile surfaces.
- `os-frame-{dark,light}-{1920,1440,1280}.png`: rendered component-preview screenshots, not image-generated concepts.

The first `connected-workspace-concepts.png` board was superseded after the user's instruction to stay faithful to the current UI. It is not the selected design direction. The generated replacement images are visual proposals, not evidence that every depicted feature or arrangement was implemented.

Taste source: https://github.com/Leonxlnx/taste-skill. The existing true-black-flat app direction was retained; the native system typeface and current wallpaper/layout were preserved. Radial masks in the shell form the specifically requested outside corner geometry, rather than decorative gradient fills.
