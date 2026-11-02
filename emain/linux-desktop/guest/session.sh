#!/bin/sh
set -eu
export DISPLAY=:1 HOME=/home/cua XDG_RUNTIME_DIR=/run/kronterm-cua
export CUA_DRIVER_RS_TELEMETRY_ENABLED=0 CUA_DRIVER_INSTALL_CHANNEL=python_package
cd /home/cua/workspace
Xvfb :1 -screen 0 1024x640x24 -ac -nolisten tcp &
for attempt in $(seq 1 50); do
    if xdpyinfo -display :1 >/dev/null 2>&1; then break; fi
    sleep 0.1
done
xdpyinfo -display :1 >/dev/null
exec dbus-run-session -- sh -c '
    startxfce4 > /home/cua/xfce.log 2>&1 &
    for attempt in $(seq 1 50); do
        if wmctrl -m >/dev/null 2>&1; then break; fi
        sleep 0.1
    done
    /usr/local/bin/kronterm-appearance > /home/cua/appearance.log 2>&1 &
    /usr/local/bin/kronterm-focus-one > /home/cua/focus-one.log 2>&1 &
    exec /usr/local/bin/cua-driver serve --socket /run/kronterm-cua/kronterm-cua.sock --permission-mode standard
'
