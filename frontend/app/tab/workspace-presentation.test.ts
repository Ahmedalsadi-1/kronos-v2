// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    getAdjacentWorkspacePresentation,
    isWorkspacePresentation,
    normalizeWorkspacePresentation,
    publishWorkspacePresentation,
    readWorkspacePresentation,
} from "./workspace-presentation";

describe("workspace presentation navigation", () => {
    it("always reads and publishes OS for saved presentation names", () => {
        for (const previous of ["widgets", "tabs", "canvas", "os", "web"] as const) {
            expect(normalizeWorkspacePresentation(previous)).toBe("os");
            expect(readWorkspacePresentation(previous)).toBe("os");
            expect(publishWorkspacePresentation(previous)).toBe("os");
            expect(getAdjacentWorkspacePresentation(previous, 1)).toBe("os");
            expect(getAdjacentWorkspacePresentation(previous, -1)).toBe("os");
        }
        expect(normalizeWorkspacePresentation("browsermode")).toBe("os");
    });

    it("accepts only supported presentations", () => {
        expect(isWorkspacePresentation("widgets")).toBe(true);
        expect(isWorkspacePresentation("tabs")).toBe(true);
        expect(isWorkspacePresentation("canvas")).toBe(true);
        expect(isWorkspacePresentation("os")).toBe(true);
        expect(isWorkspacePresentation("web")).toBe(true);
        expect(isWorkspacePresentation("grid")).toBe(false);
        expect(isWorkspacePresentation(null)).toBe(false);
    });
});
