# KronTerm OS Design Contract

KronTerm OS combines a system-UI hierarchy with Linux-desktop completeness and KronTerm's persistent AI workspace model.

## Permanent structure

- one connected 56px top shell
- canonical live application windows with 44px integrated titlebars
- Files and Canvas as peer presentations of one project space
- shell-anchored Command, Activity, and Control Centers
- Kronos as a right inspector or normal live application window

## Component language

Use the primitives in `frontend/app/components/system-ui/` and the semantic tokens in `system-ui.css`. Content remains opaque. Bars, sidebars, popovers, and temporary controls may use restrained material effects. The entire surface responds to light/dark appearance, contrast, reduced transparency, reduced motion, and configurable accent.

## Window language

- Focus: clarity, active toolbar, z-order, and shadow.
- Overview: flat responsive grid.
- Grouping: direct split layout with an interactive divider.
- Minimize: live block remains mounted and appears in the shell/dock.
- Restoration: reconnect or show an explicit resumable state.

No perspective, rotation, Cover Flow, edge carousel, chromatic effect, or scale-based focus is permitted.

## Runtime invariant

`BlockView` and its identity remain stable while layout state changes. Browser history, terminal process, Kronos conversation, native-surface binding, and file state must survive every presentation transition.

## Desktop patterns

- Apple: semantic hierarchy, integrated toolbars, source sidebars, restrained materials, and accessibility adaptation.
- COSMIC: explicit workspace tiling/floating state, modular shell applets, and personalization.
- KDE Plasma: provider-based universal search and secondary result actions.
- GNOME: direct flat overview, workspace grouping, drag between spaces, and uncluttered status.

These are behavioral references only. KronTerm keeps its own brand and does not reproduce any operating-system assets or fake system surfaces.

