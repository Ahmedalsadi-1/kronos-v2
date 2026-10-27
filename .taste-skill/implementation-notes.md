# KronTerm UI and mode continuity

Applied Leonxlnx/taste-skill's app-screen workflow, retaining KronTerm's palette,
system fonts, React stack, and existing workspace presentations. The selected
direction is true-black-flat: neutral surfaces separated by tone, restrained
chrome, and colour reserved for meaningful state. Existing light appearance
remains supported. Floating menus and windows retain elevation shadows.

Design read: a developer workspace used for long sessions; energy 1, rhythm 1,
motion 1. Its identity is the same agent conversation beside the desktop it
controls, rather than an unrelated bot dashboard.

## Product inventory and jobs

- Workspaces retain terminal, browser, and file blocks.
- Four presentations share those blocks: widgets, tabs, canvas, and OS.
- Bots have durable IDs and independent desktop workspaces.
- Conversations have a bot ID and thread ID, preserved across presentations.
- Shared chat, HUD, and bot settings expose those same conversations.
- Device targets expose runtime, status, capabilities, and ownership generation.
- Device discovery includes Android emulators and iOS simulators, plus phones.
- Live sessions and still captures have distinct labels.
- Human takeover and explicit automation resume remain separate actions.
- Device controls are Labs features.

Primary questions: Which conversation or desktop am I continuing? Which device
is selected, is it available, and who controls it?

## Changes

- Shared system materials use opaque neutral surfaces in both appearances.
  Toolbar and menu blur and decorative menu gradients are removed. Disabled
  buttons no longer acquire hover feedback. Text fields have visible focus.
- Bot chat and HUD both explicitly focus the original conversation. Bot rows
  can open their existing desktop without navigating through the embedded app.
  Duplicate desktop opens are suppressed; errors and progress remain visible.
- Reopening a provisioned bot desktop preserves the user's chosen presentation.
  New desktops still start in OS mode; existing widgets remain untouched.
- Device errors offer discovery retry. Unavailable and discovering states are
  explicit. Narrow views retain device status and use larger input targets.
- Landscape and tablet captures use their actual aspect ratio rather than being
  stretched into a portrait phone frame. Ordinary phone captures keep the
  platform hardware frame.
- Empty device screens use the theme surface so light-theme text stays legible.
  Capture timestamps use a readable neutral backing over the screen.

## Verification

- PASS: 44 tests across six files covering bot workspace provisioning and bridge,
  bot UI handoff, device controller and UI, and Hermes presentation continuity.
- PASS: TypeScript check (`npm run check:ts`).
- PASS: targeted ESLint and Prettier checks; `git diff --check`.
- PASS: Taste source lint for bot/device files has zero failures. Its remaining
  shadow warning identifies `box-shadow: none`. Shared-style shadow warnings
  refer to floating windows, menus, and the existing switch thumb.
- PASS: browser preview exercised error/retry, device selection, live screen,
  text entry/send, and light/dark switching.
- PASS: landscape capture fixture renders at ratio 2.0 at widths 1440, 768, 390;
  document horizontal overflow is false at all three widths.
- PASS: narrow Android preview keeps status, ownership, controls, and input
  visible; screenshots were visually inspected and the empty-screen contrast
  defect found in that review was corrected.

Taste's standalone inspector could not launch: the installed Google Chrome
bundle lacks its Chrome for Testing framework. Ego Browser provided the rendered
checks instead. It reports an available update; no browser update was installed.

## Scope of evidence

These checks cover shared system chrome and the bot/device paths above. They do
not certify every custom product screen or a full Electron session. Browser
device frames use clearly labelled mock data and a landscape test fixture;
real Android/iOS runtime boot, transport, and physical-device operation were not
tested. Existing unrelated checkout changes were preserved.
