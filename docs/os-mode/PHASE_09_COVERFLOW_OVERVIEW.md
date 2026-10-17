# Phase 09 — Flat System Overview

This phase replaces the retired Cover Flow direction.

## Goal

Show every live window in a flat, responsive overview grid with clear selection and direct keyboard control.

## Requirements

- Keep every live `BlockView` mounted once.
- Compute grid cells from viewport size and visible-window count.
- Keep rotation at zero.
- Preserve a traceable transform from each window's stored bounds to its overview cell.
- Arrow keys move selection, Enter focuses, and Escape returns to the prior scene.
- Trackpad/wheel behavior must not fight live application input.
- At 1280×800, previews remain identifiable and the shell remains unobstructed.

## Rejected legacy behavior

Do not implement Cover Flow, perspective, fan-out, `rotateY`, Z-depth, or scale-based selection emphasis.

