# KronTerm OS Acceptance Criteria

## System layer

- [ ] `feature:systemlayer` switches between the new System UI and rollback chrome.
- [ ] Electron native appearance follows the operating system.
- [ ] light, dark, increased contrast, reduced transparency, and reduced motion map into `SystemAppearanceSnapshot`.
- [ ] reduced transparency produces zero blur.
- [ ] Hermes content cannot change app-wide native appearance.

## Connected shell

- [ ] one connected 56px shell contains leading, center, and trailing regions.
- [ ] Command, Activity, Control, and Kronos are permanent entries.
- [ ] dock launch/focus behavior uses the shared app registry.
- [ ] no controls clip and no target shrinks below 32px at 1280×800.
- [ ] legacy Kronarchy bar and settings toggle are absent.
- [ ] `⌘⇧Space` opens Command Center; migrated users keep `⌘Space` for one release.

## Live identity and windows

- [ ] Browser, Terminal, Kronos, Files, sandbox, and native surfaces keep one block ID and React key.
- [ ] opening system centers, overview, snap/group, minimize, and Files/Canvas does not remount live blocks.
- [ ] titlebar is 44px and no nested application header is duplicated.
- [ ] drag, resize, focus, maximize, minimize, restore, snap/group, overview, keyboard switching, and off-screen recovery work.
- [ ] overview is a flat grid with zero rotation and perspective.
- [ ] layout v3→v4 preserves bounds, groups, objects, collapsed state, selection, camera, and z-order.

## System apps

- [ ] Files has a source sidebar, integrated search, grouped list, resource actions, and optional artifact actions.
- [ ] Canvas has typed references and a contextual toolbar.
- [ ] Activity Center deduplicates events and shows progress and up to three relevant actions.
- [ ] Control Center distinguishes host permissions from agent grants.
- [ ] Kronos opens as a right inspector and can expand into a normal app window.
- [ ] OS mode has no detached composer obstructing active content.
- [ ] recovery and permission failures are actionable banners or popovers.

## Accessibility and quality

- [ ] no UI text is below 10px.
- [ ] text contrast is at least 4.5:1 and control contrast is at least 3:1.
- [ ] every icon-only action has an accessible name and visible keyboard focus.
- [ ] TypeScript, targeted Vitest, Electron/preload, Go, MCP, and existing native-surface suites pass.
- [ ] screenshots are reviewed at 1920×1080, 1440×900, and 1280×800 in light and dark appearance.
- [ ] shell plus active transient surfaces are the only simultaneous backdrop-filter roots.

