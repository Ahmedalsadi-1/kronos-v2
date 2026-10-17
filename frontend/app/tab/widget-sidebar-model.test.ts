// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    clampWidgetSidebarWidth,
    groupWidgetSidebarEntries,
    WidgetSidebarWidthKey,
    widgetSidebarWidthPatch,
} from "./widget-sidebar-model";

describe("widget sidebar state", () => {
    it("restores valid persisted width and bounds invalid or dragged widths", () => {
        expect(clampWidgetSidebarWidth(undefined)).toBe(280);
        expect(clampWidgetSidebarWidth(Number.NaN)).toBe(280);
        expect(clampWidgetSidebarWidth(310.2)).toBe(310);
        expect(clampWidgetSidebarWidth(70)).toBe(180);
        expect(clampWidgetSidebarWidth(900)).toBe(480);
        const persisted = widgetSidebarWidthPatch(340);
        expect(clampWidgetSidebarWidth(persisted[WidgetSidebarWidthKey])).toBe(340);
        expect(persisted).toEqual({ "layout:tabs:sidebarwidth": 340 });
    });
    it("groups project widgets without mixing different connections or inventing repository state", () => {
        const entries = [
            { id: "term", meta: { "cmd:cwd": "/projects/app" } },
            { id: "browser", meta: { "environment:root": "/projects/app" } },
            { id: "remote", meta: { "environment:root": "/projects/app", connection: "host" } },
            { id: "other", meta: {} },
        ];
        const groups = groupWidgetSidebarEntries(entries);
        expect(groups).toHaveLength(3);
        expect(groups[0].entries.map((entry) => entry.id)).toEqual(["term", "browser"]);
        expect(groups[0].title).toBe("app");
        expect(groups[1].detail).toBe("/projects/app · host");
        expect(groups[2].title).toBe("Workspace");
        expect(groups[2].detail).toBe("");
    });
});
