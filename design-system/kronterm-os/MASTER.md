# KronTerm OS System UI

This file documents the implemented semantic design contract in `frontend/app/components/system-ui/system-ui.css`.

## Character

KronTerm OS is calm, light, spatial, direct, and content-first. Apple system UI provides the hierarchy reference; COSMIC, KDE Plasma, and GNOME provide desktop completeness patterns. The result must remain recognizably KronTerm rather than imitate any operating system.

## Typography

```css
--kt-font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
--kt-font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
```

| Role | Size |
| --- | ---: |
| Base label | 13px |
| Secondary label | 12px |
| Caption | 11px |
| Absolute minimum | 10px |

Do not import Google Fonts. Do not redistribute SF Symbols. Use Lucide and native application icons.

## Semantic materials

| Role | Component | Behavior |
| --- | --- | --- |
| Content | `SystemMaterial material="content"` | Opaque, highest legibility |
| Window | `SystemMaterial material="window"` | Restrained translucent chrome around opaque content |
| Bar | `SystemMaterial material="bar"` | Connected shell and persistent navigation |
| Sidebar | `SystemSidebar` | Leading navigation and shallow hierarchy |
| Popover | `SystemPopover` / `SystemMenu` | Temporary elevated controls |

Only the connected shell and active transient surfaces should own `backdrop-filter` at the same time. Reduced transparency replaces all blur with opaque semantic surfaces.

## Control scale

| Token | Value | Usage |
| --- | ---: | --- |
| Small | 32px | compact titlebar and shell action |
| Regular | 36px | normal control |
| Large | 40px | dock target and primary compact action |
| Titlebar | 44px | integrated application chrome |
| Shell | 56px | connected desktop shell |

## Geometry

| Role | Radius |
| --- | ---: |
| Control | 8px |
| Window | 14px |
| Popover | 18px |
| Shell group | 22px |

Use only three elevations: window, popover, and active/floating. Focus changes clarity, shadow, z-order, and toolbar activation; it never scales, glows, tilts, or rotates windows.

## Appearance

`SystemUIProvider` applies `SystemAppearanceSnapshot` from Electron:

- `colorScheme`: light or dark
- `contrast`: normal or high
- `reducedTransparency`: removes every blur
- `reducedMotion`: removes nonessential transition duration

Accent color remains configurable through the existing `--accent-color` authority.

## Component roles

- `SystemWindowFrame`: stable OS chrome around a canonical live block.
- `SystemDock`: pinned and running apps with 40px targets and 30–32px icons.
- `SystemToolbar`: logically grouped view actions with responsive overflow.
- `SystemSidebar`: peer destinations and shallow source hierarchy.
- `SystemSegmentedControl`: mutually exclusive compact presentation choices.
- `SystemToggle`: binary setting with explicit accessible name.
- `SystemListRow`: application, command, resource, permission, and activity rows.
- `SystemStatusBadge` and `SystemProgress`: quiet status and progress language.

## Forbidden patterns

- Cover Flow, edge carousels, perspective, `rotateY`, or chromatic aberration
- scale or glow as a focus indicator
- translucent document/content backgrounds
- multiple disconnected shell bars
- detached bottom Kronos composer in OS mode
- broad descendant CSS that hides block headers
- UI text below 10px
- fake boot, login, lock, system, or package-manager screens
- Apple, Linux distribution, or third-party branding and proprietary assets

## Acceptance

- Live Browser, Terminal, Kronos, Files, sandbox, and App Stream mounts remain stable through OS presentation changes.
- Shell controls remain unclipped and at least 32px at 1280×800.
- Text meets 4.5:1 and controls meet 3:1 contrast.
- Keyboard focus is visible.
- Light, dark, increased contrast, reduced transparency, and reduced motion are independently testable.
