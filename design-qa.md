# Design QA

## Visual targets

- `/var/folders/_1/w7l4468114zd9bd27_4kjrlm0000gn/T/codex-clipboard-1aa4cdd8-72cf-4c35-a89a-0d252486d975.png`
- `/Users/albsheralsadi/.codex/generated_images/019feb03-8702-7a12-aa5b-422545af3c97/exec-76fd5c0b-e50c-47ab-b7d1-ccf03753a155.png`

## Last successful native capture

- `output/design-qa/kronterm-right-chamber-native-final.png`

## Findings

- Passed: KronosChamber opens as the right-most resizable panel.
- Passed: the collapsed workspace state uses a centered Chamber V2, Terminal, Files, Web, and Plus launcher.
- Passed: widget titles and the dividing title-strip treatment are removed from the shared frame.
- Passed: expand, settings, and close actions use consistent bordered controls inside the widget surface.
- Passed: TypeScript and the focused layout tests pass.
- Fixed after capture: the default widget surface now reserves 58px for the collapsed launcher so it does not overlap the composer.

## Blocker

The restarted Electron app is running, but macOS screen capture returns an entirely black desktop and exposes no capturable window. The final post-fix native screenshot cannot be compared until the GUI session is available again.

final result: blocked

## 2026-11-02: Subagent activity popup

- Source visual truth: `/Users/albsheralsadi/.codex/generated_images/01a19afa-7fbd-7ad3-8755-56a36d57e3d7/exec-f1bd5a8d-d5b3-4f06-ae6f-1a87ddef6dd8.png` (selected option 3, 1536 x 1024).
- Browser preview: `http://127.0.0.1:7007/?preview=subagent-theater`.
- Implementation full-view evidence: `output/subagent-theater/desktop.png` (1182 x 788 exported pixels); narrow evidence: `output/subagent-theater/narrow.png` (300 x 649 exported pixels).
- State: first agent selected and running; second agent completed. Fixture data and surface image are explicitly preview-only; production subscribes to actual subagent activity.
- Viewport: requested 1536 x 1024 and 390 x 844 overrides. In-app browser export scales these to 1182 x 788 and 300 x 649. Runtime measured desktop CSS viewport approximately 1181 x 788, so this is a responsive composition comparison, not a pixel-exact full-screen match. Compare the popup regions normalized to their own width, not the export's surrounding black padding. Native screenshots under the override crop to the physical panel, so use the full-view export above.

### Findings and fidelity surfaces

- No outstanding P0/P1/P2 findings in the component preview.
- Layout: centered, constrained to viewport, solid 10px pure black frame, black header, agent tabs, 3:2 surface/activity columns and persistent footer. At narrow widths the columns stack; activity scrolls independently and close/stop remain available. Browser DOM measurement verified the black border and centered frame.
- Typography: reuses the app sans/system stack and Codicon library. Native 12-13px body hierarchy is intentionally denser than the generated concept. Long tasks truncate in tabs and remain readable in the footer. No new font download or generated icon approximation.
- Colors: opaque charcoal interior, pure black frame/header, light foregrounds, muted secondary text, blue selection, green completion and red error state. No wallpaper or transparency inside the popup.
- Assets: production uses actual selected-child surface captures. Fixture uses the supplied workspace screenshot, so its subject and letterboxing differ from the generated browser-only image. This is a data/source difference, not a replacement illustration or fabricated live feed. `object-fit: contain` deliberately preserves all captured pixels.
- Copy: real task goals, model names, stream entries and statuses replace generated examples. Close explicitly preserves running work. Stop targets the selected child session only and exposes request failure inline.
- Full-view source and implementation were opened in the same comparison tool response. Focused region review used browser accessibility state and DOM frame measurement for header, tabs, surface, feed and footer; no separate raster crops were needed for this component-level comparison.

### Comparison history and verification

- First render exposed an import cycle through the gateway, leaving the lazy preview blank. Moved the stop-action gateway import to action time; reloaded and captured the working popup.
- Verified browser tab switching, left-arrow switching, Escape close, reopen, and selected-agent stop using the preview callback. Browser console check returned no errors.
- Verified waiting/no-surface state on the completed second agent without reusing the first agent's image.
- 11 targeted tests pass: HUD detach/drag/release and draft preservation; selected-agent switching/stop/close; preview isolation, stale capture rejection, polling teardown and completed-agent recorded evidence.
- Full TypeScript check passed. Targeted lint passed.
- Remaining integration gap: preview stop uses a fixture callback; a live running child was not interrupted during verification. Production delegates to the existing `session.interrupt` RPC and reports errors rather than claiming success optimistically.

### Follow-up polish

- P3: a live browser-only capture will fill the preview region more like the generated concept than the preview fixture's whole-workspace screenshot.

### Implementation checklist

- [x] Centered dismissible popup with persistent black frame.
- [x] Selected-agent tabs, scoped surface snapshots and activity stream.
- [x] Escape/close preserve work; stop is a separate child-scoped action.
- [x] Draggable HUD handle available before and after detaching.
- [x] Responsive render, interaction checks, targeted tests, lint and TypeScript.

final result: passed

## 2026-11-02: Larger widget preview and shorter timeline

User-directed revision supersedes the previous 3:2 split. Browser evidence: `output/subagent-theater/larger-preview.png`, 1586 x 989 pixels. The rendered popup measures 1280 x 860 CSS pixels; preview is 974px wide and timeline 240px. Black frame retained. Timeline defaults to one-line summaries with click-to-expand full detail; repeated headings and helper copy removed. Screenshot verified through the local browser after the in-app browser connection was unavailable.

Widget snapshot now captures screenshot pixels after semantic observation in both native and CLI-backed tool adapters; MCP exposes the pixels as image content and keeps semantic elements as text. Popup refresh requests passive pixel captures rather than cached preview URLs. Regression suites: 48 focused Vitest tests and 159 MCP tests passed. Native running-app pixel capture was traced to the existing Electron browser-page/capturePage handlers; automated coverage validates the capture invocation and image propagation using mocks.

final result: passed

## 2026-11-02: Detached HUD drag correction

Root cause: the composer's hold-to-drag hook sent movement to saved surface-controller geometry, while detached islands rendered from frame-local position. The composer now emits a cancelable DOM movement event; the detached frame consumes it across the sibling conversation portal and updates its visible position. Native HUD movement still uses the original desktop bridge when no detached frame consumes the event.

Browser verification used `?preview=hud-drag` with the actual composer drag hook and conversation mount. A held composer drag moved the detached frame from (503, 294.5) to (603, 354.5). The grip then moved it to (643, 384.5). The draft remained `Preserve this draft`. Evidence: `output/subagent-theater/hud-drag-fixed.png`. All eight overlay regression tests pass, including the full composer-hook/portal path and release behavior. Targeted lint and whitespace checks pass.

final result: passed
