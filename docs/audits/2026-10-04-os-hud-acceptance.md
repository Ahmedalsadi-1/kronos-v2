# OS and floating HUD acceptance - 2026-10-04

This record separates observed live behavior from automated verification. Verified means the stated check passed; failing means the live check did not produce its expected result; unavailable means the required environment or provider interface was not accessible. Automated checks do not establish hardware acceptance.

## Live acceptance

| Feature | Status | Evidence / remaining check |
| --- | --- | --- |
| Native notch | Verified | Coucou displayed its native panel and accessible Home, Comment, Browser, Files, Terminal, Widget, Exit HUD, settings and audio controls. |
| HUD chat recovery | Verified | After guarding newly added preload listeners during hot reload, the real HUD displayed its existing Discord widget and Hermes composer. The notch Comment control restored the hidden chat. |
| OS/HUD shortcut | Failing | Cmd+Shift+U produced no visible transition in the running Electron process. The newly built main/preload bridge requires a fresh launch and a complete round trip. |
| Exit HUD | Failing | The initial Exit HUD attempt did not reliably return a usable OS workspace. Renderer recovery subsequently succeeded. A later native exit again revealed a blank owner window; a complete usable OS round trip remains unverified. |
| Control Center | Failing | Live opening exposed undefined scripts and automations lists. Array results now default to empty lists; a fresh live Control Center pass remains required. |
| Microphone startup / voice presentation | Failing | Start voice conversation hid the Electron HUD without an observable listening state. The notch restored the composer, which again offered Start voice conversation. This does not establish microphone capture. |
| Speech-to-text / spoken interruption | Unavailable | No successful microphone capture and recognized test utterance were observed. Unit tests cover lifecycle cancellation, not speech recognition. |
| Desktop permissions | Unavailable | No completed live status inspection. No permission grants were changed. Accessibility access by the test harness does not establish KronTerm's own permissions. |
| Restart restoration | Unavailable | The running workspace was not restarted. Persistent island identities, geometry and browser history were exercised through automated tests. |
| Selection delivery into a live provider chat | Unavailable | Context construction and single-host routing passed automated tests; no test prompt was submitted to a live provider session. |
| Plugin external connections | Unavailable | The existing plugin interfaces expose registration and backend inventory, but do not publish provider connection probes or per-plugin action catalogs. |

## Changes and automated evidence

- Navigation reuses mounted browser/terminal blocks, preserving their live guests and sessions. Detached island IDs persist per owning tab. Native window geometry is restored and clamped to available displays. Browser history persists per canonical block through an ownership-checked Electron bridge, without opaque page state or known credential parameters. Concurrent history saves discard stale results.
- Hermes pane state responds to cross-window storage updates. Existing profile-scoped session/route persistence remains the source of remembered chat navigation. Cmd/Ctrl+Shift+U is wired in both workspace and native HUD windows and documented in settings.
- Desktop and webpage selection offer a comment and a metadata review before sending. Desktop screenshots are local previews; the transmitted prompt contains metadata and the comment. The bridge routes to one owning chat host, reveals a hidden HUD, and preserves pending context across subscriber replacement. Send failures remain visible.
- Computer-use cards show the controlling surface, action and frame age. Pause, Cancel and Take over route interruption to the activity's session. Pause interrupts the turn; resuming requires another user message. Sessionless activity cannot cancel unrelated chats. Active animation expires for stale activity.
- Microphone capture cleans up cancellation during delayed permission/device acquisition, coalesces stop requests and recovers from device disconnection. Voice startup/transcription callbacks ignore stale generations; microphone and transcription failures permit an explicit retry rather than an endless retry loop.
- Desktop plugin cards expose loaded/disabled/error status, real registered palette actions, source configuration and registration checks. Agent plugin cards expose gateway connectivity, tools configuration and a real backend inventory test. These tests explicitly distinguish registration from an external provider connection.

## Provider limits

The currently exposed speech-to-text API returns a completed transcript from a recorded clip. It exposes no interim transcript stream. Interim transcription is unavailable through that interface; no simulated interim text was added.

Plugin provider connection status and per-plugin executable test actions require backend capability metadata and probes. Cards report these absent capabilities explicitly; a successful inventory query is not a provider health test.

## Validation

The focused acceptance suite passed 69 tests across 14 files, including native HUD routing, guest ownership, history sanitization, window placement, live-block reuse, reviewed context delivery, microphone recovery and session-scoped controls. The development build completed successfully. The full TypeScript check passed. The final suite includes 4 microphone lifecycle tests, covering a retry before the cancelled device request resolves.

## Remaining live pass

Use a fresh Electron main/preload launch, verify OS-to-HUD-to-OS with the same browser guest and Hermes session, inspect Control Center and desktop permissions, capture a known spoken phrase, interrupt speech, disconnect/reconnect the microphone, and restart with the same windows and navigation. Until those observations pass, this feature set is not fully live accepted.
