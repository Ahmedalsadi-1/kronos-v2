// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { UserFacingPresentations } from "./workspace-presentation-switcher";

describe("workspace presentation switcher", () => {
    it("offers every supported workspace presentation", () => {
        expect(UserFacingPresentations).toEqual(["os", "canvas", "widgets", "tabs", "web"]);
    });
});
