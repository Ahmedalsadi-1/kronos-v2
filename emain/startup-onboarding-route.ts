// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function isStartupWelcomeFrame(frameURL: string, entry: string): boolean {
    if (!URL.canParse(frameURL)) return false;
    const location = new URL(frameURL);
    return location.origin + location.pathname === entry && location.hash === "#welcome";
}
