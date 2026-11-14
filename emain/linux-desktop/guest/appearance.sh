#!/bin/sh
# Copyright 2026, KronTerm.
# SPDX-License-Identifier: Apache-2.0
set -eu

set_property() {
    channel=$1 property=$2 type=$3 value=$4
    xfconf-query -c "$channel" -p "$property" -s "$value" 2>/dev/null ||
        xfconf-query -c "$channel" -p "$property" -n -t "$type" -s "$value"
}

for attempt in $(seq 1 50); do
    if xfconf-query -c xfce4-desktop -l 2>/dev/null | grep -q '/backdrop/'; then break; fi
    sleep 0.1
done
xfconf-query -c xfce4-desktop -l | while IFS= read -r property; do
    case "$property" in
        */last-image|*/image-path) set_property xfce4-desktop "$property" string /usr/local/share/backgrounds/kronterm/liquid-chrome.png ;;
        */image-style) set_property xfce4-desktop "$property" int 5 ;;
    esac
done
set_property xfce4-desktop /desktop-icons/style int 0
set_property xsettings /Net/ThemeName string Greybird-dark
set_property xsettings /Gtk/ApplicationPreferDarkTheme bool true
set_property xfwm4 /general/theme string Greybird-dark
set_property xfwm4 /general/use_compositing bool false
set_property xfwm4 /general/margin_top int 24
set_property xfwm4 /general/margin_bottom int 68
set_property xfwm4 /general/margin_left int 32
set_property xfwm4 /general/margin_right int 32

# Keep XFCE's native launcher panel; no additional dock process is needed.
for attempt in $(seq 1 50); do
    if xfconf-query -c xfce4-panel -l 2>/dev/null | grep -q '^/panels/panel-2/'; then break; fi
    sleep 0.1
done
if xfconf-query -c xfce4-panel -l | grep -q "^/panels/panel-1/"; then
    set_property xfce4-panel /panels/panel-1/autohide-behavior int 2
fi
if xfconf-query -c xfce4-panel -l | grep -q "^/panels/panel-2/"; then
    set_property xfce4-panel /panels/panel-2/size uint 42
    set_property xfce4-panel /panels/panel-2/length-adjust bool true
    set_property xfce4-panel /panels/panel-2/position-locked bool true
    set_property xfce4-panel /panels/panel-2/background-style uint 1
    xfconf-query -c xfce4-panel -p /panels/panel-2/background-rgba -r 2>/dev/null || true
    xfconf-query -c xfce4-panel -p /panels/panel-2/background-rgba -n -a -t double -s 0.08 -t double -s 0.08 -t double -s 0.09 -t double -s 1
    for entry in '101 browser web-browser Browser' '102 terminal utilities-terminal Terminal' '103 files system-file-manager Files'; do
        set -- $entry
        id=$1 executable=$2 icon=$3 name=$4
        mkdir -p "$HOME/.config/xfce4/panel/launcher-$id"
        printf '[Desktop Entry]\nType=Application\nName=%s\nExec=%s\nIcon=%s\nTerminal=false\n' "$name" "kronterm-open-app $executable" "$icon" > "$HOME/.config/xfce4/panel/launcher-$id/kronterm.desktop"
        set_property xfce4-panel "/plugins/plugin-$id" string launcher
        xfconf-query -c xfce4-panel -p "/plugins/plugin-$id/items" -r 2>/dev/null || true
        xfconf-query -c xfce4-panel -p "/plugins/plugin-$id/items" -n -a -t string -s kronterm.desktop
    done
    xfconf-query -c xfce4-panel -p /panels/panel-2/plugin-ids -r 2>/dev/null || true
    xfconf-query -c xfce4-panel -p /panels/panel-2/plugin-ids -n -a -t int -s 101 -t int -s 102 -t int -s 103
fi
