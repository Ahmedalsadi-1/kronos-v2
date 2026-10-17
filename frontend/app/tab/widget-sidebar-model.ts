// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export const WidgetSidebarDefaultWidth = 280;
export const WidgetSidebarMinWidth = 180;
export const WidgetSidebarMaxWidth = 480;
export const WidgetSidebarWidthKey = "layout:tabs:sidebarwidth";

export function clampWidgetSidebarWidth(width: unknown): number {
    const value = typeof width === "number" && Number.isFinite(width) ? width : WidgetSidebarDefaultWidth;
    return Math.round(Math.min(WidgetSidebarMaxWidth, Math.max(WidgetSidebarMinWidth, value)));
}

export function widgetSidebarWidthPatch(width: unknown): Record<string, number> {
    return { [WidgetSidebarWidthKey]: clampWidgetSidebarWidth(width) };
}

export function groupWidgetSidebarEntries<T extends { meta?: Record<string, unknown> }>(entries: readonly T[]) {
    const groups = new Map<string, { key: string; title: string; detail: string; entries: T[] }>();
    for (const entry of entries) {
        const root = String(entry.meta?.["environment:root"] || entry.meta?.["cmd:cwd"] || "").trim();
        const connection = String(entry.meta?.["environment:connection"] || entry.meta?.connection || "").trim();
        const key = JSON.stringify([root, connection]);
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                title: root ? root.replace(/\/$/, "").split("/").at(-1) || root : "Workspace",
                detail: [root, connection].filter(Boolean).join(" · "),
                entries: [],
            };
            groups.set(key, group);
        }
        group.entries.push(entry);
    }
    return [...groups.values()];
}
