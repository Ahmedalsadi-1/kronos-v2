// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { afterEach, expect, test, vi } from "vitest";
import { DataStudioModel } from "./datastudio-model";

vi.mock("./datastudio", () => ({ DataStudioView: () => null }));
vi.mock("@/app/store/jotaiStore", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});
afterEach(() => vi.unstubAllGlobals());

test("imports and edits persist across widget reload; a rejected save preserves the prior data", () => {
    const values = new Map<string, string>();
    let fail = false;
    vi.stubGlobal("window", {
        localStorage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                if (fail) throw new Error("Storage full");
                values.set(key, value);
            },
        },
    });
    const model = new DataStudioModel({ blockId: "data-1" } as ViewModelInitType);
    model.import("Name,Count\nFirst,1\nSecond,2", "sample.csv");
    model.edit(1, 1, "20");
    const restored = new DataStudioModel({ blockId: "data-1" } as ViewModelInitType);
    expect(globalStore.get(restored.dataset).rows[1]).toEqual(["Second", "20"]);
    fail = true;
    expect(() => restored.edit(1, 1, "30")).toThrow("Storage full");
    expect(globalStore.get(restored.dataset).rows[1]).toEqual(["Second", "20"]);
    expect(new DataStudioModel({ blockId: "data-2" } as ViewModelInitType)).toBeTruthy();
    expect(() => restored.import("A,B\n1", "bad.csv")).toThrow("row 2");
    expect(globalStore.get(restored.dataset).filename).toBe("sample.csv");
});

test("denied storage is surfaced without crashing the widget", () => {
    vi.stubGlobal("window", {
        get localStorage() {
            throw new Error("Storage denied");
        },
    });
    const model = new DataStudioModel({ blockId: "blocked" } as ViewModelInitType);
    expect(globalStore.get(model.dataset)).toBeNull();
    expect(globalStore.get(model.error)).toBe("Storage denied");
});
