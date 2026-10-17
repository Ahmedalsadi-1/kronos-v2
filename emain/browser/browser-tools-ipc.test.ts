// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    captureBrowserScreenshot,
    ownedBrowserGuest,
    parseBrowserCookies,
    registerBrowserToolsIpc,
} from "./browser-tools-ipc";

const electron = vi.hoisted(() => ({
    fromId: vi.fn(),
    handlers: new Map<string, (...args: any[]) => any>(),
    writeImage: vi.fn(),
}));
vi.mock("electron", () => ({
    webContents: { fromId: electron.fromId },
    ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => electron.handlers.set(name, handler) },
    clipboard: { writeImage: electron.writeImage },
    nativeImage: { createFromDataURL: vi.fn() },
}));

describe("browser guest ownership", () => {
    const sender = { id: 1, isDestroyed: () => false } as any;
    beforeEach(() => electron.fromId.mockReset());
    it("only permits live webviews owned by the invoking window", () => {
        const guest = { isDestroyed: () => false, getType: () => "webview", hostWebContents: { id: 1 } };
        electron.fromId.mockReturnValue(guest);
        expect(ownedBrowserGuest(sender, 5)).toBe(guest);
        for (const invalid of [undefined, 0.5, "5"]) {
            expect(() => ownedBrowserGuest(sender, invalid)).toThrow();
        }
        electron.fromId.mockReturnValue({ ...guest, hostWebContents: { id: 2 } });
        expect(() => ownedBrowserGuest(sender, 5)).toThrow("does not belong");
        electron.fromId.mockReturnValue({ ...guest, getType: () => "window" });
        expect(() => ownedBrowserGuest(sender, 5)).toThrow("does not belong");
        electron.fromId.mockReturnValue({ ...guest, isDestroyed: () => true });
        expect(() => ownedBrowserGuest(sender, 5)).toThrow("does not belong");
    });
    it("rejects untrusted cookie import before any session mutation", async () => {
        registerBrowserToolsIpc(() => false);
        await expect(
            electron.handlers.get("import-browser-cookies")({ sender }, { guestId: 5, cookiesJson: "[]" })
        ).rejects.toThrow("Untrusted");
        expect(electron.fromId).not.toHaveBeenCalled();
    });
});

describe("browser cookie import validation", () => {
    it("supports browser-export envelopes and host-only cookies", () => {
        const parsed = parseBrowserCookies(
            JSON.stringify({
                cookies: [
                    {
                        name: "session",
                        value: "secret",
                        domain: ".example.com",
                        path: "/",
                        hostOnly: true,
                        httpOnly: true,
                        sameSite: "strict",
                    },
                ],
            })
        );
        expect(parsed[0]).toMatchObject({
            url: "https://example.com/",
            name: "session",
            httpOnly: true,
            sameSite: "strict",
        });
        expect(parsed[0].domain).toBeUndefined();
    });
    it("rejects credentials, non-web origins, invalid rows, and excessive budgets", () => {
        for (const url of ["file:///tmp/cookie", "javascript:alert(1)", "https://user:password@example.com"]) {
            expect(() => parseBrowserCookies(JSON.stringify([{ name: "a", value: "b", url }]))).toThrow("origin");
        }
        expect(() => parseBrowserCookies(" ".repeat(1_000_001))).toThrow("1 MB");
        expect(() => parseBrowserCookies(JSON.stringify(Array(501).fill({})))).toThrow("500");
        expect(() => parseBrowserCookies(JSON.stringify([{ name: "x", value: "x".repeat(16385) }]))).toThrow(
            "Invalid cookie"
        );
    });
});

describe("browser screenshot bounds and redaction", () => {
    const viewport = { width: 500, height: 400 };
    let guest: any;
    let crop: ReturnType<typeof vi.fn>;
    let capture: ReturnType<typeof vi.fn>;
    beforeEach(() => {
        document.body.innerHTML = '<input type="password"><input data-private><div id="picker"></div>';
        for (const input of document.querySelectorAll("input")) {
            vi.spyOn(input, "getBoundingClientRect").mockReturnValue({
                x: 12,
                y: 8,
                width: 100,
                height: 20,
            } as DOMRect);
        }
        (window as any).__krontermGrab = { host: document.getElementById("picker") };
        crop = vi.fn(() => ({ toPNG: () => Buffer.from("png") }));
        capture = vi.fn(async () => {
            expect(document.querySelectorAll("[data-kronterm-capture-mask]")).toHaveLength(2);
            expect(document.getElementById("picker").style.visibility).toBe("hidden");
            return { isEmpty: () => false, getSize: () => ({ width: 1000, height: 800 }), crop };
        });
        guest = {
            executeJavaScript: vi.fn(async (script: string) =>
                script.startsWith("({width") ? viewport : window.eval(script)
            ),
            capturePage: capture,
            isDestroyed: () => false,
        };
    });
    afterEach(() => {
        document.body.innerHTML = "";
        delete (window as any).__krontermGrab;
    });
    it("masks sensitive fields and scales/clamps CSS bounds for high-DPI captures", async () => {
        const result = await captureBrowserScreenshot(guest, { x: -10, y: 20, width: 30, height: 40 });
        expect(capture).toHaveBeenCalledWith(undefined, { stayHidden: true, stayAwake: true });
        expect(crop).toHaveBeenCalledWith({ x: 0, y: 40, width: 40, height: 80 });
        expect(result).toMatchObject({ width: 20, height: 40 });
        expect(document.querySelectorAll("[data-kronterm-capture-mask]")).toHaveLength(0);
        expect(document.getElementById("picker").style.visibility).toBe("");
    });
    it("rejects malformed bounds before capture and cleans masking after capture failure", async () => {
        await expect(captureBrowserScreenshot(guest, { x: 0, y: 0, width: Infinity, height: 5 })).rejects.toThrow(
            "bounds"
        );
        expect(capture).not.toHaveBeenCalled();
        capture.mockRejectedValueOnce(new Error("unavailable"));
        await expect(captureBrowserScreenshot(guest)).rejects.toThrow("unavailable");
        expect(document.querySelectorAll("[data-kronterm-capture-mask]")).toHaveLength(0);
    });
    it("rejects fully offscreen crops and oversized PNG payloads", async () => {
        await expect(captureBrowserScreenshot(guest, { x: 600, y: 0, width: 5, height: 5 })).rejects.toThrow("outside");
        crop.mockReturnValueOnce({ toPNG: () => Buffer.alloc(2 * 1024 * 1024 + 1) });
        await expect(captureBrowserScreenshot(guest)).rejects.toThrow("2 MB");
    });
});

describe("browser history IPC", () => {
    it("preserves live guest navigation when a notch remount supplies old history", async () => {
        registerBrowserToolsIpc(() => true);
        const sender = { id: 1, isDestroyed: () => false };
        const snapshot = { entries: [{ url: "https://example.com/", title: "Old tab" }], index: 0 };
        const live = { entries: [{ url: "https://example.com/new", title: "Current tab" }], index: 0 };
        const restore = vi.fn(async () => {
            throw new Error("Cannot restore history on loaded guest");
        });
        electron.fromId.mockReturnValue({
            isDestroyed: () => false,
            getType: () => "webview",
            getURL: () => live.entries[0].url,
            hostWebContents: { id: 1 },
            navigationHistory: { restore, getAllEntries: () => live.entries, getActiveIndex: () => 0 },
        });
        const handler = electron.handlers.get("browser-navigation-history");
        await expect(handler({ sender }, 5, snapshot)).resolves.toEqual(live);
        expect(restore).not.toHaveBeenCalled();
    });

    it("restores history only inside an owned browser guest", async () => {
        registerBrowserToolsIpc(() => true);
        const sender = { id: 1, isDestroyed: () => false };
        const snapshot = { entries: [{ url: "https://example.com/", title: "Example" }], index: 0 };
        const restore = vi.fn(async () => {});
        const guest = {
            isDestroyed: () => false,
            getType: () => "webview",
            getURL: () => "",
            hostWebContents: { id: 1 },
            navigationHistory: { restore, getAllEntries: () => snapshot.entries, getActiveIndex: () => 0 },
        };
        electron.fromId.mockReturnValue(guest);
        const handler = electron.handlers.get("browser-navigation-history");
        await expect(handler({ sender }, 5, snapshot)).resolves.toEqual(snapshot);
        expect(restore).toHaveBeenCalledWith(snapshot);
        electron.fromId.mockReturnValue({ ...guest, hostWebContents: { id: 2 } });
        await expect(handler({ sender }, 5, snapshot)).rejects.toThrow("does not belong");
        expect(restore).toHaveBeenCalledTimes(1);
    });
});
