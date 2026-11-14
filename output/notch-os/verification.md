# Notch OS update verification

Date: 2026-11-05

## Changes

- Fixed wire-parser rejection of Hide widget and playback controls.
- Added coverage of literal Swift control actions through the real parser.
- Separated revisioned chat layout and fallback timers from window management.
- Made recovery accessible after a collapsed companion exits; canceled stale timers and captures.
- Shared OS materials and appearance preferences across native chrome, chat, and files.
- Kept Browser, Files, Terminal, and Command Center visible, with secondary launchers in overflow.
- Used the shared OS launch decision and singleton policy; registered editors and file diffs as multi-window apps.
- Updated preview inventory on publication, with a two-second fallback poll.
- Used the expanded panel's actual display for sizing and emitted geometry.
- Reduced normal work-panel height to 480 points, utilities to 400, and chat to 480.
- Enlarge provides 680 points for work panels and 640 for chat, clamped to the display.
- Preserved physical-notch and menu-bar geometry for the resting strip.

## Validation

- Targeted Vitest: 135 tests across 16 files passed.
- `task check:ts`: passed.
- `npm run build:dev`: passed.
- `npm run check:build-output`: passed; existing large-chunk notices remain.
- Native companion compiled with Swift 6 and signed successfully.
- Foundation regression tests for appearance decoding and slim-panel sizing passed.
- Changed TypeScript files passed ESLint with inline directives disabled. Ordinary lint reports two existing references to an unavailable `react-hooks/exhaustive-deps` rule; the HEAD version has the same issue.
- Prettier and `git diff --check`: passed for checked changes.

## Rendered evidence

- Browser screenshots at 1920x1080, 1440x900, and 1280x800 in light/dark appearance.
- Additional 340px chat-width and accessibility screenshots.
- Appearance switching preserved the draft and its input element.
- All recovery buttons responded in the explicitly simulated component preview.
- Keyboard focus remained visible; increased contrast used full-strength labels; reduced transparency left zero CSS backdrop filters.
- Isolated native light/dark screenshots captured from the compiled companion.
- Native accessibility actions successfully pressed Enlarge and Restore. The measured live-preview height changed from 382 to 582 points and returned to 382 in the same process, corresponding to 480/680-point panel heights.

The native smoke test uses a labeled preview fixture, without attaching a real terminal or agent session. The browser preview also labels its simulated native actions. These checks do not constitute a full live-session or monitor-disconnect acceptance run. The running packaged KronTerm workspace was not replaced or restarted; the updated native companion and development build are available locally.

Machine-readable evidence: `browser-checks.json`, `native-checks.json`.
