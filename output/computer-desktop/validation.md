> Superseded: the Openbox / Qt browser experiment below was rejected. Current implementation retains XFCE/XFWM and stock Chromium, with native appearance settings and event-driven focused-window maximization.

# Focused computer desktop validation

## Implemented

- Static generated liquid-chrome wallpaper, Openbox with one desktop and matching maximized main-app bounds, and a small app dock. Dialogs retain their own size.
- Guest browser with KronTerm-style dark navigation controls, a guest-local persistent profile, and loopback CDP. Reopening it reuses the current browser process. Stock Chromium remains available for compatibility checks.
- Black viewer frame, connection status, controls menu, takeover, fullscreen, and real computer-scoped activity/approval borders. The existing cursor is reused with surface particles disabled; idle cursor rendering stops scheduling frames. Approval suppresses cursor visibility without removing its subscription.
- Update desktop action for stopped machines. The cloud-init seed changes while the existing project disk remains. Host keys are retained, strict SSH checking remains enabled, and readiness waits for cloud-init.

## Evidence

- Final combined suite: 37 tests passed across provisioning, VM authority, CDP, viewer, widget and cursor behavior, including the lightweight cursor regression.
- Targeted ESLint and the final `task check:ts` passed.
- Real Ubuntu 24.04 disposable container: custom browser opened a guest-local page, existing sandbox CDP navigated and clicked its button with verified readback. Developer tools remained excluded from browser page selection. Ctrl+L, find, reload, developer tools, dock launch/switching, and browser-process reuse were exercised.
- Openbox reported the same 960 x 540 main-app rectangle at (32, 24); dock remained at the bottom. No XFCE session ran.
- Actual VNC viewer reviewed at 1280 x 800, 1440 x 900 and 1920 x 1080. Light/dark appearance and reduced motion were exercised. Fit, reconnect, fullscreen/exit and takeover preview controls worked.
- The activity and approval review screenshots use explicitly injected test events on the real viewer. They are not evidence of a real approval request or autonomous production run.

## Design review

- Hard gate PASS for this desktop UI: real controls have handlers, takeover failure keeps input fenced, offline/error/connection states exist, and tested desktop layouts have no page overflow.
- Purpose gate PASS: static chrome material follows the user's reference; black chrome frames the guest; the small dock switches apps; the accent and amber border communicate activity and approval.
- Liveliness PASS: ENERGY 1 / RHYTHM 1 / MOTION 1. One visible main app is the focal point, desktop margins separate it from the dock, and the chrome material supplies the requested identity.
- Craftsmanship PASS for the tested implementation: system typography, compact controls, keyboard navigation, visible focus, explicit state labels, and source-owned guest assets. The full-surface particle animation is disabled specifically for this viewer.

## Limits

Cold QEMU provisioning/update was not exercised on the user's managed VM. Resource savings were not measured; the VM allocation remains two CPUs and 2 GB RAM. Qt WebEngine is a Chromium-based guest browser with adapted controls, rather than the entire Electron browser feature set. This change does not add automatic host project/filesystem synchronization.

## Assets

The static wallpaper was generated using the built-in image tool from the prompt:
“Pure desktop wallpaper, landscape 16:10; broad flowing liquid-chrome silver folds, graphite reflections, restrained cool white highlights, lower contrast in the center; no text, UI, objects, logos or colored lights.”

Source: `emain/linux-desktop/guest/liquid-chrome.png`. Guest payload regeneration:
`node scripts/generate-computer-guest.mjs`.
