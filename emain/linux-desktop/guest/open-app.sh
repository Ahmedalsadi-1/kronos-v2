#!/bin/sh
# Copyright 2026, KronTerm.
# SPDX-License-Identifier: Apache-2.0
set -eu
case "${1:-}" in
    terminal)
        wmctrl -xa xfce4-terminal && exit 0
        exec xfce4-terminal --working-directory=/home/cua/workspace
        ;;
    files)
        wmctrl -xa Thunar && exit 0
        exec thunar /home/cua/workspace
        ;;
    browser)
        wmctrl -xa chromium-browser && exit 0
        wmctrl -xa chromium && exit 0
        exec chromium-browser --force-dark-mode
        ;;
    *) exit 2 ;;
esac
