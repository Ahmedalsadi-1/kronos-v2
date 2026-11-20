# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Selected direction

The user selected ChatGPT iPhone settings: neutral dark gray surfaces, rounded grouped rows, inset dividers, trailing values, and green switches. Preserve that direction. This is an isolated desktop preview; keep actual application settings unchanged.

## User refinements

- Include the full agent configuration inventory plus settings stored outside the core config, with source coverage checks.
- Use Kron product names for app-owned surfaces. Hide upstream project branding and raw compatibility identifiers in the visible interface; retain source keys internally.
- Keep the sidebar a lighter glass shade and wrap the full window in a subtle glass rim.
- Inset and round the sidebar, fade overflowing navigation rows, ease panel entrances, and use distinct semantic icons in restrained glass holders.
- The profile entry shows the editable preview name/email and opens KronProfile. Live account and runtime data remain separate from this prototype.

## Latest preferences (override earlier naming and disclosure guidance)

- No dropdowns or collapsed groups. Render every setting group expanded and every enum choice as an immediately visible radio choice.
- Use plain settings names: Profile, Models & reasoning, Notifications, Browser, and similar categories.
- Retain Kron names for distinct product tools such as KronVoice, KronRender, KronCanvas, and KronFlow.
- Provide a dedicated Integrations navigation group and landing page for providers, connections, apps/messaging, capabilities, and workspace tools.
