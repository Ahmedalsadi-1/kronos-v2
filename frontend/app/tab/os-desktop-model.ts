// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type OSDockPin =
    | { id: string; kind: "url"; name: string; url: string }
    | { id: string; kind: "app"; name: string; appId: string; icon?: string };

export const OSDockPinsStorageKey = "kronterm:os-dock-pins:v1";
export const OSDesktopWidgetsStorageKey = "kronterm:os-desktop-widgets";
const MaxPins = 12;

export const DefaultOSDockPins: OSDockPin[] = [
    { id: "url:mail.google.com", kind: "url", name: "Gmail", url: "https://mail.google.com" },
    { id: "url:calendar.google.com", kind: "url", name: "Calendar", url: "https://calendar.google.com" },
    { id: "url:drive.google.com", kind: "url", name: "Drive", url: "https://drive.google.com" },
    { id: "url:app.slack.com", kind: "url", name: "Slack", url: "https://app.slack.com" },
];

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Accepts bare hosts ("github.com") and rejects anything that is not http(s). */
export function normalizeDockUrl(input: string): string | undefined {
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(candidate);
        if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
        if (!url.hostname.includes(".") && url.hostname !== "localhost") return undefined;
        return url.toString().replace(/\/$/, "");
    } catch {
        return undefined;
    }
}

export function dockNameForUrl(url: string): string {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const label = host.split(".")[0] ?? host;
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function makeUrlDockPin(url: string, name?: string): OSDockPin {
    const parsedUrl = new URL(url);
    return {
        id: `url:${parsedUrl.host}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`,
        kind: "url",
        name: name || dockNameForUrl(url),
        url,
    };
}

function isPin(value: unknown): value is OSDockPin {
    const pin = value as OSDockPin;
    if (!pin || typeof pin.id !== "string" || typeof pin.name !== "string") return false;
    if (pin.kind === "url") return typeof pin.url === "string" && normalizeDockUrl(pin.url) != null;
    return pin.kind === "app" && typeof pin.appId === "string";
}

export function readOSDockPins(storage: StorageLike): OSDockPin[] {
    try {
        const raw = storage.getItem(OSDockPinsStorageKey);
        if (raw == null) return DefaultOSDockPins;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isPin).slice(0, MaxPins) : DefaultOSDockPins;
    } catch {
        return DefaultOSDockPins;
    }
}

export function writeOSDockPins(storage: StorageLike, pins: OSDockPin[]): void {
    try {
        storage.setItem(OSDockPinsStorageKey, JSON.stringify(pins.slice(0, MaxPins)));
    } catch {
        // Pins just won't persist.
    }
}

export function addOSDockPin(pins: OSDockPin[], pin: OSDockPin): OSDockPin[] {
    if (pins.some((existing) => existing.id === pin.id)) return pins;
    return [...pins, pin].slice(0, MaxPins);
}

export function removeOSDockPin(pins: OSDockPin[], id: string): OSDockPin[] {
    return pins.filter((pin) => pin.id !== id);
}

export function moveOSDockPin(pins: OSDockPin[], id: string, delta: -1 | 1): OSDockPin[] {
    const index = pins.findIndex((pin) => pin.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= pins.length) return pins;
    const next = [...pins];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

export function greetingForHour(hour: number): string {
    if (hour < 5) return "Good evening";
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}
