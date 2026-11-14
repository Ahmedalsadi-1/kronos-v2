// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export function isPenEditorFrameNavigation(input: {
    url: string;
    name: string;
    parentUrl: string;
    parentName: string;
    topUrl: string;
    parentIsTop: boolean;
}): boolean {
    try {
        const url = new URL(input.url);
        const host = new URL("./pen/editor/index.html", input.topUrl);
        const engine = new URL("../web/index.html", host);
        const samePage = (a: URL, b: URL) =>
            a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname;
        if (input.name === "kronos-pen-editor" && input.parentIsTop) return samePage(url, host);
        return (
            input.name === "kronos-pen-engine" &&
            input.parentName === "kronos-pen-editor" &&
            samePage(new URL(input.parentUrl), host) &&
            samePage(url, engine) &&
            url.searchParams.has("embed")
        );
    } catch {
        return false;
    }
}
