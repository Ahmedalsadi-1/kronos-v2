// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    addOSDockPin,
    DefaultOSDockPins,
    greetingForHour,
    makeUrlDockPin,
    moveOSDockPin,
    normalizeDockUrl,
    OSDockPinsStorageKey,
    readOSDockPins,
    removeOSDockPin,
    writeOSDockPins,
} from "./os-desktop-model";

function memoryStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => {
            data[key] = value;
        },
    };
}

describe("normalizeDockUrl", () => {
    it("accepts bare hosts and http(s) URLs", () => {
        expect(normalizeDockUrl("github.com")).toBe("https://github.com");
        expect(normalizeDockUrl("https://linear.app/team/")).toBe("https://linear.app/team");
        expect(normalizeDockUrl("http://localhost:3000")).toBe("http://localhost:3000");
    });

    it("rejects non-web schemes and nonsense", () => {
        expect(normalizeDockUrl("javascript:alert(1)")).toBeUndefined();
        expect(normalizeDockUrl("file:///etc/passwd")).toBeUndefined();
        expect(normalizeDockUrl("not a url")).toBeUndefined();
        expect(normalizeDockUrl("")).toBeUndefined();
    });
});

describe("dock pins", () => {
    it("falls back to defaults and survives corrupt storage", () => {
        expect(readOSDockPins(memoryStorage())).toEqual(DefaultOSDockPins);
        expect(readOSDockPins(memoryStorage({ [OSDockPinsStorageKey]: "{" }))).toEqual(DefaultOSDockPins);
    });

    it("drops invalid stored pins", () => {
        const storage = memoryStorage({
            [OSDockPinsStorageKey]: JSON.stringify([
                { id: "x", kind: "url", name: "Bad", url: "javascript:void(0)" },
                { id: "a", kind: "app", name: "Notes", appId: "com.apple.Notes" },
            ]),
        });
        expect(readOSDockPins(storage)).toEqual([{ id: "a", kind: "app", name: "Notes", appId: "com.apple.Notes" }]);
    });

    it("keeps quick links to distinct pages on the same site", () => {
        const first = makeUrlDockPin("https://example.com/search?q=one", "First search");
        const second = makeUrlDockPin("https://example.com/search?q=two", "Second search");
        const pins = addOSDockPin(addOSDockPin([], first), second);
        const storage = memoryStorage();
        writeOSDockPins(storage, pins);
        expect(readOSDockPins(storage)).toEqual([first, second]);
    });

    it("round-trips, deduplicates, reorders, and removes", () => {
        const storage = memoryStorage();
        const github = makeUrlDockPin("https://github.com");
        expect(github.name).toBe("Github");
        let pins = addOSDockPin([], github);
        pins = addOSDockPin(pins, github);
        pins = addOSDockPin(pins, makeUrlDockPin("https://linear.app", "Linear"));
        expect(pins.map((pin) => pin.name)).toEqual(["Github", "Linear"]);
        pins = moveOSDockPin(pins, pins[1].id, -1);
        expect(pins.map((pin) => pin.name)).toEqual(["Linear", "Github"]);
        writeOSDockPins(storage, pins);
        expect(readOSDockPins(storage)).toEqual(pins);
        expect(removeOSDockPin(pins, github.id).map((pin) => pin.name)).toEqual(["Linear"]);
    });
});

describe("greetingForHour", () => {
    it("follows the time of day", () => {
        expect(greetingForHour(8)).toBe("Good morning");
        expect(greetingForHour(14)).toBe("Good afternoon");
        expect(greetingForHour(21)).toBe("Good evening");
    });
});
