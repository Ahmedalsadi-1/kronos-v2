# KronTerm OS UI Rules

## Character

- calm, light, spatial, and content-first
- native-feeling hierarchy without copying macOS
- Linux-desktop completeness without theme imitation
- one connected system shell, not a collection of floating widgets

## Scale

| Role | Value |
| --- | ---: |
| Base text | 13px |
| Secondary text | 12px |
| Caption | 11px |
| Minimum text | 10px |
| Compact control | 32px |
| Regular control | 36px |
| Dock target | 40px |
| Integrated titlebar | 44px |
| Connected shell | 56px |

Use 8px control, 14px window, 18px popover, and 22px shell-group radii.

## Materials

- Content is opaque and highly legible.
- Window chrome uses restrained translucency.
- Glass is limited to the connected shell, sidebars, popovers, and temporary controls.
- Use only window, popover, and active/floating elevation levels.
- Reduced transparency removes every blur and uses opaque semantic surfaces.

## Connected shell

- Leading: KronTerm, active project space, numbered space switcher, add space.
- Center: pinned/running apps, running indicators, minimized apps, overflow.
- Trailing: Command Center, Activity Center, Control Center, Kronos, Files/Canvas, clock, overview/layout.
- The three regions are one 56px composited container.
- At 1280px, collapse labels and lower-priority apps into overflow without shrinking hit targets.

## Windows

- Use `SystemWindowFrame` around the existing live `BlockView`.
- Integrate contextual controls into the 44px titlebar.
- Suppress the default block header with `BlockChromeProvider`.
- Use traffic-light controls on macOS and platform-appropriate controls elsewhere.
- Show focus with clarity, z-order, active toolbar state, and shadow.
- Never use scale, glow, tilt, rotation, or chromatic aberration for focus.

## Overview and workspace behavior

- Overview is a flat responsive grid of all live windows.
- Freeform, maximize, minimize, snap/group, drag, resize, keyboard switch, cross-space move, and off-screen recovery preserve live mounts.
- Files and Canvas are peer views of the same project space.
- Canvas references are typed: file, folder, repository, URL, app shortcut, agent task, artifact, note, widget, and connector.

## System surfaces

- Command Center is a Spotlight/KRunner hybrid over apps, running sessions, files, repositories, settings, spaces, tasks, artifacts, and Kronos actions.
- Activity and Control Centers are shell-anchored popovers.
- Kronos opens from the shell into a right inspector and can expand into a normal app window.
- Recovery and permission failures are actionable banners or popovers, never pills floating over app content.
- OS mode has no detached bottom composer.

## Accessibility

- Follow system light/dark, increased contrast, reduced transparency, and reduced motion.
- Use visible keyboard focus and accessible names on icon-only controls.
- Text requires 4.5:1 contrast and controls require 3:1 contrast.
- Do not use color as the only state indicator.

