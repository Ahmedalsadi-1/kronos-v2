# KronOS identity

`kronos-mark.svg` is the compact center mark. `kronos-expanded.svg` is the
three-shape expanded mark supplied for KronOS. Both contain the light theme
purple artwork and dark theme silver artwork. Keep these masters together.
The standalone `*-light.svg` and `*-dark.svg` files force one appearance.

The OS sidebar uses the expanded mark while its workspace panel is open and
the center mark when collapsed. About uses the expanded mark; compact app
surfaces use the center mark.

Run `node scripts/generate-brand-assets.mjs` after updating the masters. It
refreshes desktop, onboarding, documentation, website, PNG, ICO, and ICNS
assets. Native app icons use the supplied purple center mark with transparent
padding. Both `mac.icon` and `dmg.icon` in `electron-builder.config.cjs` point
to `build/kronos.icns`.

Rebuild installers to distribute the changed app icon. Published downloads
and existing installed applications retain their icon until replaced.
