// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { UserFacingPresentations } from "./workspace-presentation-switcher";

describe("workspace presentation switcher", () => {
    it("offers the active V2 presentation without exposing migrated legacy layouts", () => {
        expect(UserFacingPresentations).toEqual(["os"]);
    });
});
