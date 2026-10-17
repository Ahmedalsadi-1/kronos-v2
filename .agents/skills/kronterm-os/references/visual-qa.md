# KronTerm OS Visual QA

## Required states

Capture and inspect:

- freeform with at least three live windows
- focused Browser and focused Terminal
- split/grouped windows
- flat overview
- Files with its source sidebar
- Command Center
- Activity Center
- Control Center
- Kronos right inspector
- recovery or permission failure banner

Run each at 1920×1080, 1440×900, and 1280×800. Check light and dark appearances. At least one pass must enable increased contrast, reduced transparency, and reduced motion.

## Release blockers

- duplicated application headers
- any UI text below 10px
- clipped shell controls or targets smaller than 32px at 1280×800
- detached composer or HUD obstructing active content in OS mode
- perspective, rotation, Cover Flow, or scale-based focus
- blur remaining under reduced transparency
- invisible keyboard focus
- content surfaces made translucent for decoration
- live blocks remounting during presentation changes

## Runtime checks

- Browser history and page state survive focus, grouping, overview, minimize, and Files/Canvas switching.
- Terminal PID, CWD, and scrollback survive the same transitions.
- Kronos session survives inspector/window transitions and takeover.
- App Stream input is accepted only by the focused stream.
- Command Center launches or focuses according to app launch policy.
- Escape always returns to a stable prior state.

Compile success is necessary but never sufficient for visual acceptance.
