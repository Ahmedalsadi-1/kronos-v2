# Coucou HUD companion (personal local build)

The native notch panel uses Louis Raillé's Coucou source at commit
`8a5c26328bd6409ff873e6f66bdc2e6ba004c856`. Its SwiftUI character, gestures,
state machine, resting notch geometry, and sounds remain upstream.
KronTerm expands the overview for live previews and docked widgets.
The header adds KronTerm launchers; the overview uses the live agent plugin
workspace pages, with four categories per dot-pager page.
The header gear opens the combined KronTerm and Hermes settings, including plugins;
settings shortcuts are kept out of the home cards.
Selecting a category opens its Hermes panel immediately. The prompt view hosts
KronTerm's existing Hermes HUD renderer inside the native island's content area,
using the conversation selected when HUD mode is entered.

Build on macOS 15+ with Swift 6 (Command Line Tools suffice):

```sh
/usr/bin/python3 scripts/build-coucou-hud.py
npm run dev
```

Enter HUD mode with Cmd+Shift+H, or the configurable global hotkey `app:notchhotkey`
(default `Ctrl:Alt:Space`), which summons and dismisses the notch from any app since
the exclusive-HUD workspace window is hidden while the notch owns the session. A
pending agent permission question publishes its request ID and options to the notch,
whose approve/deny buttons answer that exact pending request. Clicking an active agent
row docks its workspace block in the notch even when the block was not open as a
preview. While the panel is expanded it centers on the display holding the pointer;
collapsed it stays on the physical notch display. Or use the OS shell's "Float Coucou above workspace"
control to keep the regular workspace visible. Open chat with the native chat icon.
Use the native Home and chat buttons to hide and reopen it.
The companion is owned by HUD mode: explicitly leaving HUD kills it and restores
KronTerm. Unexpected companion exit keeps notch mode and the conversation alive,
with recovery and app controls in the Electron HUD. Retry restarts the companion
in place. The chat remains alive when collapsed. Launcher buttons live inside the
native header and continue to open native HUD islands.

Selecting a widget opens its live renderer directly in the expanded notch. The
compact left card preserves the pet and task status; assistant text stays in chat.
Widget selectors sit at the preview's bottom-right. Docked widget enlarge and hide
controls sit in the native header beside the launchers; detached windows retain
their own restore and hide controls. Hide preserves the
session and keeps the preview dismissed until explicitly selected again. File
rows dragged outside an island open that file in a new island; ordinary directory
drops and cancelled drags keep their existing behavior. Follow task watches the
widget named by agent activity; selecting a widget manually stops following.
The native view reports its actual preview rectangle to Electron so live widget
placement follows layout and display changes.

Dropping the notch pet onto an app forwards its app name and window title to the
active Hermes chat. The agent is asked to inspect it with `kron_computer_use` and
ask what task to perform. The app/window labels are treated as context, not commands.
The local preview bridge shows existing KronTerm widget frames; native app capture
still depends on the computer-use stream provided by the agent runtime.

The workspace supplies previews from open Browser, App Stream, and Sandbox blocks.
Browser frames come from the owning Electron webview; computer-use video and
sandbox VNC canvases supply their current pixels. Frames refresh locally about
once per second. Use the preview arrow to cycle surfaces; click a preview to
open its surface. No preview frames are sent to an external service.

The build is stored in `.local/coucou-hud/`, excluded from Git and release
packaging. Without that local build, the existing floating HUD is used.

Upstream code is MIT licensed. The character, branding, icons, and sounds have
separate restrictions: personal builds are allowed; distributing this exact
appearance requires the author's written permission. Do not include the local
bundle in product releases. See
[upstream asset license](https://github.com/Louis-CFM/coucou/blob/8a5c26328bd6409ff873e6f66bdc2e6ba004c856/LICENSE-ASSETS.md).

This uses a native companion plus the existing Electron chat. The transcript
and compact composer share the island's black content area, beneath its native
header. Upstream Claude CLI hooks remain optional and must be
installed explicitly in Coucou Settings; this integration does not change CLI
configuration or credentials. Live HUD turns and workspace activity are relayed
to Coucou's original third-party agent hooks.

The live workspace expands to 1000×680 points for browser, terminal, and file widgets, bounded by the display. The top enlarge control switches the notch itself to 1240×800; the adjacent detach control enlarges only the widget. Navigation launchers reopen existing widgets; the browser rail's plus creates a new browser widget.

The native rail receives bounded explorer rows from the selected file renderer. It forwards clicks only for published paths to that docked renderer. File tabs reuse the existing preview editor and save APIs, retain drafts across tab switches, and show file saves and agent completion in Output, with file and agent events in Logs. The browser element toolbar reuses the existing capture/annotation controller; Style exposes captured computed styles and a request to Hermes.

Agent identity comes from live activity and terminal shell-integration commands (OpenCode, Claude, Hermes, Codex, Gemini, KronosCode). Terminals without shell integration cannot advertise their running command. Activity entries expire after 45 seconds. The local PNG logo copies come from the existing project marks (OpenCode, Codex, KronosCode, Gemini) and existing Orca reference assets (Claude starburst, Hermes helmet); the companion build copies them into its app resources.

The local build uses the SDK selected by `xcrun` and Swift 6 with actor checks enabled. Incoming object payloads are validated before Foundation serialization: an `explorer: null` reset previously raised an Objective-C exception across a Swift task, corrupting executor state and causing later button/layout crashes. `native/coucou/tests/json.swift` covers null, scalar, malformed, and valid collection payloads. Unexpected exit or a 15-second readiness timeout exposes the Electron recovery controls without reopening OS mode; retry preserves the existing HUD and session. Renderer remounts no longer exit notch mode. The preview also pins the companion state machine so greeting and hover timers cannot fold it. Browser islands retain already-loaded guest navigation history when reopening.

Screenshot capture has a three-second deadline and never locks inventory or selection updates. Late frames from an older selection are discarded. Docked widgets retain their screen-saver window level on show and focus so they stay above the native panel.

The terminal rail includes New terminal and Split right/down. A split tab keeps two live terminal islands in one measured preview; hiding, reopening, and enlarging the tab preserves both sessions. The streamed-app launcher reopens live app streams, and Connect app opens the existing installed-app picker. File explorer controls create files/folders, refresh and collapse directories; the integrated file toolbar exposes Edit/Preview, Save, and a scrollable, copyable full path. New-file creation refuses existing names and never truncates a concurrently created file.

The existing agent composer supports `@app:` references with installed application names and stable IDs. Coucou drops onto owned KronTerm islands select their block and use Kron tools; external application drops use Kron Computer Use and request a live app stream. The task card identifies the selected app and tool route with Pause/Release controls. Pet targeting leaves the current preview visible rather than opening another chat section. Browser agent pointer halos are hidden and activity borders fade on completion or stale activity.

Chat adapts to the selected surface: an ordinary conversation opens a 620-point-wide
panel; a docked browser, terminal, desktop, phone, or streamed app keeps a 280-point
conversation rail below the pet. The chat button expands or collapses that rail
without closing the live widget. The split uses a critically damped spring and
respects Reduce Motion. Device launchers share one Sandbox icon and choose the
Linux desktop, Android device, or iPhone from the existing device widget.

The preview footer exposes persisted KronTerm workspaces by name, highlights the
current workspace, and offers Create workspace. Selection uses the existing
window workspace switcher; unpublished IDs are rejected. The native agent tool
`workspace_organize` creates named workspaces and renames existing ones while
preserving their icon and color. Existing workspace and widget tools arrange
contents and switch workspace context.

Phone previews reserve roughly 390 points for the simulator and give the
remaining width to Hermes. Linux desktops retain the wider preview layout.
The embedded notch chat uses native system typography, quiet outline controls,
neutral cards and palette-matched focus feedback. The native paint-palette menu
and Hermes appearance settings expose all ten upstream Coucou colors, plus the
original violet. Selection updates chat, native controls, and the main character;
it is replayed after companion recovery. Coucou is the default skin for fresh
Hermes profiles; previously chosen skins remain selectable.
See the [upstream review](upstream-review-2026-10-08.md) for the v0.2.3 feature
assessment and the remaining companion upgrade work.

The character and live chat share a persistent progress summary in the native
rail. When the selected widget loses native window focus, the summary shows the
latest status and two recent public action captions. Approval and failure states
remain visible as attention cues. The last four distinct captions are retained
per run and replayed after companion recovery. Activity uses public phase and
surface labels; raw reasoning and terminal payloads are not forwarded to hooks.

The [workspace workflows guide](workflows.md) covers the three execution templates,
local recovery, approvals, isolated code worktrees, and shared desktop/HUD controls.

KronTerm's local build now filters hover activation through 200ms of pointer rest
within a four-point radius. Leaving resets the gate; clicks and drops retain
immediate activation. Island geometry and character placement use critically
damped springs, including interrupted open/close changes, and Reduce Motion
still disables these animations. The browser address field expands on focus
with a 520ms ease-out curve. A compact task count, focus toggle, and notes button
appear when Electron publishes productivity state; they use the same local
productivity workspace as the main app. Measured native preview/chat rectangles
continue to drive Electron presentation rather than estimated geometry.

The pointer gate can be checked independently with:

```sh
swiftc native/coucou/kronterm-pointer-rest.swift native/coucou/tests/pointer-rest.swift -o /tmp/kronterm-pointer-rest-test
/tmp/kronterm-pointer-rest-test
```
