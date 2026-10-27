# Hermes docking and ACP tool coverage

## Behavior

- HUD remains the default chat entry point. The HUD Dock action and chat menu's Open side panel action explicitly dock the conversation in widgets, tabs, canvas and OS modes. Return to HUD reverses the transition.
- One portal container retains the mounted Hermes app across docking. The connection remains enabled across the transition; editor focus is remembered independently of the Dock button. Session, draft, attachments, selected engine and running-task state retain their existing owners.
- The panel restores its conversation header and agent selector, keeps the transcript visible at rest, and saves keyboard and pointer resizing to the existing workspace metadata. Saved widths are reloaded on workspace changes and clamped to the viewport.
- Chat containers, controls, messages and Hermes-owned portaled menus/dialogs use square corners. Existing theme colors, typography and focus indicators remain. Unrelated workspace portals are outside the corner-style selector.

## Tool and skill coverage

`mcp-kron-term/src/tool-families.ts` groups the live scoped tool names for ACP prompts and tool discovery. Task recommendations remain separate from other discoverable families. Restricted children do not gain recursive delegation through the extra family list. Visibility does not establish permission or host readiness.

Generate the current capability matrix from the built registrations:

```sh
npm --prefix mcp-kron-term run build
node scripts/kronterm-tool-inventory.mjs
```

The inventory distinguishes registrations and unfiltered advertisement from permission and execution readiness, which remain session/runtime checks. It does not boot machines or probe native applications.

ACP shared-skill roots include configured roots, the task project's existing skill directories, development-bundled guides and packaged resources. Catalog discovery deduplicates identical IDs with the existing first-root read precedence. `kronterm-tool-workflows` covers surface selection, browser, terminal, files, LSP, canvas, native apps, Labs devices/VMs, memory and bounded delegation. `wave-surface` now describes the current bridge instead of obsolete installation paths.

## Rendered fixture

The component preview is a docking and styling fixture, not a live agent session. It uses the production portal mount, HUD frame and Hermes stylesheet. Its Chromium checks cover all four layouts, composer identity, retained draft, one active mount, square computed corner radii and narrow-window overflow.

With the preview server running on port 7007:

```sh
npx esbuild scripts/verify-hermes-docking.ts --bundle --platform=node --format=cjs --external:electron --outfile=/tmp/kron-verify-hermes-docking.cjs
./node_modules/.bin/electron /tmp/kron-verify-hermes-docking.cjs
```

Screenshots are saved under `output/hermes-docking/`. The check uses a hidden, isolated Electron profile and does not operate the user's desktop or send agent prompts.

## Verification boundaries

Completed checks:

- MCP build and full suite: 156 tests passed.
- Hermes Python tool adapter: 23 tests passed.
- Focused UI/ACP run: 36 passed, two canvas tests timed out under concurrent load. All three canvas tests then passed alone with their original five-second timeout. The final portal/engine regression run also passed all six tests.
- Hidden Electron docking fixture: all four layouts passed; HUD, OS panel and narrow panel screenshots captured.
- Per-file ESLint over 20 changed implementation files, using configured rules without loading the full TypeScript program: zero errors and zero warnings. Whitespace diff check passed.
- Full app `npm run check:ts` did not finish or produce diagnostics after more than ten minutes on the final attempt; it was interrupted. Full-app type validation remains incomplete.

Controller and portal regressions cover default presentation, session identity, editor selection/focus, unchanged subscriptions, asynchronous OS anchors and presentation changes while task-status fixtures change. Harness tests cover scoped capability advertisement and delegation exclusions. MCP tests check all registered tool families, missing harness names, tool runtime failures and skill discovery/read boundaries. Hermes adapter tests cover manifest registration and bridge behavior.

These checks do not establish real-provider streaming, live Accessibility permissions, a running language server, guest readiness or physical-phone connectivity. Those remain live integration acceptance checks. Labs capabilities retain their host/assignment requirements.

## Design rationale

Desktop workspace for technical users; retain the current visual identity with ENERGY 1, RHYTHM 1 and MOTION 1. Square corners follow the user's explicit direction. A resizable dock supports sustained reading, while the HUD remains suited to quick chat. Reusing one mounted app avoids resetting conversation state. A visible return action makes the presentation change reversible.
