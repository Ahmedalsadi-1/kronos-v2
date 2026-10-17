# System UI Component Contract

## Primitives

`frontend/app/components/system-ui/` owns:

- `SystemMaterial`
- `SystemToolbar`
- `SystemSidebar`
- `SystemPopover`
- `SystemMenu`
- `SystemButton`
- `SystemSegmentedControl`
- `SystemToggle`
- `SystemListRow`
- `SystemStatusBadge`
- `SystemProgress`
- `SystemWindowFrame`
- `SystemDock`

Use `cva` for component variants and semantic tokens for appearance. Local OS surfaces may compose these primitives but must not redefine the material, control-size, focus, or elevation systems.

## Appearance

`SystemUIProvider` consumes `SystemAppearanceSnapshot` from the preload API and applies:

- `data-color-scheme`
- `data-contrast`
- `data-reduced-transparency`
- `data-reduced-motion`

The feature gate is `feature:systemlayer`. The providerless OS renderer is the temporary rollback path.

## Live identity

`SystemWindowFrame` wraps the existing live `BlockView`. Never create a second renderer for Browser, Terminal, Files, Kronos, sandbox, or App Stream. Presentation changes mutate layout state only.

`BlockChromeProvider mode="integrated"` is the supported way to suppress the default block header inside an OS window.

## Sizing

| Role | Size |
| --- | --- |
| Caption | 11px, never below 10px |
| Secondary | 12px |
| Base | 13px |
| Compact control | 32px |
| Regular control | 36px |
| Dock target | 40px |
| Integrated titlebar | 44px |
| Connected shell | 56px |

## Geometry

Window layout schema version 4 preserves prior state and only clamps unreachable or undersized bounds into the shell-safe viewport. Minimum live window size is 320×220.

