# KronOS settings preview

Interactive ChatGPT iOS-inspired desktop settings exploration. Start with `npm run dev -- --host 127.0.0.1 --port 7012 --strictPort`. Validate with `npm run build`.

Changes persist only in this origin's localStorage under `kronos-chatgpt-settings-preview-v1`; Reset preview clears those sample preferences. No Electron API, real account data or live configuration is connected.

Content sources:
- Hermes: frontend/hermes/app/settings/constants.ts, appearance-settings.tsx, model-settings.tsx and lib/personalities.ts.
- Pen: integrations/pen/settings-host.js; src/pen-fields.json copies the field definitions.
- Browser: frontend/hermes/app/settings/browser-settings.tsx and user-supplied browser menu screenshots.
- Workspace: pkg/wconfig/defaultconfig/settings.json.
- KronFlow: integrations/n8n/upstream/packages/workflow/src/interfaces.ts workflow settings.
- KronRender: ComfyUI workflow generation inputs, presented as a proposed workflow settings page rather than existing global preferences.

Review evidence and scope are recorded in design-qa.md. Some interface preferences and provider values are representative samples. The preview uses actual setting concepts; it does not claim every control is already available through one production settings API.

## Expanded catalog

`npm run sync:settings` rebuilds the source snapshots. `npm run verify:settings` renders every page and checks search coverage, source Go-field coverage, links, product branding, and the absence of dropdown/disclosure controls.

The preview currently contains 1,450 catalog fields across 41 pages. It includes the complete agent default tree, desktop settings schema, 153 environment entries, 137 pinned render core settings, 19 workflow settings, 18 canvas fields, and 50 static interface controls. Keyboard shortcuts and runtime-collection editors are additional surfaces.

The final navigation uses ordinary category names, retains Kron product names for distinct workspace tools, and includes Integrations. All settings sections and enum choices remain visible. Dynamic account, billing, provider, session, and installed-plugin data are not fetched by the prototype.
