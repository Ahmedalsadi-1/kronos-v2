// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { LinuxGuestSources } from "./guest-assets";

export const LinuxGuestPackages = [
    "xfce4",
    "xfce4-terminal",
    "chromium-browser",
    "x11vnc",
    "xvfb",
    "dbus-x11",
    "x11-utils",
    "wmctrl",
    "xdg-utils",
    "libgtk-3-bin",
    "curl",
    "python3-venv",
    "openssh-server",
    "libx11-6",
    "libxtst6",
    "libxrandr2",
    "libxfixes3",
    "libxi6",
    "libglib2.0-0t64",
    "libatspi2.0-0t64",
];

export const LinuxGuestFiles = [
    { path: "/usr/local/bin/kronterm-appearance", content: LinuxGuestSources["appearance.sh"] },
    { path: "/usr/local/bin/kronterm-cua-session", content: LinuxGuestSources["session.sh"] },
    { path: "/usr/local/bin/kronterm-focus-one", content: LinuxGuestSources["focus-one.sh"] },
    {
        path: "/usr/share/applications/kronterm-stock-browser.desktop",
        content: `[Desktop Entry]
Type=Application
Name=Web Browser
Exec=chromium-browser %u
Icon=web-browser
Terminal=false
Categories=Network;WebBrowser;
MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;
`,
    },
];

export function guestCloudFile(path: string, content: string): string {
    return `  - path: ${path}\n    permissions: '0755'\n    content: |\n${content
        .trimEnd()
        .split("\n")
        .map((line) => `      ${line}`)
        .join("\n")}\n`;
}

export const LinuxGuestCloudFiles = LinuxGuestFiles.map(({ path, content }) => guestCloudFile(path, content)).join("");
