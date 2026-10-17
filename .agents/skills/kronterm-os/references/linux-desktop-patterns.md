# Linux Desktop Pattern Reference

Borrow the completeness of mature Linux desktops while keeping one KronTerm visual language.

## COSMIC

- Project spaces can be dynamic or pinned and can retain independent tiling/floating behavior.
- Launcher, app library, panels, workspaces, and system settings are modular services over one app model.
- Tiling is an explicit workspace capability with visible state, not a visual effect.

## KDE Plasma

- Command Center follows KRunner's provider model: applications, files, settings, actions, and recent entities are ranked together.
- Results have stable IDs, can be deduplicated, and may expose relevant secondary actions.
- Configuration changes providers and ranking; it does not fork launcher implementations.

## GNOME

- Overview is a flat, direct representation of running windows and workspaces.
- Workspaces reduce clutter and accept windows through drag-and-drop.
- Application launch, window switching, and workspace movement meet in one discoverable overview/search vocabulary.

## KronTerm adaptation

- Project spaces remain the primary unit; tabs are compatible sub-workspaces.
- The connected shell owns launch, status, activity, control, and workspace switching.
- Window actions use the canonical `os.*` action layer so UI, keyboard, and agents behave consistently.
- Do not expose fake distribution menus, boot flows, package-manager chrome, or Linux branding.

## Sources

- https://system76.com/cosmic
- https://support.system76.com/articles/pop-basics/
- https://develop.kde.org/docs/plasma/krunner/
- https://docs.kde.org/trunk_kf6/en/plasma-desktop/plasma-desktop/krunner.html
- https://help.gnome.org/gnome-help/shell-workspaces.html
- https://help.gnome.org/gnome-help/shell-windows.html

