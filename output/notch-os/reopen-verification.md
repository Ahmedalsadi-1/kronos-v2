# Notch workspace recovery

Date: 2026-11-05

The exclusive HUD owner-show listener immediately hid the workspace whenever it
was shown. macOS app activation only created a new window when none existed;
existing hidden windows were left inaccessible. The general app hotkey also
focused hidden windows without showing them.

Changes:

- Normal notch toggle keeps the workspace visible.
- Explicit exclusive placement remains available.
- Showing the main workspace exits exclusive HUD instead of hiding it again.
- Dock activation, second-instance launch, and the global app hotkey show and
  focus an existing workspace, restoring it first if minimized.
- The current main window was recovered with its Return to workspace control;
  CoreGraphics confirmed its existing window became visible without an app restart.

Validation:

- The pre-fix regression run reproduced the owner re-hide and default-placement failures.
- 59 targeted tests across five suites passed after the fix.
- TypeScript and development Electron build passed.
- ESLint reported zero errors and seven existing warnings in the checked files.
- Build-output checks passed.
- The local review app's main, preload, and frontend build files were updated
  atomically per file, retaining previous hashed assets for the running renderer.
- Installed main/preload/HTML checksums match the new build.
- The local native companion link was repaired.

`reopen-install.json` records the local rollback backup. The running app was not
restarted; one full quit/reopen loads the permanent main-process fix.
