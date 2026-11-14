// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    getAdjacentWorkspacePresentation,
    isWorkspacePresentation,
    normalizeWorkspacePresentation,
} from "./workspace-presentation";

describe("workspace presentation navigation", () => {
    it("cycles forward and backward through every presentation", () => {
        expect(getAdjacentWorkspacePresentation("widgets", 1)).toBe("tabs");
        expect(getAdjacentWorkspacePresentation("tabs", 1)).toBe("os");
        expect(getAdjacentWorkspacePresentation("os", 1)).toBe("widgets");
        expect(getAdjacentWorkspacePresentation("widgets", -1)).toBe("os");
        expect(getAdjacentWorkspacePresentation("os", -1)).toBe("tabs");
    });

    it("maps saved legacy layouts to active presentations", () => {
        expect(normalizeWorkspacePresentation("canvas")).toBe("os");
        expect(normalizeWorkspacePresentation("web")).toBe("tabs");
        expect(normalizeWorkspacePresentation("browsermode")).toBe("tabs");
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
