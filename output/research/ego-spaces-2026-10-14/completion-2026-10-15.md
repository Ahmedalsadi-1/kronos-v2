# Native background desktop completion pass — October 15, 2026

## Implemented

- Native macOS background tasks now create a retained 1280x800 virtual display and bind its exact display and native Space IDs before launching apps. This replaces the previous shared-physical-desktop-only implementation.
- Newly launched task processes are placed using exact owned accessibility window IDs. Placement is verified against WindowServer display membership before enrollment. New file windows are placed on the same display and still require human approval. Existing user processes are never adopted.
- Caller identity, window IDs, native Space IDs, display IDs, freshness, foreground checks, and sticky denial of global computer controls remain enforced. A missing display host stops actions; the controller does not recreate it automatically.
- Display lifecycle has one-display capacity, bounded startup, 4/minute, 12/ten-minute and 32/day creation caps, and explicit owned-process cleanup. Released apps keep their display until they close. Released groups remain available to trusted human preview/review while agent list/control access is denied. Closed released groups are reclaimed before the next task starts.
- The management panel has explicit window previews. Captures contain enrolled windows only, do not replace the agent's snapshot, are not polled, and clear when the panel closes or a management action starts.
- Human Review pauses the agent, verifies membership, places approved windows on the physical main display and activates the app. Return moves approved windows back to the original virtual display and revalidates the original native Space boundary; it leaves the agent paused. These operations do not grant global mouse or keyboard access.
- Packaging builds and includes both signed native helpers. Known Electron application bundles are refused before launch in this quiet native path because their renderers can take focus.
- Existing workflow/canvas TypeScript test fixtures and the tool-server test's Electron dependency mocks were repaired. Added server-issued caller identity regression coverage.

## Live evidence

`dedicated-desktop-smoke.json` and `dedicated-desktop-window.png` record a real newly launched TextEdit process on the new native virtual display. Window bounds, display membership, native Space membership, background file open, enrolled-only AX observation/capture, desktop/display mismatch refusal, and unapproved-window action refusal were exercised. The final recorded foreground process remained unchanged and the task app was inactive in observed receipts. Only the identity-verified test-owned process and its display host were cleaned up. This is observed behavior on macOS 26.1 arm64, not a universal app compatibility claim or an atomic isolation guarantee.

Some earlier runs observed the human foreground changing between BrowserOS, Codex, and a development Electron app; the task-owned TextEdit process was not the observed foreground. The script now records foreground equality separately and requires that neither the task app nor the display host is the final foreground. The retained final receipt reports equality as true.

The live helper test does not exercise human review activation, successful AXValue editing, or physically dragging a window between desktops. Those management transitions have deterministic controller/IPC coverage; native placement/capture were exercised on the virtual display.

## Remaining platform limits

- Apps share the user's macOS login, files and credentials. A virtual display is attention separation, not a separate macOS login or VM. Independently granted shell execution is not sandboxed by computer-use tool restrictions.
- The supported Electron native swipe event bridge opens the in-app overview when macOS delivers it. The default system Mission Control gesture can be consumed by macOS before Electron; this implementation does not change global gesture preferences or suppress the system gesture.
- In-app workspace hue works. System Mission Control thumbnail tint remains unsupported. The public per-display wallpaper attempt returned `wallpaperApplied:false` on this host because AppKit did not publish an NSScreen for the virtual display. A desktop-panel fallback also failed exact native display verification and was removed. No physical display wallpaper or Dock process was changed. The final host retains only the optional exact-screen public wallpaper path, with explicit failure metadata.
- Native virtual display APIs are private and can change. The reference implementation reports an unresolved WindowServer/ColorSync lifecycle issue; this implementation caps creation, avoids automatic recreation and retains displays while apps are open. Limited live checks do not qualify every host or prolonged load.
- Exact ego animation timings are still unrecovered after the recorded Hopper launch failures. KronTerm browser motion uses its own documented timing and reduced-motion behavior.

## Sources

- [SpaceO source and architecture](https://github.com/ParthJadhav/SpaceO): native virtual display architecture and its stated lifecycle limitations; source inspection informed independently written implementation.
- [Apple NSWorkspace launch configuration](https://developer.apple.com/documentation/appkit/nsworkspace/openconfiguration).
- [Electron native swipe event](https://www.electronjs.org/docs/latest/api/browser-window).
- [ego task Spaces documentation](https://lite.ego.app/document/en/docs/space).

## Final validation

- MCP TypeScript build: passed after fixing strict-null narrowing in the new display placement callback.
- Native controller/display-runtime tests: 33 passed.
- Desktop bridge, tool server, management IPC, swipe, workflow and canvas fixture suites: 41 passed across six files.
- Formatting checks: passed for touched display/controller, panel/types, IPC and packaging sources.
- Both native helpers compiled and were ad-hoc signed. Build-script and packaging config syntax checks passed.
- Six panel appearance/viewport screenshots and explicit preview, approval, review, return and Escape checks passed. The additional preview screenshot uses a controlled test-window capture as a fixture; the live dedicated-display capture is a separate artifact.
- Full repository TypeScript validation uses the configured 8 GB limit. Its final disposition is recorded below; targeted success must not be read as a full-repository typecheck pass.

The full-repository TypeScript check completed successfully with exit 0 and no diagnostics after approximately 20 minutes under heavy host load. It finished just before an attempted cleanup signal, so no compiler was terminated. The final source pass is checked again below because panel/lifecycle work continued while that long check was running.

## October 16 review closure

Independent review found and closed three issues: display reservations now remain held until the owned helper's exit is confirmed (bounded TERM/KILL shutdown); failed/malformed window inventories can no longer masquerade as zero windows or remove membership; human handoff rechecks the complete current window set and background identity immediately before app activation. The panel hides closed-window removal when inventory is unverified.

After these fixes, 38 native display/controller regressions pass and the strict MCP build passes. Together with the 41 desktop suite tests, 79 targeted tests pass. The reviewed Swift helper compiled and was ad-hoc signed. Final incremental whole-repository typecheck status follows.

Final reviewed whole-repository incremental TypeScript check: passed, exit 0, no diagnostics. Final formatting check passed. Independent read-only verification confirmed closure of both native inventory and handoff findings; the display lifecycle fix has 18 runtime regressions. No native display hosts or test-owned applications were intentionally left running by the live tests.
