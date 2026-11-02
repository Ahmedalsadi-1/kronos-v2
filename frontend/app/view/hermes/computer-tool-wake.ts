// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import type { HermesToolActivity } from "./hermes-tool-activity";

const ComputerToolPattern =
    /^(?:orgo[_-]computer(?:[_-]|$)|sandbox_vm_(?:desktop|exec|files|browser)$|linux_desktop_(?:start|screenshot|click|drag|type|key|scroll|exec|launch_app|open_url)$|computer_(?:screenshot|click|type|key|scroll|move|drag)$)/;

export function computerActivityTarget(activity: HermesToolActivity): { desktopId?: string } | undefined {
    if (activity.phase !== "running" || activity.foreground === false || !ComputerToolPattern.test(activity.name))
        return;
    const value = activity.args?.desktopId ?? activity.args?.desktop_id;
    return {
        desktopId:
            typeof value === "string" && value.trim()
                ? value.trim()
                : activity.name.startsWith("linux_desktop_")
                  ? "linux-vm:ubuntu"
                  : undefined,
    };
}

export function createComputerToolWake(open: (desktopId?: string) => Promise<unknown>, now = Date.now) {
    let opening: Promise<unknown>;
    let lastWake = -Infinity;
    let lastSession = "";
    const seen = new Set<string>();
    return (activity: HermesToolActivity) => {
        const target = computerActivityTarget(activity);
        if (!target) return;
        const key = activity.toolId ? `${activity.sessionId ?? ""}:${activity.toolId}` : "";
        if (key && seen.has(key)) return;
        if (key) {
            seen.add(key);
            if (seen.size > 512) seen.delete(seen.values().next().value);
        }
        if (opening || (lastSession === activity.sessionId && now() - lastWake < 30000)) return;
        lastSession = activity.sessionId;
        lastWake = now();
        opening = Promise.resolve()
            .then(() => open(target.desktopId))
            .catch((error) => {
                lastWake = -Infinity;
                console.warn("[hermes] could not open Computer widget", error);
            })
            .finally(() => {
                opening = undefined;
            });
    };
}
