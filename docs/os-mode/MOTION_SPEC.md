# KronTerm OS Motion Specification

## Principles

1. Motion communicates continuity of one persistent live surface.
2. Pointer drag and resize remain 1:1 while grabbed.
3. Use transform and opacity for short presentation transitions; avoid layout-shifting hover effects.
4. Never hide a remount behind animation.
5. User input immediately interrupts automated camera or agent-directed movement.
6. Reduced motion changes state directly and preserves focus visibility.

## Timing

| Transition | Target |
| --- | ---: |
| Menu or popover enter | 120–180ms |
| Focus/restore/minimize | 180–240ms |
| Snap or group | 200–280ms |
| Overview enter/exit | 220–320ms |
| Workspace switch | 180–260ms |
| Kronos inspector | 180–240ms |

Use a no-overshoot curve near `cubic-bezier(0.2, 0.82, 0.2, 1)` for primary transitions. Do not use long cinematic springs.

## Focus

A focused window rises through z-order, material clarity, shadow, and toolbar activation. Geometry changes only when the user explicitly maximizes, snaps, groups, or selects a focused scene.

## Overview

Overview lays windows into a flat responsive grid. Each live surface translates and scales only enough to reach its grid cell. Rotation is always zero. Enter and exit preserve a visually traceable origin.

## Kronos

The shell entry opens the right inspector. The work surface makes room through a short horizontal layout transition. Expanding Kronos into a window preserves its session identity.

## Reduced motion

- Set transition and animation duration to effectively zero.
- Keep drag, resize, scroll, focus rings, and state indicators functional.
- Do not replace removed movement with flashing, glow, or sudden opacity pulses.

