# 10x Analysis: KronTerm ADE and reliable agent work

Session 21 | Date: 2026-10-09

## Current value

KronTerm combines persistent terminal, editor, browser, canvas, native-app, and agent surfaces. Hermes is the current chat host; KronosCode is its ACP coding specialist. Existing terminal/chat widgets, MCP discovery, shared skills, LSP, and ACP session storage are the foundation.

## The question

How can users move from a project file to an agent-assisted, reviewed change without losing context or filling chat with development controls?

## Massive opportunities

1. **Integrated ADE**: project tree, file tabs, search, Git review, and diagnostics share Coucou appearance while terminal/chat remain independent widgets and notch surfaces. High effort, must do. Evidence: native-file-workbench.tsx, preview.tsx, codeeditor.tsx.
2. **Portable task evidence and recovery**: retain backend identity, transcript, interrupted state, and verification evidence across sessions. High effort, strong. First release implements ACP history/recovery without replay; cross-backend transfer remains deferred.

## Medium opportunities

1. **Dependable execution**: preserve pending approvals, bound restart/shutdown, and report persistence failures. Medium effort, must do. Evidence: acp-agent-manager.ts, hermes-runtime.ts, kronoscode-runtime.ts.
2. **Useful optional workflows**: import pinned Diagram Design and adapted product-management/productivity content into existing profile skills. Medium effort, strong. Evidence: scripts/import-workflow-pack.py, Hermes Skills UI. Source: https://github.com/cathrynlavery/diagram-design and https://github.com/anthropics/knowledge-work-plugins.
3. **Real activation feedback**: show current connection status and existing settings rather than simulated onboarding chat. Medium effort, strong. Evidence: onboarding-features.tsx.

## Small gems

- Attach a project file to existing chat without embedding another chat interface. Low effort, must do.
- Review actual diffs with accurate loading, failure, and empty states. Low effort, must do.
- Keep focus on the user's work during background agent activity. Low effort, must do.
- Navigate current-file diagnostics in the existing Monaco editor. Low effort, strong.

## Recommended priority

**Do now**: ADE foundation, draft/save correctness, approval/runtime recovery, all four approved UI audit findings.

**Do next**: optional workflow imports with revision/license provenance and existing profile controls.

**Explore**: reusable task recipes and cross-agent evidence portability after reliable execution is established.

**Defer**: additional memory databases, full Claude plugin compatibility, and Labs expansion. Playwright and additional browser tooling are excluded by explicit user instruction.

## Decisions

- Reuse existing terminal and KronTerm chat; keep both accessible through the notch and as independent widgets.
- Follow Coucou palettes and appearance, including active-profile preferences.
- Use optional adapters and explicit workflow invocation rather than vendoring entire projects or executing hooks on import.
- The user selected an audit before UI changes and approved findings 1-4; see anti-slop/audit-002-2026-10-09.md.
- Ten research agents covered OS UI, execution, integration architecture, upstream trends, browser seams, context/memory, reliability, onboarding, product strategy, and workflow-pack compatibility.

## Validation

Use focused regression tests for drafts, asynchronous saves, stale responses, keyboard navigation, process cleanup, approvals, transcript recovery, and pinned imports. Component fixtures must be visibly labelled; do not present fixture data as operational evidence.

Final verification: 11 focused Vitest files passed (118 tests), four Python importer tests passed, and `npm run check:ts` passed. Existing Electron captured the labelled ADE fixture in light and dark modes at 1440 and 1280 pixels; images are in `output/ade/`. No additional browser testing dependency was added. These captures verify component layout, not live backend operations. Complete upstream network installation and packaged-app operation remain unverified.
