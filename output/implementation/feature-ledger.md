# KronTerm implementation ledger

Updated 2026-10-10. This ledger distinguishes implemented code from verified desktop behavior.

## Current implementation batch

| Area | Work | Verification |
| --- | --- | --- |
| Workflows | Editable custom dependency steps, saved definition edits/deletion, optimistic versions/history restoration, immutable run provenance, failed-write rollback | Store and execution runtime tests pass |
| Personal workspace | Removed from chat navigation, app search and widget launcher at user request; old page redirects to chat | Existing saved data retained |
| Games | Collect/dodge templates, editable parameters, keyboard/touch controls, playable preview, persisted widget project, standalone HTML download | Runtime/export tests pass; dark/light appearance captures saved |
| Browser research | Existing browser selection capture, cited persisted notebook, edits/search/comparison/context reuse and exports | Store/toolbar tests pass |
| Images | Local ComfyUI health/workflow/queue/history/owned cancellation/output adapter, dedicated image widget and trusted desktop bridge | Client and trust tests pass; no live rendering service validated |
| Media | File-backed folder asset inventory, type/path filtering, persisted location, open/reveal/attach | Classifier/search tests pass; desktop folder browsing not exercised in this batch |
| Data | CSV import, table editing, filter/sort, numeric summaries/chart, persistence and CSV export | Six tests pass; SQL/Parquet remain unsupported |
| Documents | Editable reports, stable cited sources, safe Markdown preview, revision conflicts, TXT/MD import, MD/HTML export | Five tests pass; PDF/DOCX extraction remains unsupported |
| Video | Local HTML5 playback, editable trim/captions, caption timeline, persisted settings, JSON and trimmed SRT exports | Three tests pass; rendered video export remains unsupported |
| Audio | Local playback, timed caption editing/search/seek/SRT import/export, local-file engine transcription bridge, cached-model-only inference | Caption, protocol and Python tests pass; actual speech model execution not validated |
| Blender | Installed-app discovery, native launch/open/reveal and persisted scene reference | Two tests pass; Blender is absent locally, rendering remains unsupported |

Eight dedicated widgets are available in launcher and app search: Game Studio, Image Studio, Media Library, Data Studio, Document Studio, Video Studio, Audio Studio and Blender Project. They use the existing generic notch island mechanism. Existing chat and terminal are reused. UI captures are appearance previews, not proof of live persistence or native execution.

TypeScript passes after correcting productivity imports and custom metadata types. Final validation: 85 targeted TypeScript/Vitest tests across 20 files passed; four Python transcription tests passed; scoped ESLint reported zero errors (two existing launcher warnings). This is not a production packaging or live external-service verification.

## Remaining scope retained

- Shared project context, versioned searchable artifact library and provenance across every editor.
- Durable background jobs with cancellation/recovery, capability detection and common notch/widget actions.
- Explicit selected app/monitor/page/file context, stop/takeover and reviewed permissions.
- IDE/ADE project checks, repository map, versioned documentation, completion, debugging, API testing, Git graph/blame, security and test evidence.
- Cited cross-tab research, comparison/extraction and reusable browser workflows.
- Demonstration recorder, editable skill drafts, prerequisites and verified installation.
- Workflow composition, experts/learnings, execution graph/state inspection, schedules/events and missed-run handling.
- Editable creative diagrams, storyboards and moodboards with artifact links.
- Layered video timeline, imported footage, captions/audio, targeted revisions, preview/export and clips.
- Motion keyframes, text/audio and supported Lottie/video export.
- Game scene/assets expansion, Godot adapter and explicitly hosted multiplayer dependencies.
- Image variants/transforms, reproducible workflows and batch templates.
- Blender scenes/materials/light/render/export through an installed app adapter.
- Audio transcription/search/captions, transcript editing, cleanup and provider voices.
- Documents extraction/tables/cited analysis, reports/slides/templates and exports.
- CSV/Parquet/SQL/charts/reproducible reports with optional DuckDB.
- Optional local inference/provider routing with measured quality/cost and delegation.
- Personal calendar time blocks/undo, recurring reminders, focus blocking and opt-in local activity history.
- Compact notch Ask/voice/context/tasks/workflows/record/activity/results, approvals and reusable result actions, quiet display/active hours/multi-monitor.
- Phone/hardware and hosted services remain dependent on connected devices, runtimes and credentials.

## Integration rules

Reuse existing terminal/chat; dedicated editors live in widgets and notch-connected surfaces. Use Coucou appearance. Add no Playwright stack. Preserve local changes. A missing runtime must show unavailable rather than simulate successful generation. Appearance previews are fixtures and never evidence of persistence or live app control.

## Review artifacts

- `output/games/studio-dark.png` and `studio-light.png`: playable Game Studio appearance previews.
- `output/upgrades/personal.png`: empty personal widget appearance preview.
- `output/upgrades/image-studio.png`: Image Studio appearance preview with no live service.

No dependencies were added, no Playwright was used, and no changes were committed or published.
