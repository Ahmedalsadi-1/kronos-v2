# Workflow Canvas plugin

Open **Workflow Canvas** from the widget launcher, OS Command Center, or
Kronos chat's plus menu. The canonical widget type is
`plugin:kronterm.openhuman-workflow/canvas`; `workflowcanvas` is an alias.

This is a bundled plugin with a native host adapter, registered explicitly in
the block and application registries. The manifest describes its contribution;
the repository does not yet have a general plugin installer or sandbox runtime.
The bundled native adapter runs with core application privileges; the manifest
is descriptive and does not introduce an independent permission boundary.

Use the grouped, searchable step library to add or drag steps. OpenHuman node
cards, icon tiles, numbered steps, canvas controls, minimap, undo/redo, and automatic
layout are adapted to KronTerm. The inspector edits each step. Save persists drafts
in block metadata, including unfinished steps. Run saves first and creates a workflow in the existing local runtime,
bound to the active conversation and explicit workspace targets. Terminal,
browser, and widget steps require an assigned widget. Review steps pause for
human review. Run validation rejects cycles, missing instructions, and invalid targets.
The Runs tab follows live workflow events and offers pause, resume, cancel, and workspace navigation.
This palette supports KronTerm's runtime rather than claiming support for
OpenHuman's Rust-specific node kinds.

Ask Kronos attaches the current graph to the shared composer without sending
it. Chat panel, HUD chat, and Chat widget use the existing surface controller,
including the OS shell/Coucou placement configured by the workspace. They do
not create a second conversation or replace the notch renderer.

Bots is available as a persistent widget and from chat's plus menu. It hosts
the existing OpenMausBot management UI and validated bot desktop handoff.
Its conversation list opens original threads in the shared panel or HUD. A narrow
main-process adapter preserves `openmausbot:<botId>:<threadId>` identity, loads
paginated history, sends text, streams changes, and interrupts the owning thread.
The owner credential stays in the main process. Secret, sign-in, approval, and
attachment workflows remain in Bots settings; the shared transcript points there.
Bot configuration and history continue to belong to OpenMausBot.

Coucou has Workflows and Bots launchers that open the same native live widget
host used by the other workspace surfaces. Existing blocks are reused. Rebuild
the companion with `python3 scripts/build-coucou-hud.py` and restart KronTerm
to load updated main-process IPC and native launchers.

This integration does not introduce a Rust runtime or claim a measured speedup.
Canvas editing stays in the renderer; execution uses the existing KronTerm runtime.
The bot adapter polls only while a turn is active and stops when it completes.

For a standalone editor build, run:

    node frontend/app/plugins/openhuman-workflow/build.mjs

Then serve this directory and open `renderer.html`. Standalone saves use local
browser storage and have no execution or chat capability. See NOTICE.md and
LICENSE for the extracted source's licensing.
