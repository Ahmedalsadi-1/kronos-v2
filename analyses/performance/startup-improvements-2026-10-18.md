# Startup performance changes - 2026-10-18

## Scope

First implementation batch from `system-audit-2026-10-18.md`: Hermes preparation, the shared Markdown highlighter's eager dependency, and build-output verification. No language migration, feature removal, stream-quality reduction, session reset, or application restart.

## Changes

- Hermes resolves its PATH fallback and probes Python asynchronously. Plugin links and adapter copying use asynchronous filesystem operations. Preparation stages a complete tree, retains existing providers when discovery is unavailable, serializes overlapping preparations per destination, and restores the previous tree on failed or cancelled publication. Startup checks its generation again before writing configuration and launching the backend.
- The shared Markdown code renderer imports Shiki on the first code-block highlight rather than when its module is imported. It retains the same language bundle and theme, displays readable code while highlighting loads, ignores stale results, and cancels pending throttled calls without breaking React StrictMode replay.
- Renderer chunking gives Vite's shared preload helper a separate small chunk, preventing Rollup from placing it inside the optional grammar bundle and making that bundle an eager bootstrap dependency. A focused Rollup regression uses the actual chunk configuration and verifies this dependency pattern.
- Build-output checks inspect emitted JavaScript files directly. Empty build-log input no longer bypasses chunk budgets, and missing renderer assets fail validation. Existing runtime-artifact, source-map, and circular-chunk log checks remain.

The highlighter change removes one eager import path. It is not proof that every path to Shiki or every heavy renderer dependency is lazy in the final application bundle. Monaco and other eagerly registered views remain separate work.

## Evidence

Regressions failed before implementation for synchronous plugin publication, eager grammar import, unreadable pending code, oversized/missing renderer output, provider preservation during failed discovery, and StrictMode replay. Updated targeted suites pass, including concurrent preparation, failure rollback, cancellation at three publication checkpoints, a delayed real subprocess probe, stale highlight completion, and unmount cleanup.

An independent code review identified the provider-preservation and StrictMode cases; both were reproduced and fixed, and the re-review found no remaining actionable issues in this batch.

The delayed subprocess test verifies that a timer runs before the probe completes. It establishes event-loop availability under that fixture, not a measured reduction in total Hermes startup time. No end-to-end latency or FPS improvement is claimed.

Targeted validation: 68 Vitest tests passed across eight suites, plus four Node build-check tests and one focused Rollup chunk regression. Machine-readable output for the original eight-suite run is in `/tmp/kronterm-startup-improvements-tests.json`. ESLint reported zero errors and one existing unused `toolServer` parameter warning in the runtime; formatting and diff whitespace checks passed.

The full application TypeScript check passed (`npm run check:ts -- --pretty false`). It started before the final standalone Rollup fixture was added; that fixture was exercised successfully by Vitest. The production baseline build passed and its desktop bootstrap static JavaScript closure measured 57.10 MiB across eight files, including the 19.04 MiB Shiki chunk. The baseline output contains the pre-change highlighter and does not validate the final renderer implementation.

Final production rebuilding and emitted-graph confirmation are blocked by disk exhaustion: the shell returned `no space left on device` when opening the build log. A subsequent `df` showed the Data volume at 100% with approximately 102 MiB available. Task-created logs/test artifacts are too small to provide useful headroom. No user files, session data, or running-renderer caches were deleted, and the running app was not restarted. Final bundle loading and end-to-end performance remain unverified until disk headroom is restored and the final source is rebuilt.

## Remaining work

- Capture controlled production startup and first-use measurements and inspect final emitted dependency graphs.
- Separate Monaco and optional heavy view implementations from eager bootstrap dependencies.
- Handle disconnected command admission, cancellation, ordering, and draining as one correctness-preserving transport change.
- Investigate bounded LSP query-session reuse with document freshness and workspace isolation.
- Measure large workflow journals before changing persistence, preserving acknowledgement, rollback, and recovery semantics.
- Replace model-discovery polling with lifecycle subscriptions that handle replacement and removal.

Existing unrelated local changes were left in place. This document describes a bounded implementation batch, not completion of every audit finding or release certification.
