# KronTerm: effective add-ons and competitor gaps

Session 22 | 2026-10-10

## Current value and audit limits

KronTerm already contains terminal/chat/widget separation, an integrated ADE, LSP infrastructure, skills/MCP plumbing, review surfaces, worktrees, checkpoint code, cron/webhook routes, and usage tracking. Presence in source does not establish production readiness. This was a targeted source audit, not exhaustive backend or packaged-product verification. Recommendations below describe missing or unverified integrated workflows, not categorical absence throughout the repository.

## Recommended priority

1. Project Doctor: execute existing project checks in the existing terminal, normalize failures into clickable ADE diagnostics, and offer a scoped repair plus rerun. Add custom build-health and regression-repair skills. Medium effort, high daily impact.
2. Documentation adapter: integrate version-specific Context7 retrieval through existing MCP configuration; show retrieved provenance. Low/medium effort. https://github.com/upstash/context7
3. Repository map: incremental symbols and relationships, ranked within a context budget, visibly attached to agent requests. Adapt the design, not a second agent UI. Medium/high effort. https://aider.chat/docs/repomap.html
4. Review evidence: add structured Semgrep and project-linter findings to the existing review widget, with changed-line relevance and test evidence. Medium effort. https://github.com/semgrep/semgrep ; https://github.com/astral-sh/ruff
5. Inline completion: optional provider adapter in existing Monaco, cancellable suggestions, explicit acceptance and latency budgets. Medium/high effort. https://github.com/TabbyML/tabby
6. API Lab: requests, environments, collection execution and response assertions in its own widget. Start with Bruno CLI/collection interoperability rather than embedding its entire application. Medium effort. https://github.com/usebruno/bruno ; https://www.postman.com/product/
7. Debugger: Debug Adapter Protocol integration with breakpoints, variables, stack frames and agent runtime context. High effort. https://www.jetbrains.com/help/ai-assistant/junie-agent.html
8. Git graph: history/blame and branch/worktree relationships in the existing review surface. Extend existing worktrees. Medium/high effort. https://gitkraken.com/gitlens
9. Outcome automations: extend existing cron/webhooks with PR/CI event templates, explicit repository scope, run evidence and duplicate-event handling. Medium/high effort. https://prod.cursor.com/help/ai-features/automations

## Skills to package alongside tools

Build health, regression repair, change review, API contracts, database migrations, dependency upgrades, performance profiling and release preparation. Each should declare prerequisites and produce a concrete artifact or verified check. Some overlap with existing local skills; expose or adapt these before importing duplicates. Anthropic's examples are useful for creative/development/document workflows, but review individual licenses and runtime requirements: https://github.com/anthropics/skills

## Architectural constraints

Reuse existing terminal and chat; keep results in independently opened widgets or ADE panels. Preserve Coucou themes. No Playwright or additional browser automation tooling. Skills alone cannot provide completion, debugging or indexing; these need runtime adapters. Do not install broad repositories as if every file were a compatible skill.

## Research finding

Continue is a popular reference but its current README says the repository is read-only and no longer actively maintained. Use its ideas as reference, not a new foundational dependency: https://github.com/continuedev/continue

## Next implementation batch

Project Doctor, versioned docs adapter, repository context and evidence-backed review. Validate each against a real project task before expanding the catalog. No integration or installation performed during this research session.
