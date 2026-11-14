# Pen editor host

KronOS hosts the actual Pen web editor through its shipped `?embed` protocol. The canvas, tools, layer tree, property inspector, vector editing, animations, undo stack, and JavaScript design interpreter belong to Pen. KronOS owns the document storage, host layout, appearance inputs, and agent routing.

## Stage the local runtime

```sh
node integrations/pen/stage-editor.mjs /absolute/path/to/extracted/app.asar /absolute/path/to/web/files/app.pen.dev
```

The script writes `public/pen`, a locally ignored vendor runtime. It preserves runtime logic and rebases asset URLs so the editor can live below the KronOS renderer path. The desktop copy supplies Pen's shipped skills and the QuickJS interpreter omitted from the original web snapshot. The interpreter was compared with the official matching web asset: SHA-256 `b790f3842eef48d154984cea48d35303b5c3c3696fedab4dc79f314bde005dba`.

The staged runtime records provenance in `public/pen/provenance.json`. These are shipped client artifacts, not Pen's unpublished source repository or backend. Vendor licensing remains separate from the Apache-licensed host code.

## Host contract

Open `pen/editor/index.html?workspace=<stable-space-id>`. The wrapper connects to the real editor using `pen:connect` and a `MessageChannel`. No file picker or import is required: `storage-load` returns a blank document until the space has saved content.

Parent requests use `{source: 'kronos-pen-host', id, method, params}`. Responses use `{source: 'kronos-pen', id, result}` or `error`. Events carry `type: 'ready' | 'changed' | 'saved' | 'error'`. Origins and source windows are checked before requests are processed.

Supported host methods:

- `get_app_state`, `execute` (`code` or Pen's `input`, plus `edits` / `editId`): forwarded through Pen's native MCP tool calls. Native text/image response blocks and errors are preserved.
- `get_tools`: returns Pen's actual advertised MCP schema.
- `read_skill`: loads shipped Pen instructions. `name: 'index'` lists skills; relative paths such as `guide/components` are accepted.
- `save`, `export`: flush the current document; export returns editable `.pen` JSON.
- `undo`, `redo`, `fit`: dispatch Pen's keyboard shortcuts into its own document.
- `set_theme`: applies Pen's native light/dark theme notification and KronOS chrome color variables.

Native `storage-write` persists document JSON automatically in IndexedDB, alongside a workspace-keyed asset store for imported images and fonts. Earlier localStorage documents are read as a migration fallback. Save failures leave the live editor open; export can return the latest in-memory document with a recovery warning. Exports include an asset list for a portable ZIP when images or fonts are present. No session credentials are fabricated or copied. Cloud-only features retain Pen's normal account and billing behavior. Embedded mode suppresses Pen's agent chat.

## Runtime validation

The actual staged runtime was exercised in Chromium with isolated test workspace keys:

- Blank launch, complete toolbar, Layers/Slides/Components/Libraries, no chat or required sign-in modal.
- Native `get_app_state`, `execute` creating a frame and editable text, `.pen` export, and reload persistence.
- Pointer-created rectangle saved automatically without calling Save or Export, then reloaded as a layer.
- Native Fit changed the zoom and Undo removed the inserted frame.
- Light/dark theme switch, bundled font/logo loading, and suppressed analytics consent prompt via default decline when no preference exists.

A separate isolated Electron `BrowserWindow` with `loadFile`, context isolation, and web security enabled verified blank startup, shipped skill loading, QuickJS execution, IndexedDB export, undo, redo, and persistence after reload. This verifies the packaged resource-loading mechanism; it is not an assertion that a complete KronOS release package was built or tested. The host uses relative asset paths and permits opaque `file:` message origins only for its exact parent/editor window references. Light/dark themes follow Pen's native theme API; arbitrary KronOS color variables currently affect editor chrome, while Skia may retain its built-in canvas palette.
