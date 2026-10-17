# Taby-inspired KronTerm integration

Implemented independently from observed Taby behavior. No Taby source, character artwork, or animation clips were copied.

| Capability | KronTerm implementation |
| --- | --- |
| Calm, interruptible notch reveal | Critically damped native springs and a 200ms pointer-rest gate; reduced-motion support remains active. |
| Expanding input | Native browser address input expands on focus. |
| Companion speech and reactions | Listening/speaking states, audio-amplitude motion, and newest-only reactions held until speech finishes; stale reactions expire after 15 seconds. |
| Speaking face | Native geometric face opens its mouth from delivered speech amplitude; reduced motion uses a stable pose. |
| Focus sessions | Durable start, pause, resume, extend, stop, history, completion notifications, and suspend/restart checkpointing. |
| Distraction boundaries | Optional site/app lists enforced during running focus for KronTerm-managed browser navigation and app launches. |
| Tasks and reminders | Edit, complete, delete, restore, due notifications, and snooze. |
| Habits | Daily targets, progress, undo, edit, snooze, and archive. |
| Notes | Capture, edit, search titles/content, delete, restore, and notch quick-note entry. |
| Activity history | Opt-in local agent/focus event metadata; disabling clears recorded history. |
| Agent access | `productivity_query` and `productivity_update` share the desktop journal through the authenticated MCP bridge. |
| Shared notch controls | Compact task count, focus countdown/toggle, and notes entry use the same persisted workspace. |
| Renderer readiness | Native chat readiness waits for React rendering and two animation frames; existing window readiness and bounded recovery remain in place. |

## Verification

- 69 targeted frontend/main-process regression tests passed.
- 2 MCP tool tests passed; MCP TypeScript build passed.
- Focused productivity backend and frontend TypeScript checks passed.
- Native pointer-rest regression passed; native notch compiled and its installed signature verified.
- Browser preview rendered successfully; note filtering verified through Playwright.
- Updated native build installed at `.local/coucou-hud/Coucou.app`; the prior build is retained alongside it as `Coucou.before-taby-1791625213.app`.

## Limits

Speech motion tracks amplitude rather than phoneme-specific visemes. Taby's 75 authored animation clips and Rive character are not imported; KronTerm retains its own companion visuals. Distraction boundaries do not block unrelated operating-system apps or browsers. Browser preview uses example data; persistence and commands were verified against the actual journal implementation in regression tests. A full repository TypeScript check has not returned a result; focused checks do not establish whole-repository correctness. The running desktop was not restarted, so Electron changes and the updated notch become active after a normal KronTerm restart.
