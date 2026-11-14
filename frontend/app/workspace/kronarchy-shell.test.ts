import { describe, expect, test } from "vitest";
import {
    CommandSpaceCompatibilityStorageKey,
    KronarchyEnabledStorageKey,
    migrateKronarchyPreference,
    shouldOpenKronarchyLauncher,
    shouldUseNativeLauncherActivation,
} from "./kronarchy-shell";

const makeShortcut = (overrides: Partial<KeyboardEvent> = {}) =>
    ({
        altKey: false,
        code: "Space",
        ctrlKey: false,
        metaKey: true,
        shiftKey: true,
        ...overrides,
    }) as KeyboardEvent;

describe("shouldOpenKronarchyLauncher", () => {
    test("opens the canonical Shift+Command+Space shortcut", () => {
        expect(shouldOpenKronarchyLauncher(makeShortcut(), false)).toBe(true);
    });
    test("supports Control+Shift+Space on Windows and Linux", () => {
        expect(shouldOpenKronarchyLauncher(makeShortcut({ metaKey: false, ctrlKey: true }), false)).toBe(true);
        expect(
            shouldOpenKronarchyLauncher(makeShortcut({ metaKey: false, ctrlKey: true, shiftKey: false }), true)
        ).toBe(false);
    });

    test("keeps plain Command+Space for migrated users", () => {
        expect(shouldOpenKronarchyLauncher(makeShortcut({ shiftKey: false }), false)).toBe(false);
        expect(shouldOpenKronarchyLauncher(makeShortcut({ shiftKey: false }), true)).toBe(true);
    });

    test("does not open for conflicting modifiers", () => {
        expect(shouldOpenKronarchyLauncher(makeShortcut({ altKey: true }), true)).toBe(false);
        expect(shouldOpenKronarchyLauncher(makeShortcut({ ctrlKey: true }), true)).toBe(false);
    });
});

describe("migrateKronarchyPreference", () => {
    test("moves the old shell flag to the one-release Command+Space compatibility flag", () => {
        const values = new Map([[KronarchyEnabledStorageKey, "true"]]);
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            removeItem: (key: string) => void values.delete(key),
            setItem: (key: string, value: string) => void values.set(key, value),
        };

        expect(migrateKronarchyPreference(storage)).toBe(true);
        expect(values.has(KronarchyEnabledStorageKey)).toBe(false);
        expect(values.get(CommandSpaceCompatibilityStorageKey)).toBe("true");
    });

    test("removes a disabled legacy flag without enabling the shortcut", () => {
        const values = new Map([[KronarchyEnabledStorageKey, "false"]]);
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            removeItem: (key: string) => void values.delete(key),
            setItem: (key: string, value: string) => void values.set(key, value),
        };

        expect(migrateKronarchyPreference(storage)).toBe(false);
        expect(values.has(KronarchyEnabledStorageKey)).toBe(false);
        expect(values.has(CommandSpaceCompatibilityStorageKey)).toBe(false);
    });
});

describe("Command Center focused activation", () => {
    test("leaves Enter on a focused result or its child to the native button click", () => {
        const button = {} as HTMLElement;
        expect(shouldUseNativeLauncherActivation({ closest: () => button })).toBe(true);
    });

    test("uses the selected search result when Enter originates in the search field", () => {
        expect(shouldUseNativeLauncherActivation({ closest: () => null })).toBe(false);
    });
});
