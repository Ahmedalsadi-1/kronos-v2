# KronTerm for iPhone

**Status:** KronTerm Labs. This client is implemented for development and product validation, but it is not part of the
macOS private-beta distribution or a general App Store release.

KronTerm for iPhone opens directly into its native agent chat. The native React agent conversation uses the selected host API; Browser, Workspace, Files, Code, Terminal, and Preview are secondary surfaces opened only when the task needs them. A focused pane fills the iPhone screen, and The agent conversation and Workspace are one tap apart.

KronosCode remains the single AI engine across desktop and mobile. See the [project README](../README.md) for the desktop
capability and availability map.

The Phase 1 Auto planner classifies each objective. File edits, JavaScript, WebAssembly, and previews target the iPhone. Linux-specific work targets Local Linux. Docker, databases, large Node projects, Rust, and Go target Kron Sandbox. A personal Mac, Windows PC, Linux machine, or SSH host remains optional.

The app ships as both an installable offline PWA and a Capacitor iOS app. The iOS project supports deeper native work such as Keychain storage, haptics, notifications, and a future QEMU-SE runtime.

## Current product slice

- The mobile interface follows the approved minimalist concept: light chat, purple agent avatar, icon-only widget cards, a focused Workspace, and compact Browser/Sandbox controls. Actual host screenshots populate previews; missing frames remain explicit empty states.
- Local files, editing, HTML preview, and native shell access use the same light interface. The native shell reports actual output; browser previews do not simulate builds or tests.
- The iOS project includes a WidgetKit extension, a foreground-created Live Activity for Dynamic Island and Lock Screen, and opt-in local task notifications. Native compilation, provisioning, and device verification remain pending; server push updates are not implemented. See [local iPhone testing](LOCAL-IPHONE-TESTING.md) and [native setup](ios/App/KronTermWidgets/README.md).

- Native agent chat owns the launch experience. The workbench is an explicit secondary destination rather than the app's home screen.
- Browser, Sandbox, and device surfaces open from compact workspace cards. Local files, Code, Terminal, and HTML Preview are available through the separate local-tools screen.
- On iPhone, Terminal runs a sandboxed native command set through `ios_system` in `Documents/KronTerm`. The installable PWA keeps the virtual-shell fallback because browsers cannot load that native bridge.
- `kronoscode` and `kc`, plus the **KronosCode TUI** button, create a live project terminal on the connected KronTerm runtime and launch `kronoscode` as soon as its PTY connects.
- Auto planning selects Kron Local, Local Linux, Kron Sandbox, or Remote Device and passes that target plus local file context to KronosCode. Concrete Kron Local write-back, Local Linux execution, and sandbox-session binding remain Phase 2–4 work.
- Agent chat uses the real connected KronosCode gateway. The mobile shell does not fabricate assistant replies.
- Managed sandboxes and paired computers continue to appear as live, controllable surfaces.
- The PWA caches its shell after the first production load. Safari users can install it with **Add to Home Screen**.
- OPFS, Git, WebAssembly tools, Python/WASM, QEMU-SE, and background agents remain later runtime phases.

## Architecture

- **Agent chat:** a native React transcript and composer use the authenticated host session and gateway APIs. No external chat iframe is loaded.
- **KronTerm workbench:** shared project identity, section dock, Browser/Code/Terminal tabs, focused mobile panes, desktop splits, local editor, preview, native iPhone shell, PWA fallback shell, and runtime status.
- **Kron Local:** persistent Phase 1 workspace state, deterministic runtime routing, and a BSD-style native command layer contained by the iOS app sandbox. OPFS and additional language tools belong to Phase 2.
- **KronosCode engine:** `/api/kronoscode/gateway-ticket`, the JSON-RPC gateway, native sessions, models, tools, approvals, and artifacts.
- **KronTerm surfaces:** Browser Runtime and Desktop Sandbox APIs provide live browser and computer-use surfaces.
- **Agentic phone surface:** the optional Labs bridge exposes the connected iPhone as a `This iPhone` app surface and registers its observation and action tools with the same KronosCode engine.
- **Multiple hosts:** a managed host can coexist with any number of explicitly paired computers or sandbox hosts.
- **No-computer mode:** configure `VITE_KRONTERM_CLOUD_URL` with a managed KronTerm Browser Host/Kron Sandbox. The iPhone UI and control model are the same; execution happens in that small managed sandbox.
- **Optional computers:** `npm run host -- --lan` starts a pairing proxy for an explicitly configured compatible agent API.
- **Credential storage:** native tokens use iOS Keychain through `@aparajita/capacitor-secure-storage`. Web development stores credentials only for the current tab.

## Development

```bash
npm install
npm run dev
npm test
npm run test:host
npm run build
npm run ios:sync
npm run ios:open
```

Set `VITE_KRONTERM_CLOUD_URL` to pre-register a managed Browser Host or Kron Sandbox. A production managed host should use HTTPS and provide the same `/health` and `/api` contract as the connector. `VITE_KRONTERM_CLOUD_TOKEN` is supported for local development only and must not be embedded in release builds.

During browser development at `127.0.0.1:4174`, the app automatically registers the Hermes host through the local connector at `127.0.0.1:4119`. Override it with `VITE_KRONTERM_LOCAL_URL`.

The native Xcode project is already included under `ios/`; `npm run ios:sync` rebuilds and copies the web runtime before opening or archiving it. The local Capacitor plugin lives at `plugins/local-shell` and links the BSD-3-Clause `ios_system` command frameworks.

## Optional personal computer connector

Start Hermes/KronTerm, then run:

```bash
npm run host -- --lan --upstream https://your-agent-api.example
```

The connector prints its URL and a short-lived six-digit pairing code. Add it from the iPhone host switcher. The connector proxies the real `/api` surface and KronosCode routes, issues mobile UI tickets, and relays the real gateway WebSocket; it does not run another AI engine.

Only SHA-256 token hashes are persisted, with owner-only permissions, in `~/.kronterm/kronlink-tokens.json` so paired phones survive connector restarts. Override that path with `--token-store` or `KRONLINK_TOKEN_STORE`.

## KronTerm Labs phone control

The connector automatically detects a PhoneAgent JSON-RPC bridge at `127.0.0.1:45678`. Start the upstream iOS XCTest bridge, then start KronLink normally. Use `--phoneagent-host` and `--phoneagent-port` to override the endpoint, or `--disable-phoneagent` to turn this lane off.

When the bridge is reachable:

- Surfaces shows `This iPhone` with a live screenshot.
- Watch mode can inspect the screen and accessibility tree without mutation permission.
- Control grants a maximum two-minute lease shared by direct touch and KronosCode phone actions.
- Taps, text entry, app opening, scrolling, and swipes are followed by a fresh screen/tree observation.
- Audit entries contain action metadata and outcomes, not typed text, screenshots, API keys, or prompts.

KronosCode remains the only AI engine. PhoneAgent's `set_api_key` and `submit_prompt` methods are intentionally not registered or forwarded. The integration uses PhoneAgent for RPC execution, Qalti's observe/act/verify loop for result checking, and iGentic's approval/policy/audit model for control safety.

## App Store boundary

The consumer app controls KronTerm-owned Browser Host/Kron Sandbox surfaces and explicitly paired computers. iOS does not give an App Store app general control over Safari or unrelated installed apps. The implemented PhoneAgent XCTest connection therefore remains an optional **KronTerm Labs** developer lane, while the normal App Store lane uses the same surface and control vocabulary against Browser Runtime, App Intents, document pickers, and sandbox surfaces. UTM may be used as an external personal sandbox, but it is not embedded or represented as unrestricted iPhone control.

The native terminal executes its bundled commands directly on the iPhone. The full KronosCode TUI remains on a connected KronTerm runtime because its Bun/Node host services are not part of the iOS app; the mobile tab is the live PTY client. This also keeps the App Store build self-contained instead of downloading executable code that changes the app's functionality.

The phone connector takes `--upstream` or `KRONTERM_AGENT_URL`. It no longer assumes a bundled chat server. Optional upstream headers use `KRONTERM_AGENT_AUTH`, `KRONTERM_AGENT_COOKIE`, and `KRONTERM_AGENT_X_AUTHKEY`.
