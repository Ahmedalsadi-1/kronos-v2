# Hermes plugin and workspace integration

Direction: retain KronTerm's connected black frame, system UI hierarchy, neutral
surfaces, and existing workspace presentations. Energy 1, rhythm 1, motion 1.
The fluid background is an explicit user request and an exception to Taste's
usual flat-background rule. It stays subtle beneath readable chat content.

## Implemented

- Bundle NousResearch/Hermes-Bot-Mode at the commit recorded in its upstream
  README. Register its roster and routines through the Hermes plugin SDK.
- Add a pane navigation contribution after Scheduled jobs. Opening Bot mode
  reveals the existing roster pane without navigating away from the chat.
- Remove the old OpenMausBot roster portal from the workspace. Keep the existing
  VM runtime, settings, viewer, and legacy bot-session compatibility code.
  Existing OpenMausBot bots are not migrated into Hermes profiles.
- Dispose upstream profile/gateway subscriptions and avatar animation on unload;
  respect reduced motion. Use stored conversation identity for the pinned-chat
  reset guard. Keep genuine upstream behavior elsewhere and retain its MIT license.
- Replace the obsolete SDK type stub with exports from the renderer's real SDK.
- Use the Hermes project tree for local ADE browsing, including file menus,
  rename/delete dialogs, drag payloads, selection, and unsaved-file indicators.
  Keep connection-aware remote browsing. Sync selection without stealing editor focus.
- Add the supplied fluid simulation to shared chat backgrounds, with the missing
  GPU helpers, a static fallback, offscreen/hidden-page suspension, reduced motion,
  and stronger-contrast suppression. This serves panel and widget chat.
- Remove inward inspector content rounding; use the frame's color and outward
  corner fillets, including the transition below the compact inspector icons.
- Correct OS drop coordinates for the actual viewport origin, pan, and zoom.
  Dropped image references are pinned and opened through the existing preview view.
- Keep hardware controls visible while disabling competing emulator inputs during
  pending actions. Retain actual screen proportions and the existing VM viewer.

## Evidence and limits

- Focused suites: all 70 tests across eight files passed, including the actual
  upstream middleware's pinned-chat continuity and unload cleanup.
- Full TypeScript check and the production preview build passed.
- Browser previews: real upstream roster renders with clearly labeled example
  profiles; search filters it. ADE's left-click file-actions button opens the
  shared menu. Fluid reports running; light/dark previews render. Device fixtures
  support iOS/Android switching, screen connection, rotation, and keyboard controls.
- Screenshots are in output/: hermes-bots-integrated.png, ade-hermes-tree.png,
  hermes-fluid-dark.png, hermes-fluid-light.png, os-frame-integrated.png,
  ios-simulator-integrated.png, android-simulator-integrated.png.
- A generated concept board illustrates the requested sections; it is a design
  concept, not a claim of live agent execution or a screenshot of shipped behavior.
- Targeted ESLint passes for the new components and SDK. Sidebar lint additionally
  encounters the pre-existing missing react-hooks/exhaustive-deps rule definition.
- The default preview build exhausted Node's heap after 22,532 modules; validation
  passed when retried with the project's 8 GB heap convention.
- Image 1 was not attached, so the percentage markers could not be compared with
  its pixels. A full Electron session, actual Hermes profile creation/chat delivery,
  and real Android/iOS device boot and transport have not been exercised here.
