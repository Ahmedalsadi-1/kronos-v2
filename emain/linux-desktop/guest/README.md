# Focused XFCE desktop

The original Ubuntu VM, XFCE/XFWM window manager, panel, terminal,
and stock Chromium are retained. A static liquid-chrome wallpaper, native dark
theme, inset maximized windows, and three native launcher icons provide the
updated appearance. No custom browser engine, custom dock, wallpaper
renderer, or replacement window manager is started.

`focus-one.sh` watches X11 focus changes with `xprop -spy`. It maximizes normal
application windows through XFWM, so the selected app fills the desktop while
Alt+Tab and the existing dock continue to work. Transient dialogs and desktop,
panel, and menu windows are excluded. It does not poll on a timer.

After editing a shell source, regenerate the embedded cloud-init payload:

```sh
node scripts/generate-computer-guest.mjs
```

For an existing VM, stop it, choose **Controls > Update desktop**, and start it.
The same project disk and SSH host identity are preserved. The former experimental
Openbox, custom dock, and Qt browser are no longer provisioned or run.
