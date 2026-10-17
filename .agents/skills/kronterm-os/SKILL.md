---
name: kronterm-os
description: Implement, debug, review, or visually verify KronTerm OS mode, its connected shell, live application windows, project spaces, system centers, resource surfaces, appearance behavior, persistence, and typed OS actions.
---

# KronTerm OS

Use this skill for work on the KronTerm OS presentation and shared System UI layer.

## Start here

1. Confirm the repository and current branch without changing branches.
2. Read the nearest `AGENTS.md` for every directory you will edit.
3. Read `docs/os-mode/CORE_CONTEXT.md`, `UI_RULES.md`, `MOTION_SPEC.md`, and `ACCEPTANCE_CRITERIA.md` completely.
4. Read the current phase document when the task names a phase.
5. Read only the references relevant to the change:
   - `references/apple-system-ui.md` for hierarchy, materials, toolbars, sidebars, and accessibility.
   - `references/linux-desktop-patterns.md` for workspaces, launchers, tiling, status, and customization.
   - `references/component-contract.md` for React component and live-session contracts.
   - `references/visual-qa.md` for required runtime checks.
6. Use the repository `electron-best-practices` skill for Electron main, preload, permission, capture, or native-window work.

## Product contract

- OS mode is a presentation of canonical live KronTerm blocks, never a duplicate app implementation.
- Project spaces are durable work environments containing live sessions, layout, roots, app pins, activity, grants, and recovery state.
- The connected 56px top shell is the only permanent OS chrome.
- Command Center, Activity Center, Control Center, and Kronos are permanent system entry points.
- Files and Canvas are peer presentations of the same space and live block identities.
- App lifecycle and launch decisions go through the shared app registry.
- Human and agent behavior use typed `os.*` actions. Preserve `spatial.*` only as compatibility aliases.
- Never expose secrets, clipboard contents, complete terminal output, or hidden reasoning in activity history.

## Visual contract

- Use Apple system-UI principles as interaction and hierarchy references, not as a brand skin.
- Use the system font stack beginning with `-apple-system`.
- Use semantic materials. Content is opaque; translucency is reserved for shell chrome, sidebars, popovers, and temporary controls.
- Use 13px base text, 12px secondary text, 11px captions, and never render UI text below 10px.
- Use 32px compact and 36px regular controls, 40px dock targets, 44px integrated titlebars, and the 56px connected shell.
- Use 8px control, 14px window, 18px popover, and 22px shell-group radii.
- Use only window, popover, and active/floating elevation levels.
- Focus uses clarity, shadow, z-order, and active controls. Never scale, glow, tilt, or rotate focused windows.
- Overview is a flat responsive grid. Do not implement Cover Flow, perspective carousels, `rotateY`, chromatic aberration, or 3D depth staging.
- Honor light, dark, increased contrast, reduced transparency, reduced motion, and configurable accent color.
- Do not copy Apple source, SF Symbols, proprietary artwork, or third-party branding.

## Engineering contract

- Reuse `frontend/app/components/system-ui/` primitives before adding local chrome.
- Suppress nested block headers through `BlockChromeProvider`; do not hide descendants with broad CSS selectors.
- Keep `BlockView`, block ID, React key, terminal process, browser session, native surface, and Kronos session stable across freeform, grouped, maximized, minimized, overview, Files, and Canvas.
- Store only presentation state in the OS layout schema. Migration must preserve bounds, groups, objects, selection, camera, collapsed state, and z-order.
- Keep content opaque and limit simultaneous `backdrop-filter` roots to the shell plus active transient surfaces.
- Use `cva`, Tailwind, semantic CSS variables, Lucide, and native application icons.
- New user-facing copy says KronTerm and Kronos. Preserve Hermes, Wave, and Go/module identifiers where compatibility requires them.

## Required validation

- Run targeted unit tests and `task check:ts` for every implementation change.
- Exercise the app at 1920×1080, 1440×900, and 1280×800 in both light and dark appearance.
- Verify focus, maximize, minimize, snap/group, overview, Files/Canvas switching, system centers, Command Center, and Kronos inspector without live-block remounts.
- Verify visible keyboard focus, readable labels, 4.5:1 text contrast, 3:1 control contrast, zero blur under reduced transparency, and direct state changes under reduced motion.
- Treat clipped shell controls, double headers, text below 10px, detached overlays over content, or perspective motion as release blockers.
- Do not call visual work complete only because it compiles.
