# KronOS release handoff

## Distribution model

- Private source: `Ahmedalsadi-1/kronterm`.
- Public installers and support: `Ahmedalsadi-1/kronos-releases`.
- [Public website](https://ahmedalsadi-1.github.io/kronos-releases/) is served
  from the public repository's `gh-pages` branch. Build it with
  `npm --prefix website run build:pages` and publish only `website/dist`.
- BYOK and local model setup. No KronOS account is required.
- macOS first. Windows, Linux, and iPhone availability must not be inferred from
  package targets or promotional screenshots.
- Preserve `dev.kronterm`, config/data directories, environment variables, RPC
  names, and existing storage keys. The display name is `KronOS`.

## KronOS account backend

The desktop app defaults to the dedicated KronOS Supabase Auth project
(`ymsfqbbjxnvstphjsxzx`).

- Enable Google and GitHub in Supabase Auth. Register
  `https://<project-ref>.supabase.co/auth/v1/callback` in both provider consoles.
  Keep the provider client secrets in Supabase. [Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [GitHub setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)
- Add `http://127.0.0.1:*/kronos-auth/*` to the Supabase redirect allowlist. The
  desktop app binds loopback on an ephemeral port for each OAuth attempt. [Redirect URL matching](https://supabase.com/docs/guides/auth/redirect-urls)
- Enable email sign-in, configure production SMTP, and make the Magic Link
  and Confirm signup email templates show `{{ .Token }}` as the sign-in code. [Email codes](https://supabase.com/docs/guides/auth/auth-email-passwordless) · [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp)
- To build against a different project, set both `KRONOS_SUPABASE_URL` and
  `KRONOS_SUPABASE_PUBLISHABLE_KEY` when compiling the Electron main process. The
  publishable key is safe to ship. Keep service-role keys, provider secrets, and
  SMTP credentials on the backend.
- Verify all three providers in a fresh app profile and verify session restore
  and sign-out in that profile before distributing a signed build.

## Diagnostics without a service

`emain/diagnostics-store.ts` keeps a bounded local history of failure categories
and shipped JavaScript code locations. No messages, console breadcrumbs, request
bodies, credentials, terminal output, or user paths enter the report. No upload
endpoint exists. Settings > About provides preview, copy, refresh, and clear.

Support issues are submitted by users to the public download repository. This
requires a GitHub account and is not automatic crash notification. Automatic
delivery would require a receiving service; it is intentionally absent.

When triaging, group by app version, source, kind, and code location. Reproduce on
the same version. Keep source maps in private build artifacts for local analysis;
the app package excludes `.map` files. Never request a user's provider keys.

## Release procedure

1. Run `npm run check:ts`, targeted Vitest, production and website builds.
2. Run the supported `task package` pipeline on the intended release machine.
   It stages current MCP/plugin bundles and uses an isolated dependency-free app
   manifest for packaging. This avoids scanning the development workspace or
   packaging development dependencies. `node scripts/package-kronos.mjs --mac dir
   --arm64` creates a local application bundle after a build; omitting `dir` builds
   the configured installer targets. This command never publishes automatically.
   Do not publish old `dist/bin` artifacts as if they came from the current source.
3. Check a fresh profile with no inherited developer keys: first launch, provider
   validation, first message, cancellation, restart, and workspace restore.
4. Verify terminal/browser identity when reopening a KronOS v2 workspace and test light/dark,
   reduced motion, reduced transparency, keyboard focus, and 1280/1440/1920 widths.
5. Use an Apple Developer ID Application identity and notarization for public macOS
   installers. After building and staging the release runtime, run
   `node scripts/package-kronos.mjs --production` for Apple silicon DMG and ZIP.
   It requires a Developer ID Application identity in Keychain before building
   and checks the packaged app with `codesign`, `spctl`, and `xcrun stapler`.
   It also checks the updater manifest against the ZIP and writes `SHA256SUMS.txt`.
   Successful output is written under `make/kronos-production/`.
   Verify that the app inside the final disk image passes the same checks.
6. Include architecture-matched DMG/ZIP files, blockmaps, update metadata, SHA-256
   checksums, installation instructions, known issues, and third-party notices.
7. Publish only reviewed binary artifacts to the public releases repository.
   Never push this source tree, source archives, local profiles, logs, or keys.
8. The updater uses the public repository, so installer names, metadata, and
   version must agree. Verify an actual upgrade before calling auto-updates ready.

## Component sources

- [Base UI](https://base-ui.com/react/overview/accessibility): accessible menus,
  dialogs, popovers, focus handling, and keyboard navigation.
- [cmdk](https://github.com/dip/cmdk): command search and keyboard navigation.
  Already installed; reuse the existing command palette rather than introducing
  another command system.
- [Lucide](https://lucide.dev/guide/react/basics/sizing): consistent interface
  icons, sizes, and stroke weights. Retain native app icons and the existing
  licensed solid OS icons where they communicate application identity.

The polish direction retains the existing black connected shell and restrained
accent. Spacing separates workspace navigation, the live composer, and system
actions. Targets are at least 32px; agent access is 40px. Interaction motion is
brief, with no hover movement. ENERGY 1 / RHYTHM 1 / MOTION 1.

## November 7 validation

Published: [KronOS 0.14.3 public preview](https://github.com/Ahmedalsadi-1/kronos-releases/releases/tag/v0.14.3).
The public release contains DMG, ZIP, and SHA-256 checksums. The source repository
remains private. GitHub marks this as a pre-release; no production-ready claim is made.

- TypeScript: clean after correcting pre-existing window-event listener and
  workflow-step type errors.
- Frontend/Electron: 319 files, 1,713 tests passed.
- MCP: 164 tests passed. Build-output guards: four tests passed.
- Production build, website build, backend build, and focused lint passed.
- The isolated packaging manifest avoided the development-tree collector's heap
  failure. Native binaries and schemas are copied as loose resources to their
  compatibility paths. `afterPack` now rejects missing backend/MCP/plugin/license
  resources, preventing the observed first-install backend failure.
- A local packaged test profile opened welcome, entered the workspace, rendered
  a browser, and opened model selection. Existing global provider configuration
  can be discovered, so this does not certify an entirely credential-free machine
  or a successful paid provider request.
- Preview control dimensions were measured at 1280 and 1920; no shell action was
  below 32px after refinements. Light/dark and accessibility states were reviewed.
- Public distribution is a macOS ARM64 preview with explicit risks. Developer ID
  signing, notarization, independent-machine installation, automatic upgrades,
  and comprehensive integration validation remain outstanding.

## November 8 validation

- Published the website to the existing public GitHub repository and verified
  all 23 page entry points and the public DMG link. The site identifies the
  currently downloadable build as a preview.
- The workspace executable inside the published DMG targets macOS 26. The
  website and release notes now list macOS 26 as the preview minimum.
- Desktop startup now reports local workspace failures and times out after
  60 seconds if the process never signals readiness. About and onboarding link
  to the live website.
- The production packaging command correctly stops on this Mac because Keychain
  has an Apple Development identity and lacks a Developer ID Application identity.
  The public desktop installer remains the November 7 preview.

## November 19 public preview

- 0.14.5 bundles the approved grey onboarding assets and uses the same welcome
  document for the in-app sign-in popup. The popup retains Google, GitHub, and
  email-code controls and closes after successful sign-in. The personal inbox
  capture is replaced with a sample inbox in the distributed assets.
- The compact 400 x 490 installer uses the KronOS cube icon and silver chrome
  artwork, with Retina artwork and native draggable application items.
- This is an intentionally ad-hoc signed, non-notarized preview, authorized for
  public distribution with explicit first-launch instructions. Use
  `KRONOS_ADHOC_BUILD=1 node scripts/package-kronos.mjs --mac dmg zip --arm64`
  after building and staging the current runtime. The verified `--production`
  path still requires Developer ID signing and notarization.
- TypeScript, account/browser/import tests, onboarding origin/path tests, native
  popup validation and sign-in, DMG integrity, deep signature verification,
  bundled popup-content checks, and updater ZIP checksums passed locally.
- The release is an Apple silicon/macOS 26 preview. Notarization, installation
  on another clean Mac, and automatic upgrades remain unverified. Email delivery
  depends on the auth project's sender configuration; no Resend setup was requested.
