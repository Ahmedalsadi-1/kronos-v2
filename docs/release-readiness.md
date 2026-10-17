# KronTerm Private Beta Release Readiness

Use this checklist before calling a build finished-mode ready. It captures the product bar for KronTerm plus Hermes/KronosCode management without turning beta into a public-launch program.

## Finished-Mode Defaults

- Hermes is the primary chat surface. Its agent selector exposes Hermes and the KronosCode ACP engine.
- Use shared KronTerm appearance settings, balanced density, and concise state/action copy.
- Hermes chat uses a terminal-log transcript, hover/focus message metadata, project-context composer chrome, and smart-open inline evidence cards.
- Experimental sections must either provide a polished MVP workflow or a deliberate limited-state panel with a clear working path.

## Required Gates

- `npm test -- --run`
- `npx tsc --noEmit`
- `npm run build:dev 2>&1 | tee /tmp/kronterm-build.log`
- `npm run check:build-output -- /tmp/kronterm-build.log`

The build-output check fails on Rollup circular chunk warnings that can break execution order and on renderer chunks above the beta budget.

## Smoke Flow

- Clean launch opens a usable workspace with no blank primary pane.
- Create a KronosCode and Hermes chat, send a prompt, cancel a running turn, and start another turn.
- Make the Hermes backend unavailable and confirm chat reports the connection failure and offers useful recovery.
- Restore saved retired chat widgets and confirm they open Hermes without launching an additional chat server.
- Approve and deny one tool request; both outcomes are visible in the timeline.
- Open Settings and visit Visual, Chat, Agents, Providers, MCP, Skills, Sessions, GitHub, Desktop, Voice, and Usage.
- Open a terminal, split the layout, close a block, and restore focus with keyboard navigation.
- Open a browser block and confirm empty, loading, loaded, and failed states are readable.
- Launch sandbox/appstream preview and confirm screenshot/evidence activity appears before follow-up decisions.
- Quit and relaunch; workspace, active chat, and runtime health should recover or show a clear repair action.

## Screenshot Matrix

Capture desktop and mobile-width screenshots for each row before a private beta handoff.

| Surface           | States                                                                         |
| ----------------- | ------------------------------------------------------------------------------ |
| First launch      | clean workspace, Kronos runtime missing/repair, restored workspace             |
| KronosCode chat   | empty, terminal-log conversation, streaming, cancelled, provider/runtime error |
| Tool approvals    | pending, approved, denied, smart-open evidence, completed with evidence        |
| Settings          | overview, agent runtime, providers, MCP, GitHub, desktop/sandbox, visual/theme |
| Terminal          | focused, split, failed command with AI handoff                                 |
| Browser           | empty URL, loading, loaded page, failed navigation, agent overlay/takeover     |
| Sandbox/appstream | unavailable, launching, ready, screenshot/evidence, takeover                   |
| Canvas            | empty, populated, selected node, insert-from-chat                              |
| Experiments       | business, workflow, video, social, marketplace polished MVP or limited state   |
| Onboarding        | start, Kronos-only runtime setup, permissions, completed workspace             |
| Website           | `/website` home, pricing, download/private beta, mobile navigation             |

Every screenshot must pass: no clipped text, no horizontal overflow, no accidental blank panels, readable contrast, aligned controls, stable loading layout, and useful empty/error copy.
