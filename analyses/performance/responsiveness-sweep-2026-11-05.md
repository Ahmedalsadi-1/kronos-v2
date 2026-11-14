# Responsiveness sweep - 2026-11-05

Six subagents investigated terminal, canvas, panel motion, tab scrolling, shared widget positioning, and independent review. Existing unrelated local edits were preserved.

## Changes

- Terminal fitting ignores surfaces with zero or nonfinite drawable dimensions, preserving terminal geometry while hidden. Disposal cancels queued selection-copy callbacks.
- Canvas pans persist after a paused release or pointer cancellation. Cancellation does not start inertia. Wheel, zoom, fit, and reset stop old inertia before applying navigation.
- Panel transitions honor their requested duration and reduced-motion preference. Unregistering the active layout cancels delayed focus and transition cleanup, and clears inline transitions.
- Tab overflow metrics preserve state identity when the controls do not change, avoiding repeated layout updates during interior smooth-scroll frames.
- Inactive persistent widgets skip layout and appearance reads when no presentation slot exists. Live content remains mounted, and hidden HUD previews retain their separate path.

## Evidence

The combined focused Vitest run passed 89 tests across 11 suites. Terminal and tab regressions were also checked against original code and failed before their fixes. Shared-widget coverage mounts real components and verifies that inactive widgets perform no geometry or computed-style reads, then reactivate with the same live input. Independent code review found no actionable regression. Diff whitespace checks pass.

Post-implementation design audit: this batch preserves existing layout, colors, typography, controls, and content. Motion changes serve navigation predictability and reduced-motion preferences; no decorative animation was introduced. This is a scoped behavior audit, not a full product accessibility or design certification.

## Limits

The running app was inspected but uses a separate packaged snapshot and has an active agent task. It was not restarted. A workflow credential-decryption error was visible; that area already had unrelated local fixes and was left intact. The tests do not establish packaged-app FPS, startup latency, or end-to-end response-time improvements. Canvas wheel and zoom handlers lack rendered interaction coverage. This sweep does not establish that all product bugs are fixed.
