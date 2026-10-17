// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import { resolveBlockView } from "./retired-chat-view";

describe("retired chat widget compatibility", () => {
    test.each(["chathubv2", "kronoschat", "kronoschamber"])("restores %s using Hermes", (view) => {
        expect(resolveBlockView(view)).toBe("hermes");
    });

    test.each(["hermes", "term", "web", "preview", "kronsettings", "waveai"])("preserves %s", (view) => {
        expect(resolveBlockView(view)).toBe(view);
    });
});
