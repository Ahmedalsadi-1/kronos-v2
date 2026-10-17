
### Tool discovery and app workflows

`tool_search` searches enabled tool names and descriptions with all query terms,
returns at most 100 matches, and can include input schemas or filter by read-only
annotations. It respects the selected surface capability policy. Tool discovery
never grants authority to execute a returned tool.

`app_workflow` returns capability-checked recipes for `inspect`, `draft`, or
`publish` against a `browser` or `native` surface. These recipes use existing
widget and macOS accessibility tools and the user's existing signed-in session;
they do not supply social platform APIs or credentials. Publishing recipes put
explicit authorization before the final external action and require inspection
of an uncertain outcome before retrying. The tool itself performs no app actions.

## Native background app workspaces

The `kron_computer_background_workspace_*` tools group newly launched native macOS apps for an agent task. Start a workspace, launch an exact installed bundle ID, observe its windows, then perform one accessibility `press` or `set_value` action using the returned snapshot and element IDs. Observe again after every action. Existing running applications are refused so the agent cannot adopt your windows.

This is an app group, not a separate macOS desktop or input session. Launch requests disable activation, but an app can still activate itself. Foreground detection is checked at observation/action time, not continuously. These tools never send global keyboard or pointer events. An unsupported accessibility action fails instead of switching to foreground automation. Unlabeled or ambiguous controls and changed window trees are refused.

Use `reveal` only when the user wants to inspect or take over; it activates the owned app and pauses automation. After the user returns the app to the background and explicitly gives control back, use `resume`. `finish` releases task ownership and leaves every app/window intact. Sessions live in the native tool server process; restarting it loses ownership rather than adopting previously launched apps.

Build the helper using `node scripts/build-desktop-picker.mjs arm64 background-computer` (`x64` on Intel). Packaging builds and bundles it automatically. macOS Accessibility permission is required for observation and actions. Window screenshots use ScreenCaptureKit only when Screen Recording permission is already granted; unavailable off-Space or minimized windows return a capture limitation without a desktop screenshot fallback.
