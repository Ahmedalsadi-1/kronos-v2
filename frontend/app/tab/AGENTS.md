# frontend/app/tab — Workspace Presentations

**Parent:** `../AGENTS.md`

## OVERVIEW

Implements the five workspace presentations: tiled `widgets`, browser-style `tabs`, spatial `canvas`, desktop `os`, and full-screen `web`. Selected via `app:layoutmode`.

## KEY FILES

| File | Purpose |
| ---- | ------- |
| `widget-tabs-layout.tsx` | Tiled splits presentation (widgets mode) |
| `tabbar.tsx` | Tab strip state and rendering |
| `tabcontent.tsx` | Renders the focused block in tabs mode |
| `os-tab-groups.ts` | OS tab group state and actions |
| `os-workspace.tsx`, `os-workspace-model.ts` | Kronarchy OS-style workspace shell |
| `tabs-agent-workspace.ts` | Agent workspace integration in tabs mode |
| `folded-widgets-bar.tsx` | Bar for folded widgets |
| `tabcontextmenu.ts` | Tab right-click menus (see context-menu skill) |
| `tabbarenv.ts` | WaveEnv narrowing for tabbar components |

## CONVENTIONS

- Presentations share one persistent owner for each canonical block — never fork block state per presentation.
- Tab/tabbar state models live here and in `../store/tab-model.ts`; components stay thin.
- Tests colocated next to sources (`os-workspace-model.test.ts`, `tabs-agent-workspace.test.ts`).

## ANTI-PATTERNS

- No block creation logic here — blocks are created via `RpcApi.createBlockCommand` (see `../block/AGENTS.md`).
- Use layout models for placement and control decisions. Persistent block slots may measure rendered bounds solely to align the shared live DOM layer; observers may measure on-screen bounds for agent interactions.
