#!/bin/sh
# Copyright 2026, KronTerm.
# SPDX-License-Identifier: Apache-2.0
set -eu

# Focus events avoid a polling loop and leave XFWM in charge of the desktop.
xprop -spy -root _NET_ACTIVE_WINDOW | while IFS= read -r event; do
    window=${event#*# }
    window=${window%%,*}
    window=${window%% *}
    case "$window" in 0x*) ;; *) continue ;; esac
    case "${window#0x}" in ''|*[!0-9a-fA-F]*) continue ;; esac
    if [ "$window" = "${previous_window:-}" ]; then continue; fi
    previous_window=$window
    properties=$(xprop -id "$window" _NET_WM_WINDOW_TYPE WM_TRANSIENT_FOR 2>/dev/null) || continue
    case "$properties" in *'_NET_WM_WINDOW_TYPE_NORMAL'*) ;; *) continue ;; esac
    case "$properties" in *'WM_TRANSIENT_FOR(WINDOW)'*) continue ;; esac
    wmctrl -ir "$window" -b add,maximized_vert,maximized_horz 2>/dev/null || true
done
