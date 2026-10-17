# OS focus, controls, and media

Implemented October 14, 2026.

## Changes

- Focused desktop is the initial OS layout, including existing layouts that have not explicitly opted into freeform. Stored canvas bounds, camera, objects, and block identities remain intact. The layout menu offers Focused desktop and Freeform canvas; an explicit freeform choice persists.
- Focused windows use the available work area, with room for the shell and right rail. Terminals use the same generous bounds as browsers. Minimizing the active app focuses the next available app.
- Minimized apps stack below Quick Links on the right. Narrow layouts retain the existing minimized-app fallback.
- Floating Hermes composers use opaque charcoal surfaces, restrained borders, rounded corners, and visible keyboard focus.
- A shared Electron media service supplies the desktop playback card and the native notch header indicator. The notch indicator opens playback controls. Spotify and Apple Music support play/pause and previous/next on macOS; browser media supports play/pause. The service validates source IDs and commands and bounds guest script response time.
- Animated desktop bars indicate playing state; they are not an audio spectrum or measured amplitude. Reduced motion disables their animation.

## Validation

- PASS: 80 tests across the OS layout model, dock model, media service, native HUD, and IPC suites.
- PASS: native Coucou companion built and signed locally using `/usr/bin/python3 scripts/build-coucou-hud.py`. Existing upstream Swift warnings remain.
- PASS: real Electron webview smoke test read Media Session metadata, paused an HTML audio element, and resumed it using a silent audio fixture.
- PASS: desktop rail and media preview inspected at 1920x1080, 1440x900, and 1280x800 in light and dark appearance. DOM measurements showed no horizontal overflow; minimized apps were below Quick Links and the media card stayed within the viewport.
- PASS: preview play/pause, next-track, and restore callbacks exercised.
- PASS: `git diff --check` for modified tracked source files.
- UNVERIFIED: full repository TypeScript check stopped after more than 15 minutes without diagnostics. A second direct compiler check also did not finish. Neither is reported as a passing check.
- UNVERIFIED: live Spotify/Apple Music playback and native notch controls against a real track. Browser playback was tested in Electron; native routing was covered by tests and the Swift build.
- Browser automation stopped when the user took control. The final additional keyboard/reduced-motion browser check was not completed.

## Design checks

Direction: a content-first focused desktop, dark media controls, and a quieter floating composer. ENERGY 1 / RHYTHM 2 / MOTION 1.

- PASS: hierarchy uses the large active window, secondary right rail, and compact media card; saved freeform geometry remains available.
- PASS: dark surfaces follow the requested direction. Media text uses `#f4f5f7` and `#b2b6c0` on `#141519`; playback controls have accessible labels and 32px targets.
- PASS: the added card and composer use opaque surfaces with no backdrop blur. Motion is restricted to playing indicators and respects reduced motion in source.
- PASS: media buttons route to real controls; unsupported browser skip controls are omitted. Playback errors appear in the OS card. Empty media state renders no card.
- PASS: no invented marketing claims, statistics, testimonials, navigation, or external visual assets were introduced. Preview media is explicitly labeled as a preview.
- LIMIT: this is not a claim that the entire OS release acceptance checklist or every live application workflow has been revalidated.

Preview screenshots: `output/playwright/os-media-{light,dark}-{1920,1440,1280}.png`.

## Native Electron follow-up — 2026-10-14

- Rebuilt with `npm run build:dev` successfully and gracefully restarted the development Electron app. Its previous renderer assets were dated October 13; the rebuilt renderer is dated October 14. No Git reset or rollback was performed.
- Native computer-use inspection confirmed the Carousel selector, restored 18-window workspace, previous/next navigation controls, large active window with adjacent live window, and HUD above the focused browser.
- Targeted regression suite: 89 tests passing across seven suites, including carousel geometry/navigation, maximize/restore, HUD portal stacking, removal of redundant chat navigation, surface geometry reclamping, media service, and native HUD.
- Full TypeScript check completed with an unrelated existing TS2352 diagnostic in `emain/computer-workflow-engine.test.ts:13`; it is not a passing repository-wide check.
- Native HUD connection failed with managed KronosCode readiness timeout after 15 seconds, including after Retry. This prevents verification of the real composer and multiline clipping.
- Further native interaction was blocked when the computer-use service failed startup and subsequently timed out/reset its kernel. Live carousel navigation, minimized rail restoration, composer clipping, and native notch playback are not claimed verified in this run.
