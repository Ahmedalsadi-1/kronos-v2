# KronOS identity

`kronos-mark.svg` is the vector master of the selected 04-E folded cube.
Its three filled shapes preserve the top diamond and interrupted ribbon.
Use `currentColor` for inline marks; the standalone light and dark variants
are black and warm white, respectively. Do not add strokes or fill the gaps.

Run `node scripts/generate-brand-assets.mjs` from the repository root after
changing the master. This refreshes the website favicon and product marks,
shared desktop and launcher mark, onboarding mark, docs marks used in the
app, PNG sizes, Windows ICO, and macOS ICNS. The installed icon uses a
warm white tile so it remains visible on light and dark desktops.

Deploy the website and rebuild the installers to distribute the new branding.
Existing installed applications and published downloads keep their previous
icons until replaced by a new build.
