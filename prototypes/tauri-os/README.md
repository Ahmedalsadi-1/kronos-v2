# KronTerm OS Tauri prototype

This is an isolated host experiment using the existing production React OS shell, live blocks, Go backend, terminal renderer, and typed workspace surface controller. It does not replace the Electron application or migrate its data.

## Run

From the repository root:

```sh
npm --prefix prototypes/tauri-os run build:web
npm --prefix prototypes/tauri-os run build:native
npm --prefix prototypes/tauri-os start
```

This prototype is currently validated on macOS only. Requires the repository's installed npm dependencies, Rust, platform Tauri prerequisites, and the existing `dist/bin/wavesrv.<arch>` and matching `wsh` binaries. The backend binary is reused, not rebuilt. Its age must be considered when interpreting failures.

The prototype stores its own configuration and sessions in `.runtime/`. It uses loopback ports 14290 and 14291. Only one comparison host can run at a time. Quit the prototype before starting the other host:

```sh
npm --prefix prototypes/tauri-os run start:electron
```

Both hosts load the same production-built assets and native-browser adapter contract. The Electron comparison is a controlled host baseline, not the complete production Electron app. Neither comparison includes a running LLM agent yet.

## Automatic checks

After the OS surface mounts, the smoke runner uses the existing `controlWorkspaceSurface` API to launch terminal and browser blocks and arrange windows. It sends a command through the real terminal controller, checks the output inside xterm's buffer, and checks terminal identity across minimize/restore. The browser navigates to a separate fixture origin and runs a DOM button interaction. The fixture writes independent evidence to `.runtime/browser-proof.json`.

Read `.runtime/renderer-report.json` for results, failed host calls, and runtime errors. A dispatched action is not a passed end-to-end check. `prototypeControl(input)` in the workspace console exposes the same typed controller for manual testing. This verifies the agent tool execution pathway, not model inference, ACP streaming, or the full managed Kronos runtime.

First-run onboarding is suppressed in this experiment's build only; no agreement is accepted or written. Existing OS presentation sources are otherwise reused, with a build-only replacement of Electron's `<webview>` tag by the native-host adapter.

## RAM measurement

Let each host settle after the same workload. Keep window size, appearance, browser URLs, terminal output, and running services equal.

```sh
node prototypes/tauri-os/scripts/memory.mjs browser-terminal
```

The sampler records 15 one-second RSS samples for the launcher, host, Go backend, and descendants. Results go to `results/`. RSS can double-count shared pages. On macOS the sampler also records physical footprint through `proc_pid_rusage`, which includes memory costs that RSS can hide under compression. The report records system swap and load; repeat measurements under stable conditions.

On macOS, WebKit's WebContent, Networking, and GPU services may be parented by launchd rather than the Tauri process. A process-tree sum alone is therefore a **lower bound**. Independently identify all WebKit processes owned by the prototype and supply them explicitly:

```sh
KRONTERM_WEBKIT_PIDS=123,124,125 node prototypes/tauri-os/scripts/memory.mjs browser-terminal
```

Do not substitute all system WebKit processes: that includes other applications. Do not publish a RAM savings percentage without verified ownership, equivalent functional checks, and repeated measurements. Preserve the process attribution alongside any benchmark report.

## Findings from the initial functional run

The reused OS shell, typed launch/arrange actions, real terminal command/output, terminal identity across minimize/restore, and a native browser DOM interaction passed in the Tauri development run. WebKit required a `requestIdleCallback` fallback. The current OS launcher also creates terminal blocks without shell-controller metadata; the smoke test explicitly supplies that metadata and reports the workaround. These are not full OS parity or RAM results.

## Known migration work

- The browser adapter initially covers native page loading, navigation, resize, visibility, focus, and script execution. Script return values, full navigation history, partitions, downloads, popups, user-agent overrides, screenshots, accessibility inspection, and Chromium/CDP integrations are not equivalent yet.
- Native child WebViews require verification for stacking, clipping, shell popovers, overview, scaling, and Files/Canvas transitions. DOM geometry synchronization alone does not establish correct composition.
- Managed Kronos/Hermes runtimes, ACP, native app surfaces, capture, OS permission prompts, clipboard, menus, voice, pet windows, updates, signing, and packaging are not ported. Unsupported API calls throw and are recorded rather than returning preview data.
- Browser guest pages receive no desktop capability grants. Host commands accept only the `main` WebView; guests are restricted to HTTP(S) navigation.
- The local proxy authenticates the workspace with an HttpOnly same-site session cookie, validates Host/Origin, and injects the backend credential only into the backend connection. The fixture origin contains no privileged APIs.

A successful shell launch is not full KronTerm OS parity. Keep the existing Electron app until browser, terminal, actual agent sessions, native surfaces, lifecycle, accessibility, and six size/appearance combinations pass.
