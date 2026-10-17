# 10x Analysis: Simpler, Sleeker KronTerm UI

Session 16 | Date: 2026-08-31

## Current Value

KronTerm's strongest value is continuity: the same live terminal, browser, file, app, and agent surfaces can be presented
as tiled widgets, focused tabs, or a spatial canvas. The canvas already receives normalized agent activity with block IDs,
stores task/evidence cards, and exposes typed surface controls. Browser widgets already own navigation state, while the
workspace and OS shells remain screen-space UI.

The opportunity is not another layer of chrome. It is to make the existing power feel obvious and calm:

- one place to understand where work is happening;
- one contextual navigation surface that changes with the active app;
- one compact control vocabulary across widgets, tabs, canvas, and OS mode;
- fewer persistent panels, labels, and modes competing for attention.

Evidence reviewed:

- `frontend/app/tab/workspace-canvas.tsx` subscribes to agent activity, owns the spatial camera, and currently exposes a
  broad canvas HUD and tool set;
- `frontend/app/view/webview/webview.tsx` owns browser history, reload, URL, and browser-only controls;
- `frontend/app/block/blockframe-header.tsx` is the shared widget chrome boundary;
- `frontend/app/workspace/kronarchy-shell.tsx` and `frontend/app/tab/os-workspace.tsx` implement separate global shells;
- `frontend/app/tab/workspace-presentation-switcher.tsx` and `frontend/app/tab/tabcontent.tsx` coordinate five current
  presentation values, including compatibility variants;
- `frontend/app/workspace/widgets.tsx` remains a large launcher surface in addition to command and OS launchers.

## The Question

What would make KronTerm feel 10x simpler, sleeker, and more premium without reducing its capability?

## Massive Opportunities

### 1. One Contextual Command Bar

**What**: Replace independent global, widget, and mode-specific bars with one screen-space command bar. Its left side owns
workspace and back/forward history, its center adapts to the active surface, and its right side owns agent state and
global actions. Browser focus reveals the URL field. Terminal focus reveals connection and working directory. Files show
the path. Canvas shows selection and zoom. Idle space shows only workspace identity.

**Why 10x**: Users learn one stable location. The bar becomes quieter as context becomes simpler instead of showing every
possible control all the time.

**Unlocks**: Global keyboard focus, consistent touch targets, presentation-independent navigation, and a clean path to
mobile/companion adaptations.

**Effort**: High

**Risk**: Browser controls must continue to target the correct live `WebViewModel`; moving visual ownership must not move
session ownership or remount webviews.

**Score**: Must do

### 2. Agent Camera Director

**What**: Turn canvas follow into a complete, user-controlled camera policy: follow the live widget being operated, frame
the active task card and its evidence when useful, predict the next related surface, and provide a one-click return to the
user's previous camera. Human pan/zoom pauses direction immediately. Reduced motion uses direct reframing.

**Why 10x**: Agent work becomes spatially understandable without requiring the user to hunt across an infinite canvas.
This is the memorable interaction: KronTerm shows where the work is happening as it happens.

**Unlocks**: Automation replay, presenter mode, remote watch mode, and meaningful phone handoff.

**Effort**: High

**Risk**: Over-eager camera movement will feel like lost control. The policy must be interruptible, stable within one
surface, and explicit when enabled.

**Score**: Must do

### 3. Intent-Based Workspace Scenes

**What**: Let users start from an intent such as Debug, Research, Ship, Review, or Operate. KronTerm creates a scene using
the same live blocks and automatically chooses an appropriate presentation, layout, agent sidecar position, and evidence
area. Scenes remain editable and can be saved from real work.

**Why 10x**: Users stop assembling the same multi-surface workspace manually. The product starts at the job, not at an
empty grid or launcher.

**Unlocks**: Shareable workflows, team conventions, agent-generated layouts, and a marketplace of durable task scenes.

**Effort**: Very High

**Risk**: Templates that create too much UI will increase complexity. Scenes should be sparse defaults over the canonical
block/session model.

**Score**: Strong

## Medium Opportunities

### 1. Progressive Chrome

**What**: Give each live surface three chrome densities: resting, hovered/focused, and command-active. Resting chrome
shows identity and state only. Hover/focus reveals local controls. Keyboard commands remain available at every density.

**Why 10x**: Content owns the screen while controls remain discoverable at the moment they are needed.

**Impact**: Fewer persistent buttons, less visual noise in multi-widget and canvas layouts, stronger focus hierarchy.

**Effort**: Medium

**Score**: Must do

### 2. One Launcher, Three Presentations

**What**: Merge launcher data and behavior behind one model, then render it as Command-K search, a compact favorites dock,
or a canvas insertion menu. Remove duplicate categorization and separate search logic from the Kronarchy, OS, and widget
launchers.

**Why 10x**: Every app, widget, recent item, task scene, and command appears through one predictable search and ranking
system.

**Impact**: Faster launch, fewer launcher surfaces, less configuration drift, and more consistent keyboard behavior.

**Effort**: Medium

**Score**: Must do

### 3. Focus Trail Instead of Persistent Sidebars

**What**: Replace always-open navigation panels with a compact focus trail showing workspace, task, active surface, and
current run. Each segment opens a temporary switcher. The trail preserves history without consuming a full side rail.

**Why 10x**: Users keep orientation while the primary work surface stays large.

**Impact**: Especially valuable on laptops and split-screen windows.

**Effort**: Medium

**Score**: Strong

### 4. Agent State as One Quiet System Signal

**What**: Consolidate glows, task cards, cursors, badges, and activity labels into one semantic state grammar: working,
waiting, approval, verifying, failed, complete. Use one color, one icon, and one motion rule per state across every mode.

**Why 10x**: Users understand automation state at a glance and stop interpreting several unrelated effects.

**Impact**: Higher confidence, better accessibility, and a calmer premium feel.

**Effort**: Medium

**Score**: Must do

## Small Gems

### 1. Return to My View

**What**: Save the user's camera before automation follows a widget and expose one icon to restore it.

**Why powerful**: Removes the main anxiety of automatic camera movement.

**Effort**: Low

**Score**: Must do

### 2. Browser-Only Omnibox

**What**: Render the URL/search field only for a browser surface; other surfaces use a compact title and context label.

**Why powerful**: Immediately removes irrelevant chrome and makes the active app type visually obvious.

**Effort**: Low

**Score**: Must do

### 3. Command Bar Disclosure

**What**: Keep secondary commands behind one familiar ellipsis menu and promote only the most frequent action for the
active context.

**Why powerful**: Reduces toolbar scanning without removing capability.

**Effort**: Low

**Score**: Strong

### 4. Remember Per-Surface Density

**What**: Remember whether a user prefers compact or expanded chrome for Browser, Terminal, Files, and agent surfaces.

**Why powerful**: The UI becomes personally quieter over time without adding a settings page.

**Effort**: Low

**Score**: Strong

### 5. Selection Halo, Not Borders Everywhere

**What**: Remove most static outlines and reserve a soft focus halo plus elevation change for the selected live surface.

**Why powerful**: One small visual rule improves hierarchy across every presentation.

**Effort**: Low

**Score**: Strong

## Recommended Priority

### Do Now

1. Browser-only omnibox with compact non-browser chrome.
2. Canvas camera follow with a visible pause/resume state and human override.
3. Return-to-my-view camera history.
4. Consolidate agent state colors and motion tokens.

### Do Next

1. Progressive chrome for every live surface.
2. One launcher model rendered in command, dock, and canvas forms.
3. Focus trail to replace persistent orientation sidebars.

### Explore

1. One contextual command bar backed by live surface adapters.
2. Intent-based workspace scenes generated from real user workflows.
3. Camera direction and replay as a phone/watch/presentation experience.

## Questions

### Answered

- **Q**: Should the search/address field remain global? **A**: No. It is browser state and should appear only when a
  browser is the active surface.
- **Q**: Should canvas follow force the user to watch? **A**: No. Follow should be the default during active automation,
  but direct manipulation must pause it and the state must remain visible.
- **Q**: What makes the interface feel premium? **A**: Fewer persistent controls, stable geometry, restrained motion,
  consistent state semantics, and content-first hierarchy.

### Blockers

- None for the initial browser-only chrome and canvas follow slice.
- A unified command bar needs a product decision on whether it replaces the Kronarchy shell, OS shell, or both in one
  migration.

## Next Steps

- [ ] Validate canvas follow with concurrent automations and rapid surface switching.
- [ ] Add the return-to-my-view camera affordance.
- [ ] Inventory duplicated commands across Kronarchy, OS, widget, browser, and canvas chrome.
- [ ] Prototype the contextual command bar against Browser, Terminal, Files, and Canvas adapters.
