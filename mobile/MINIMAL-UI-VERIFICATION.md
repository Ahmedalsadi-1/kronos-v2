# Minimal mobile UI verification

Scope: the new React interface, its connection to existing host APIs, and native source configuration. Native runtime verification is pending because Xcode is absent. A passing web gate is not a passing iPhone release gate.

Design read: mobile agent workspace for KronTerm users, using the approved white messenger and corner-icon concept. ENERGY 1 / RHYTHM 2 / MOTION 1. Purple two-eye agent identity is the deliberate accent; browser/monitor/device icons identify the actual tool. Terminal and editor monospace fonts serve literal code. Labs badges distinguish the experimental client and device bridge.

## Executed checks

- TypeScript and Vite production build passed.
- 37 mobile regression tests passed, including new workspace filtering, device selection, modal inertness, editor persistence, unavailable native-shell behavior, and native deep-link validation.
- Three host phone-bridge tests passed.
- Capacitor iOS sync passed.
- App/widget plists, entitlements, and Xcode project passed `plutil -lint`.
- Phone-sized browser checks at 393 x 852 and 320 x 640 showed equal viewport/document widths and no horizontal overflow.
- Browser controls, card opening, filtering, add-sheet Escape/focus behavior, files, editor, preview, and shell availability were exercised using `tests/visual-host.mjs`. It serves conspicuously labeled synthetic data only; it is not part of the app startup or production build.
- The normal development app showed an offline-host state when no actual host was listening on port 4119. No real remote engine or device was used in the visual fixture checks.

## Frontend design gate

- R-01 PASS: no new decorative gradients or glows.
- R-02 PASS: new interface copy uses plain punctuation.
- R-03 PASS: 320px and 393px browser checks showed no horizontal overflow.
- R-04 PASS: globe, monitor, device, terminal, and file glyphs identify actual tools.
- R-05 PASS: composition follows the approved chat and widget concept.
- R-06 PASS: system font for controls; monospace only for literal code/output.
- R-07 PASS: no decorative grids or dot backgrounds added.
- R-08 PASS: corner expand arrows communicate opening a surface.
- R-09 PASS: Labs identifies experimental device/client scope.
- R-10 PASS: no new glass panels in the React interface.
- R-11 PASS: cards, icon controls, and composer use different radii.
- R-12 PASS: shadow limited to the modal sheet.
- R-13 PASS: no new glow.
- R-14 PASS: preview-card proportions give live content priority.
- R-15 PASS: actions name their effect, such as Connect host and Open workspace.
- R-16 PASS: no marketing buzzwords added.
- R-17 PASS: no invented usage metrics or performance figures.
- R-18 PASS: no testimonials.
- R-19 PASS: no template entrance choreography; reduced motion supported.
- R-20 PASS: actual KronTerm surfaces and connected-host workflows establish identity.
- R-21 PASS: focused content remains the focal point.
- R-22 PASS: no stock decorative illustrations added.
- R-23 PASS: avatar and icon-navigation direction explicitly approved by the user.
- R-24 PASS: navigation uses real component state and handlers.
- R-25 PASS: light UI uses dark text; purple controls use darker foreground text for labels.
- R-26 PASS: new controls route to handlers; unavailable shell commands are disabled.
- R-27 PASS: loading, empty, offline, and error states are explicit.
- R-28 PASS: no generic FAQ added.
- R-29 PASS: native viewport and safe-area padding retained.
- R-30 PASS: preview-only fixture data is explicitly labeled and isolated from startup.
- R-31 PASS: new header/filter controls retain at least 44px interaction targets.
- R-32 PASS: focus outlines, modal Tab/Escape handling, and background inertness exercised.
- R-33 PASS: features written in source with patches; Prettier only formats code.
- R-34 PASS: approved light theme is consistent; no theme toggle introduced.
- R-35 PASS: web build run and new functional flows exercised; native runtime explicitly excluded from this gate.
- R-36 PASS: no security, compliance, customer, or performance claims fabricated.
- R-37 PASS: approved visual direction and design dials are explicit.
- R-38 PASS: live data comes from hosts; fixture data is isolated and labeled.
- C-1 PASS: visual choices follow the approved minimal concept.
- C-2 PASS: new controls have real callbacks or explicit unavailable states.
- C-3 PASS: no filler sections added.
- C-4 PASS: narrow viewport and disconnected states exercised; actual VoiceOver/Dynamic Type/native keyboard behavior still needs device verification.
- C-5 PASS: no fabricated product claims or terminal success output introduced.

## Remaining native work

Configure signing/App Group provisioning, compile with Xcode, and run on an iPhone. Verify extension registration, Live Activity display, native notifications, native shell, safe areas, and keyboard behavior. Remote APNs updates, native pause/approval buttons, and Control Center-specific controls are not implemented. See `LOCAL-IPHONE-TESTING.md`.
