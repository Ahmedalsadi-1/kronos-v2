# Agentic OS and UI expansion plan

2026-10-06. Product direction: slick, responsive Apple-like interaction, durable project spaces, and unified desktop/browser/sandbox/mobile control. Proposed work only; no product implementation or runtime validation performed. No additional subagents used.

## Shell and responsiveness

Build on the existing System UI, app registry, typed OS actions and persistent blocks. One connected 56px shell, 44px integrated titlebars, hideable leading navigation and a contextual right Kronos inspector. Flat overview, native app icons, system font, semantic light/dark colors, opaque content and limited translucent chrome. Focus is conveyed through z-order, clarity and shadow. Preserve session identity across every presentation.

Use repository timing targets: menus 120–180ms, restore/minimize 180–240ms, overview 220–320ms, interruptible motion and direct reduced-motion transitions. Proposed measured targets: warm window switching/first palette results p95 under 100ms on agreed fixtures, next-frame shell feedback, drag/resize within a 16.7ms frame budget on 60Hz equipment. These are acceptance targets, not measured current performance. Keep terminal output, token streams and device frames from rerendering the whole shell; bound queues, batch activity snapshots, virtualize long collections and measure before optimization.

## Persistent computers and devices

Create a Computers & Devices app using one target registry. Target kinds: host desktop, browser session, Linux VM/container, remote host, iOS Simulator, Android emulator/device, and physical iPhone testing adapter. Each target owns identity, host, backend, session generation, grants, stream metadata, app/log state and capability flags.

Typed actions: list/attach/observe/tap/type/gesture/app-launch/logs/take-control/detach. Enable operations only when reported by that adapter. Keep browser DOM, native accessibility, simulator accessibility, device testing and visual control as separate backends under one user-facing model. Coordinates derive from frame metadata and current orientation. Reject stale observations and settle canceled input explicitly.

[Orca iOS guide](https://github.com/stablyai/orca/blob/main/skill-guides/orca-emulator.md) verifies booted iOS Simulator control, normalized coordinates, gestures, hardware buttons and accessibility. It notes private simulator APIs and Xcode compatibility risks. This is a simulator, not a generic iPhone VM. Its local emulator types separate iOS MJPEG and Android H.264 streams. Study session registry/start leases/gesture normalization/tests in the existing sibling checkout without modifying it. Upstream [MIT license](https://github.com/stablyai/orca/blob/main/LICENSE) checked; pin code and audit bundled helpers separately before adaptation.

[OpenMausBot iPhone companion](https://github.com/milind-soni/OpenMausBot/blob/main/docs/ios-companion.md) is a reference for phone-to-desktop pairing, scoped computer access and server-owned credentials/processes. A companion does not itself establish automation of arbitrary apps on the physical phone. Physical iPhone testing needs a separate supported XCTest/WebDriverAgent route, evaluated through [Appium XCUITest](https://github.com/appium/appium-xcuitest-driver); verify device signing/setup and supported contexts. Keep new phone-control availability in Labs until validated.

## Agent experience

Make agent profiles persistent with project, model, computer, tools and bounded memory. Show action summaries, observable execution state, evidence and outcomes. Use one shared run/event model for task inspector, overlays, notifications and phone companion; adapt [AG-UI](https://github.com/ag-ui-protocol/ag-ui) through the current runtime rather than replacing ACP/MCP blindly.

An Activity Center exposes running, waiting-for-approval, blocked, paused and completed work. Every task links to its current target, artifacts and recovery point. Prefer direct observation and typed/semantic actions; fall back to vision when needed. Verify the outcome after actions. Study [browser-use](https://github.com/browser-use/browser-use) and [UI-TARS](https://github.com/bytedance/UI-TARS-desktop) as action/observation references, with version and license checks before copying.

Human takeover acquires input ownership for that target and pauses its automation; it need not cancel the task or unrelated work. Resuming requires a fresh observation. Approval cards show exact action/target and scope. Profile memory is project-scoped and inspectable. One coordinator with bounded on-demand specialists is the default proposed policy; raise concurrency only for independent work and available resources.

[OpenMausBot](https://github.com/milind-soni/OpenMausBot) supplies persistent agent/computer/team concepts. [OpenMuse](https://github.com/CopilotKit/openmuse) supplies durable tasks, browser continuity, rich results and artifact linking. OpenMuse explicitly describes its optional computer as a Linux container; graphical desktops are future work, and its conversation service is a separate required dependency. Reuse designs selectively, not its deployment requirements. OpenMaus licensing guidance separates Apache source from other assets; review exact licenses and notices for every copied component.

## Rich outcomes

Represent research, code changes, test runs, device runs and files with typed result components that link to saved artifacts, evidence and live targets. The agent can produce a document, table, diff or test report; the user can inspect/edit/export it without hunting through the transcript. Reuse existing preview/editor surfaces. Keep agent-supplied presentation data within curated components and scoped actions.

## Delivery sequence

1. Consolidate shell/window/inspector primitives and input/focus behavior; establish performance traces and unchanged live identity.
2. Add the target registry and Computers & Devices app. Prove iOS Simulator attach/stream/AX/actions using one adapter and fixture tests.
3. Connect task runs, evidence, scoped input ownership, approvals and resumable human takeover to that target.
4. Extend the existing Labs phone companion with live task/device views and scoped approvals; desktop retains process/credential ownership.
5. Add Android and physical-iPhone testing adapters after backend/device validation; then add richer artifacts and reusable routines.

First demo: open a project, attach an iOS Simulator, ask Kronos to check an app flow, watch semantic actions and evidence, take control mid-run, resume from a fresh screen, obtain a test result, and reopen the space without losing identities. Gates: no live-block remount, no stale-target input, no duplicate helper, bounded streaming, correct rotation coordinates, Unicode typing policy, reconnect/cancel correctness, keyboard accessibility and light/dark/reduced-motion checks.
