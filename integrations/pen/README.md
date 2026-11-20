# Pen editor host

KronOS hosts the actual Pen web editor through its shipped `?embed` protocol. The canvas, tools, layer tree, property inspector, vector editing, animations, undo stack, and JavaScript design interpreter belong to Pen. KronOS owns the document storage, host layout, appearance inputs, and agent routing.

## Stage the local runtime

```sh
node integrations/pen/stage-editor.mjs /absolute/path/to/extracted/app.asar /absolute/path/to/web/files/app.pen.dev
```

The script writes `public/pen`, a locally ignored vendor runtime. It rebases asset URLs so the editor can live below the KronOS renderer path, and adds a version-checked scene setup hook for the shared native camera. Staging fails if this exact hook is missing or ambiguous. The desktop copy supplies Pen's shipped skills and the QuickJS interpreter omitted from the original web snapshot. The interpreter was compared with the official matching web asset: SHA-256 `b790f3842eef48d154984cea48d35303b5c3c3696fedab4dc79f314bde005dba`.

The staged runtime records provenance in `public/pen/provenance.json`. These are shipped client artifacts, not Pen's unpublished source repository or backend. Vendor licensing remains separate from the Apache-licensed host code.

## Host contract

Open `pen/editor/index.html?workspace=<stable-space-id>`. The wrapper connects to the real editor using `pen:connect` and a `MessageChannel`. No file picker or import is required: `storage-load` returns a blank document until the space has saved content.

Parent requests use `{source: 'kronos-pen-host', id, method, params}`. Responses use `{source: 'kronos-pen', id, result}` or `error`. Events carry `type: 'ready' | 'changed' | 'saved' | 'error' | 'camera' | 'canvas-interaction'`. Origins and source windows are checked before requests are processed.

Supported host methods:

- `get_app_state`, `execute` (`code` or Pen's `input`, plus `edits` / `editId`): forwarded through Pen's native MCP tool calls. Native text/image response blocks and errors are preserved.
- `sync_widgets`: reconciles `{widgets:[{blockId,title,x,y,width,height,visible}],selectedBlockId?}` into native transparent frames. Returns `{success,widgets,selectedBlockIds}`. The `widgets` event reports native geometry and selection without polling. Native delete reports `visible:false`; undo restores the same live identity. A copied frame becomes an ordinary reference placeholder instead of a second owner of a running session. Proxies can group with design layers, but remain unrotated and cannot contain design children behind their live content.
- `focus_canvas`: returns keyboard focus from an interactive live app to Pen. Native double-click or Enter emits `widget-interact` with the canonical `blockId`; Escape emits it with `null`.
- `connect`: no-ID reconnect handshake. Re-emits readiness for an already initialized editor after host HMR; does not reset the document or camera.
- `get_tools`: returns Pen's actual advertised MCP schema.
- `get_commands`, `run_command`: expose the native command catalog, current availability, shortcuts, and checked state through the KronOS popup Command Center. Execution uses Pen's own action dispatcher.
- `get_settings`, `set_settings`: read and update the supported native canvas preferences through KronOS Agent settings. Values persist in Pen's desktop-profile configuration.
- `set_context`: supplies real KronOS workspaces, live widget references, and appearance to the native dashboard. Its Design Systems tab offers an editable KronOS kit.
- `update_widget_previews`: supplies validated local widget snapshots to native Slides thumbnails without changing document fills, export data, or undo history.
- `read_skill`: loads shipped Pen instructions. `name: 'index'` lists skills; relative paths such as `guide/components` are accepted.
- `save`, `export`: flush the current document; export returns editable `.pen` JSON.
- `undo`, `redo`, `fit`: dispatch Pen's keyboard shortcuts into its own document.
- `set_theme`: applies Pen's native light/dark theme notification, KronOS chrome variables, and the actual Skia canvas background.
- `get_camera`, `set_camera`: read or write `{x,y,zoom}` with screen = world × zoom + translation. The camera snapshot contains `{camera,viewport,sequence}` in outer iframe coordinates and excludes native toolbar/sidebar insets. Native camera changes and presentation transitions reach the embedding iframe synchronously when it is accessible, with a message fallback. Camera replies and events carry an increasing sequence so queued updates cannot overwrite newer positions. Host writes suppress echoes and return the native pixel-snapped result. Native canvas pointerdown emits `canvas-interaction` to release host widget selection.

Native `storage-write` persists document JSON automatically in IndexedDB, alongside a workspace-keyed asset store for imported images and fonts. Earlier localStorage documents are read as a migration fallback. Save failures leave the live editor open; export can return the latest in-memory document with a recovery warning. Exports include an asset list for a portable ZIP when images or fonts are present. No session credentials are fabricated or copied. Cloud-only features retain Pen's normal account and billing behavior. Embedded mode suppresses Pen's agent chat.

## Runtime validation

The actual staged runtime was exercised in Chromium with isolated test workspace keys:

- Blank launch, complete toolbar, Layers/Slides/Components/Libraries, no chat or required sign-in modal.
- Native `get_app_state`, `execute` creating a frame and editable text, `.pen` export, and reload persistence.
- Pointer-created rectangle saved automatically without calling Save or Export, then reloaded as a layer.
- Native Fit changed the zoom and Undo removed the inserted frame.
- Light/dark theme switch, bundled font/logo loading, and suppressed analytics consent prompt via default decline when no preference exists.

A separate isolated Electron `BrowserWindow` with `loadFile`, context isolation, and web security enabled verified blank startup, shipped skill loading, QuickJS execution, IndexedDB export, undo, redo, and persistence after reload. This verifies the packaged resource-loading mechanism; it is not an assertion that a complete KronOS release package was built or tested. The host uses relative asset paths and permits opaque `file:` message origins only for its exact parent/editor window references. Light/dark themes follow Pen's native theme API. The local scene hook lets the host override `getBackgroundColor` with the actual KronOS color used by Skia. Native `camera.on('change')`, `camera.toScreen`, and `camera.setView` drive the shared live-widget transform without polling or MCP execution. Native Layers stays on the left and Properties on the right. The outer KronOS Files/Agent panel is on the left; Sessions and workflow navigation are on the right.

Widgets accept clicks and scrolling by default. Native frame labels and edges retain canvas manipulation; the Widgets control switches to Arrange for whole-body dragging. Only browser widgets have the added navigation bar. Camera and frame geometry updates align the persistent live surfaces synchronously before React state reconciliation, avoiding an additional animation-frame delay. Native dialogs temporarily hide the live plane without unmounting sessions. Slide previews refresh periodically and retain the last clean image when a non-browser widget is obscured or offscreen.

The native Pen menu is hidden. Native command-palette and settings entry points open the existing KronOS Command Center and Agent Canvas settings respectively. Isolated Electron checks exercised the real command catalog and dispatcher, preference persistence, dashboard workspace cards, and insertion of the editable KronOS kit. The running KronOS development app was also checked for the outer panel placement, original Layers placement, direct browser scrolling, live Slides previews, command search, Canvas settings, and dashboard context.

The shared camera bridge was additionally verified against the real staged runtime in an isolated `file:` Electron window: exact set/get translation and zoom, native pan notifications, and Skia background color. `node --test integrations/pen/camera-bridge.test.mjs` checks patch guards, viewport offsets, event routing, invalid camera rejection, and echo suppression.

Live widgets are persisted as transparent native frames with `metadata: {type: "kronos-live-widget", blockId}`. Exporting `.pen` preserves editable frame geometry and these references, not terminal processes, browser sessions, or other live application contents. KronOS remains the owner of those sessions.

`node --test integrations/pen/widget-host.test.mjs` verifies identity reconciliation, native geometry propagation without echoes, delete/undo visibility, duplicate ownership protection, and interaction gating. An isolated Electron test additionally exercised actual pointer selection/drag and native undo/redo through the parent message protocol.

In the OS Canvas, the KronOS Agent and HUD buttons open Pen's native chat. The agent connection runs in the background, while KronOS retains its existing approval dialogs and workspace tool permissions. Native tool cards show progress without copying tool arguments or results into the Pen conversation history. Run settings use the active Hermes session. Parallel agents counts the coordinator plus up to four workers requested through scoped Hermes delegation, subject to the active profile and workspace grants. Variations adds a Hermes turn per variation after the initial design. The next turn starts after the previous one succeeds and uses the selected variation mode. Stopping the run discards the remaining turns.
