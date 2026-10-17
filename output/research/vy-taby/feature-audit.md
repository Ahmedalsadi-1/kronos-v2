# Vy and Taby feature inventory

Research date: 2026-10-10. Scope: supplied Vy application static inspection and Taby/Vy public research. No product implementation, account access, application execution, or private session inspection.

## Evidence and coverage

- V1: `/Applications/Vy.app/Contents/Resources/app.asar`, package metadata: Vy / vy-tron 0.7.10, Electron/Vite, React, proprietary package license. SHA-256: `2f453cf58a82f705ae8f69808f08bc41876ca834443412fb6ad08f721ad89d9b`.
- V2: `.vite/build/preload.js`: 32 exposed bridge names and 231 distinct colon-delimited channel literals. Parsed inventory in `vy-interface-inventory.json`. This establishes client interface declarations, not live backend behavior.
- V3: `.vite/build/main.js` loads bytenode `main.jsc`; source is not recovered. Native input/defocus helpers are packaged, but exports and runtime behavior were not analyzed.
- V4: `.vite/renderer/main_window/assets/index-DPVKNio2.js`: structural references to blueprint block states, iteration maps, variables, run-all states, workflow sessions and learnings. Renderer labels are obfuscated; generic matches from libraries are not feature proof.
- V5: packaged `onboarding.json`: role/interests, app permissions, feature overview, model selection and Full Control Mode onboarding.
- V6: REA broad analysis initially rejected a declared-integrity mismatch for the unpacked sharp native dependency. Record-and-continue was requested, preserving the limitation; no application integrity was repaired. Difference may follow post-packaging changes/signing, but cause is unknown.
- Broad REA parsing was stopped while processing the large obfuscated renderer; no completed REA Evidence record was produced. Findings above come from the separate focused static inspection, not a completed whole-application decompilation.

No claim of full source recovery. Hosted orchestration, model weights, training data, account entitlements and present-day service operation remain unknown. Feature parity can be designed independently; original implementation cannot be assumed available.

## Vy: locally declared capability families

| Feature | Local evidence | Confidence boundary |
| --- | --- | --- |
| Conversational tasks | chat send/interrupt/stop/history/feedback channels | Client contract, execution unverified |
| Full computer control | Full Control onboarding and active-full-control stream API | Client contract and onboarding |
| Background browser | show-background-browser and user-prompt-response channels | Interaction surface, browser backend unknown |
| Teach by demonstration | watch overlay, existing Watch and Repeat recordings, video validation, workflow-from-entry and upload channels | Recording/import workflow contract |
| Reusable workflows | create/update/archive/sync/get-sessions | CRUD and history contract |
| Workflow composition | Vendor announcement describes composing referenced workflows | Public claim, no local execution test |
| Scheduled workflows | list/get/create/update/delete/pause/resume and execution records | Detailed client contract |
| Task queues | enqueue, countdowns, missed scheduled runs and cancellation metadata | Client contract |
| Historical resume | resume-historical-stream, stream/history APIs | Client contract |
| Experts | create/update/archive and expert-session listing | Client contract |
| Editable expert learnings | create/update/archive/sync learnings | Client contract |
| Editable workflow learnings | corresponding workflow learning APIs | Client contract |
| Blueprint projects | blueprint CRUD and renderer block/iteration/variable/run-all state | Structural evidence; branching semantics unresolved |
| Human responses | learning approval, expert creation, mode switching and browser prompt responses | Client contract |
| App access control | app list and individual/all allowed settings | Policy UI contract; enforcement unverified |
| Folder access control | directory select/add/update/remove | Policy UI contract; enforcement unverified |
| OS access onboarding | accessibility, screen recording and automation check/request APIs | Client contract |
| Recording management | storage limits, disable, clear, list/read and reveal recordings | Client contract |
| Multi-monitor selection | list/primary/selected monitor and display-changed | Client contract |
| Screenshots | source listing and capture | Client contract |
| File uploads | upload/get URL/delete | Client contract; service availability unknown |
| File exports | save text and URL with dialog | Client contract |
| Prompt assistance/code tools | prompt helper conversation; execute-code and rewrite-with-Claude | Client contract; isolation/provider unknown |
| Keyboard shortcuts | validate, configure/reset, map to workflows, pause/resume | Client contract |
| Floating UI | spotlight, pin state, compact/large view, overlays, inactive show, child windows | Client contract |
| Theme | light/dark/system and change events | Client contract |
| Setup/support | role/interests, onboarding progress, diagnostics, feedback screenshot, updater | Client contract |
| Authentication | auth status/signout/legal acceptance/min-version checks | Client contract; credentials not read |
| Data preferences | training-data opt-in setting | Client contract, actual policy unknown |

Public corroboration:
- https://www.linkedin.com/posts/vercept_just-show-it-once-vy-watches-you-do-a-task-activity-7331697221433737218-FAtn
- https://www.linkedin.com/posts/lucaweihs_huge-update-have-vy-watch-you-do-a-task-activity-7331705619038507011-pYIk
- https://www.linkedin.com/posts/vercept_scheduled-workflows-are-now-supported-in-activity-7335723666426531842-CFYh
- https://www.linkedin.com/posts/vercept_you-asked-we-listened-its-here-were-activity-7419778337436364801-5ytL
- https://vercept.com/ currently announces joining Anthropic, dated February 25, 2026. This is not proof the supplied installed service still works.

## Taby: documented product inventory

Official sources: https://www.heytaby.com/features ; https://www.heytaby.com/changelog ; https://www.heytaby.com/docs ; https://www.heytaby.com/voice-assistant ; https://www.heytaby.com/day-planner ; https://www.heytaby.com/focus ; https://www.heytaby.com/habit-tracker ; https://www.heytaby.com/notes ; https://www.heytaby.com/reminders

### Published core features

- Local/offline AI, free desktop use without an account; Mac and Windows.
- Local Brain documented as tuned Qwen 3.5 4B via llama.cpp. Main local STT is Parakeet on supported configurations; no required Ollama installation.
- Voice and typed requests; spoken/displayed replies. App in 14 languages; specific voice documentation states eight local input languages and eleven output languages.
- Tasks/to-do lists, reminders including recurring reminders, notes and natural-language retrieval, habits and daily goals.
- Habits support counted or once-daily completion, selected weekdays, pause, reminders, current/best streaks and 12-week history.
- Calendar integration with Google, Outlook and Apple Calendar on Mac; day/week views, free-time planning, recurring time blocks, calendar event changes and undo.
- Activity history of apps/sites; questions about time use and focus patterns; local history according to vendor.
- Focus timer/Pomodoro, breaks, distraction nudges, app/site blocking, scheduled recurring blocks, unblock controls and sleep-aware timers.
- Notch/top-of-screen companion, hideable face/text-only entry, calm animations, multi-monitor positioning, theme controls.
- Active hours control water/break/focus nudges; daily goal completion feedback.
- Claude Code/Codex completion and attention notifications.
- Review surface for AI suggestions about tasks/reminders/notes/folders/activity (changelog).
- Online web search and browser assistance; local offline capability does not imply offline internet actions.
- Website lists image understanding, editing and generation. Plan placement is incompletely represented by extracted checkmarks; cloud generation is explicitly described in voice documentation.
- Optional Cloud: bigger model, enhanced multilingual voice, personalities, phone web app and vendor Zero Data Retention claims. Privacy assurances were not independently audited.
- Optional physical companion in Circle/Rectangle forms; DIY guide, firmware update/repair, USB-C diagnostics and brightness configuration.

### Developer Preview integration surface

- Named local connections, permission-based tool discovery, per-connection revocation/rotation, redacted action logs.
- REST and Streamable HTTP MCP through a loopback listener; docs currently specify 15 REST paths/18 operations and 16 MCP tools when all permissions are granted.
- Status, approved animation discovery/play, digital/physical cards, asynchronous two-choice prompts with poll/cancel.
- Read-only local-Brain questions through the integration API.
- Task list/read/create/update/complete/reopen/trash/restore; recoverable 30-day trash.
- Inbound only: external agents invoke Taby. Its Brain is not currently an outbound MCP client according to docs.

### Explicitly upcoming or unsupported

- Homepage marks video generation, general actions in other apps, additional screen display functionality and custom pages as coming soon.
- Native phone store apps are described as later; a cloud web app exists.
- Voice page explicitly says Taby is not a general dictation tool for other apps.
- Focus page explicitly excludes phone app blocking.
- No Taby binary was supplied or installed in the inspected app inventory; these are public documentation claims, not reverse-engineered code.

## Independent reconstruction model

Treat each capability as a specification: inputs, editable state, actions, output artifact, interruption behavior and verification. Reimplement with KronTerm's own surfaces and supported libraries, reusing terminal/chat/notch/widgets. Do not assume possession of Vy model weights, hosted services or proprietary source. Do not add Playwright. Local runtime behavior and exhaustive feature completeness require a separate authorized live-validation pass.

## Next decision

User will choose the implementation scope after this inventory. No build or integration has been started.
