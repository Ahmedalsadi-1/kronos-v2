// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import { readOSResourceDragPayload, systemSearchItemToResource } from "./os-resource-service";

describe("OS resource service", () => {
    test("preserves repository identity when converting system search results", () => {
        expect(
            systemSearchItemToResource({
                kind: "repository",
                name: "kronterm",
                path: "/work/kronterm",
                detail: "~/work/kronterm",
            })
        ).toEqual({
            id: "local:/work/kronterm",
            kind: "repository",
            name: "kronterm",
            resource: "/work/kronterm",
            detail: "~/work/kronterm",
        });
    });

    test("normalizes wallpaper results into file references", () => {
        expect(
            systemSearchItemToResource({
                kind: "wallpaper",
                name: "mist.png",
                path: "/Pictures/mist.png",
                detail: "~/Pictures/mist.png",
            }).kind
        ).toBe("file");
    });

    test("rejects incomplete drag payloads", () => {
        expect(
            readOSResourceDragPayload({
                getData: () => JSON.stringify({ kind: "file", name: "missing-path" }),
            })
        ).toBeUndefined();
    });
});
