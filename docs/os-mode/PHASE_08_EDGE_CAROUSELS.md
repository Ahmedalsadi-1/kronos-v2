# Phase 08 — Responsive Shell and Application Overflow

This phase replaces the retired edge-carousel direction.

## Goal

Keep the connected shell usable from 1920×1080 through 1280×800 while preserving 32–40px hit targets.

## Requirements

- Preserve leading identity/spaces, center app dock, and trailing system controls as one 56px container.
- Move lower-priority apps into overflow as width narrows.
- Keep running and minimized state visible without duplicating app instances.
- Keep labels only when space permits; icon-only controls require accessible names.
- Verify keyboard navigation and drag-to-space behavior.

## Rejected legacy behavior

Do not implement edge cards, perspective rails, rotation, depth staging, or separate live preview mounts.

