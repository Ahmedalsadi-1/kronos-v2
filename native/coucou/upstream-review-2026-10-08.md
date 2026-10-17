# Coucou integration review - 2026-10-08

Latest macOS release reviewed: [v0.2.3](https://github.com/Louis-CFM/coucou/releases/tag/v0.2.3),
commit `5cb2a27af352cf7319569920aac899efd42b54bc`.
Source review also includes main at `c946650bec0e37fd902322c8f149b7e83f06d22f`.

## Appearance implemented

Hermes registers all ten colors from upstream `PillColors.swift`, plus the existing
KronTerm violet. `frontend/hermes/themes/coucou-palettes.json` is shared with the
native build. Native palette selection updates Hermes, native controls, and the
main Mochi color. Both theme modes retain Coucou's black surfaces and system font.
Appearance is cached and replayed after companion recovery. Per-agent brand colors
remain distinct. The wardrobe is a separate upstream feature, not a chat theme.

The companion remains pinned to `8a5c26328bd6409ff873e6f66bdc2e6ba004c856`.
These appearance changes port palette data without claiming a complete v0.2.3
upgrade. Upstream now separates shared CoucouKit from the desktop app; upgrading
requires adapting the build and checking our preview geometry and hooks.

## Recommended next integrations

| Priority | Upstream capability | KronTerm application |
| --- | --- | --- |
| 1 | Terminal session routing in v0.2.3 | Reopen the exact workspace and terminal block associated with a live agent session. |
| 2 | Questions and permissions | Connect notch decisions to the managed runtime's exact pending request ID. Upstream Hermes hooks currently display approval state without an approval transport. |
| 3 | Per-pill colors and Mochi wardrobe | Persist agent-specific colors and expose every outfit with seasonal auto mode. |
| 4 | Display selection, hotplug handling and reduced pointer polling | Keep chat and simulator together across monitors and lower idle CPU usage. |
| 5 | Multilingual dictation, custom sounds and optional hover opening | Reuse KronTerm voice settings, keep hover opt-in, and respect Reduce Motion. |
| 6 | Usage/reset indicators and local weekly recap | Show runtime-specific usage in workspace context; preserve project privacy controls. |
| Labs | Private phone sync and request-bound approval flows | Evaluate against the existing Labs phone bridge before exposing remote actions. |

Sources: [release notes](https://github.com/Louis-CFM/coucou/releases/tag/v0.2.3),
[changelog](https://github.com/Louis-CFM/coucou/blob/main/CHANGELOG.md),
[palette source](https://github.com/Louis-CFM/coucou/blob/c946650bec0e37fd902322c8f149b7e83f06d22f/NotchBuddy/Sources/CoucouKit/PillColors.swift),
[wardrobe source](https://github.com/Louis-CFM/coucou/blob/c946650bec0e37fd902322c8f149b7e83f06d22f/NotchBuddy/Sources/CoucouKit/MochiWardrobe.swift).
