# Native XFCE desktop and latency work

The original QEMU/Ubuntu disk, XFCE/XFWM, Chromium, Terminal and Files are retained.
The chrome wallpaper is a static PNG. The dock uses three native XFCE launcher plugins.
No custom Qt browser, Tk dock or alternative window manager is started.

## Correctness and latency changes

- Parse the first XFWM active-window ID, including the real `0x..., 0x0` format.
- Ignore duplicate active-window notifications before invoking wmctrl.
- Maximize normal apps; exclude transient dialogs and non-app windows.
- Reuse boot readiness per VM PID. Check driver health every 15 seconds rather than invoking cloud-init every status refresh.
- Explicitly disable WebSocket compression and enable TCP_NODELAY on the loopback viewer socket.
- Request noVNC compression level 0 for the local stream; this requires workload measurement because full-screen changes can increase SSH/copy load.
- Configure x11vnc wait/defer at 8 ms, immediate updates after input, and no wireframe drag delay. Idle naps and XDamage remain enabled.

## Verification

26 targeted tests passed across provisioning, runtime, WebSocket forwarding and viewer ownership/lifecycle.
Main/preload build and targeted lint passed. A previous full TypeScript check passed; the check for the latest latency edits is recorded separately in the task log.

The live VM successfully booted the native chrome wallpaper and three-icon panel.
The corrected focus parser was applied through the user-owned VM Terminal and visibly maximized Terminal within the wallpaper margins.

Host-only bridge/child-pipe echo benchmark: 200 samples after 10 warmup samples; median 0.123 ms, p95 0.281 ms, maximum 0.564 ms.
This excludes SSH, the VM, screen capture, encoding, renderer painting and input-to-visible response. It is not an end-to-end latency claim.

## Pending live validation

The user started another agent task in the VM. The VM is agent-owned, so no takeover or restart was performed during that task.
The latest focus deduplication, native dark theme and server latency flags require a coordinated application/desktop update and VM restart.
Measure idle guest CPU, terminal typing/scrolling and browser animation before making a responsiveness or latency guarantee.
