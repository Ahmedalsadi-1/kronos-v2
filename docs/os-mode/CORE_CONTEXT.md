# KronTerm OS Mode — Core Context

## Product model

KronTerm is an Electron desktop shell and an AI work operating environment. Project spaces are the primary unit. Each space can retain roots, pinned apps, live sessions, layout, Canvas objects, tasks, agents, grants, activity, wallpaper, and recovery policy.

OS mode is a presentation of existing live KronTerm blocks. Browser, Terminal, Kronos, Files, sandbox, native surfaces, and other apps must never be reimplemented or remounted just to change presentation.

## System structure

```text
Project Space
├── connected 56px system shell
│   ├── identity and numbered spaces
│   ├── pinned and running apps
│   └── Command, Activity, Control, Kronos, view, clock
├── live application plane
│   ├── freeform windows
│   ├── maximized window
│   ├── split group
│   └── flat overview
├── Files / resource presentation
├── Canvas / typed reference presentation
└── local system state
    ├── events and agent jobs
    ├── capability grants
    └── recovery checkpoints
```

## Identity boundary

Presentation state and runtime state are separate. A single block identity moves through freeform, grouped, maximized, minimized, overview, Files, and Canvas. Preserve its React key and underlying session.

The same app registry is the launch and lifecycle authority for the dock, Command Center, Files, Canvas, App Stream, and Kronos. Reopening a singleton app focuses its running instance; a new instance is created only under multi-window policy.

## Actions

UI, keyboard, automation, and agent behavior use canonical typed actions such as:

- `os.app.launch`
- `os.window.focus`
- `os.window.snap`
- `os.window.minimize`
- `os.window.maximize`
- `os.space.switch`
- `os.resource.open`
- `os.activity.interrupt`
- `os.capability.request`

Existing `spatial.*` actions remain compatibility aliases while callers migrate.

## Appearance boundary

SwiftUI and Apple Human Interface Guidelines are design references only. React/Electron remains the renderer. KronTerm does not copy Apple source, SF Symbols, proprietary assets, branded system screens, or application layouts.

COSMIC, KDE Plasma, and GNOME provide behavioral references for project spaces, launch/search, tiling, overview, notifications, status, and customization. KronTerm keeps its own identity and one coherent component system.

## Persistence and privacy

OS layout schema version 4 preserves bounds, groups, objects, selection, camera, collapsed state, and z-order. Migration only clamps unreachable or undersized windows into the shell-safe region.

The local journal never stores secrets, clipboard contents, full terminal output, or hidden reasoning.

