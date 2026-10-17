# Phase 04 — System UI Visual Polish

## Goal

Bring the implemented OS surface into one coherent system language without changing live block behavior.

The legacy image `references/04-primary-worksurface-detail.jpeg` can be inspected for broad content-to-chrome proportion only. It is not authoritative for perspective, detached overlays, font choice, or material density.

## Polish targets

- 56px connected shell and responsive three-region composition
- 40px dock targets and 30–32px app icons
- 44px integrated titlebars with no duplicate block headers
- semantic content, window, bar, sidebar, and popover materials
- 13/12/11px type scale with no text below 10px
- 8/14/18/22px concentric radius system
- only window, popover, and active/floating elevation
- calm focus through clarity, z-order, toolbar activation, and shadow
- opaque application content and limited blur roots
- right-side Kronos inspector and shell-anchored system centers

## Required states

Capture focused Browser, focused Terminal, grouped windows, flat overview, Files, Canvas toolbar, Command Center, Activity Center, Control Center, and Kronos inspector at 1920×1080, 1440×900, and 1280×800.

Repeat in light and dark appearance. Verify increased contrast, reduced transparency, and reduced motion.

## Rejection criteria

- perspective, window rotation, Cover Flow, glow, or chromatic effects
- disconnected bars or fake system controls
- clipped shell controls
- translucent app content
- duplicate headers
- detached composer over active content
- UI text below 10px
- invisible keyboard focus

The phase is complete only after runtime screenshots and interaction checks, not compile success alone.
