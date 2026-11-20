# KronOS / Cursor-style comparison

Preview: http://localhost:5176/

Flip-view comparison: http://localhost:5177/. This separate local review page switches between the current website at port 5174 and this variant at port 5176, using the same viewport size. It does not change either product site.

## Scope

This is an isolated comparison checkout. It uses the same KronOS content, 20 concrete page destinations, routes, media assignments, transparent logo, theme toggle, documentation search, layout tabs, FAQ, and viewport-driven muted video playback as the current website. No Cursor copy, customer claims, testimonials, product demos, logos, or imagery are included.

`public` and `node_modules` are relative symlinks to the current website. Do not edit shared assets through these links for a variant-only change.

## Running

From the repository root:

```sh
npm --prefix website-variants/cursor run dev -- --port 5176 --strictPort
npm --prefix website-variants/cursor run build
```

## Reference observations

Reference: https://cursor.com/, reviewed November 18, 2026 through public page HTML, stylesheets, and the parent's browser observation.

- Compact 56px header, centered desktop navigation, small pill download action.
- Modest, regular sans-serif hero heading with generous whitespace above it.
- 1300px content container and broad, inset product media.
- Subtly rounded neutral product cards, alternating copy/media bands, and a substantial resource footer.
- Light reference colors include `#f7f7f4`, `#f2f1ed`, and `#26251e`. This version keeps the user's requested neutral greys in dark mode.

Cursor Gothic is approximated with Helvetica Neue / Helvetica / Arial. The KronOS wordmark retains its existing Manrope typography and transparent cube. The supplied KronOS media replaces Cursor's interface demos and painted backgrounds. All original KronOS content is retained, so section lengths differ from the reference.

Design read: developer product page, restrained editorial presentation. Energy 2 / Rhythm 2 / Motion 2. Alternating product bands and broad demos reproduce the reference's reading rhythm; existing viewport-driven footage remains the only substantial motion.

## Implementation

- `src/cursor-variant.css`: scoped design overrides, desktop and mobile arrangements, both themes.
- `src/main.tsx`: imports the isolated variant stylesheet.
- `src/os-shell.tsx`: adds `cursor-site` to the root and matches the light browser theme color.

The product content modules remain byte-identical to the source website: `App.tsx`, `os-landing.tsx`, `os-captures.ts`, `os-clip-player.tsx`, and `lib/meta.ts`.

## Validation and limits

- PASS: TypeScript and Vite production build.
- PASS: source-content equality checks for the content/media modules above.
- PASS: HTTP 200 from home, documentation, capabilities, download, journal, security, and pricing destinations.
- PASS: shared assets resolve to the original website's public directory.
- PASS: parent browser verification covered all 20 routes at desktop width and 320 CSS pixels. Headings were present, with no horizontal overflow, escaping elements, empty media, or clip/type labels. The Design tab worked; the mobile menu closed with Escape; documentation search for Hermes found KronOS Agent; and empty-search clearing worked. Both light and dark themes were visually inspected. Browser QA was performed by the parent because this child session exposes no browser surfaces (`cua.getState()` returned `browsers: []`).
- PASS: the canonical preview is serving again at http://localhost:5174/ alongside this isolated variant at http://localhost:5176/.
- REA: read-only doctor ran once. No REA analysis tools are connected; Codex registration reports `config_drift`. No registration, configuration, or provider installation was attempted. Public HTML/CSS and browser evidence were used instead.

Nothing has been published or committed.
