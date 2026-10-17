// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { ComputerTargetsAppium, parseAppiumTargets, validateAppiumUrl } from "./computer-targets-appium";

const session = (platformName = "iOS", automationName = "XCUITest") => ({
    id: "device-session",
    capabilities: { platformName, "appium:automationName": automationName, "appium:deviceName": "Test phone" },
});
const reply = (value: unknown) =>
    new Response(JSON.stringify({ value }), { headers: { "Content-Type": "application/json" } });

describe("Appium existing-session adapter", () => {
    it("restricts endpoints to fixed HTTP loopback paths and disables DNS localhost resolution", () => {
        expect(validateAppiumUrl("http://localhost:4723/wd/hub")).toBe("http://127.0.0.1:4723/wd/hub");
        for (const url of [
            "https://127.0.0.1:4723",
            "http://example.com",
            "http://127.0.0.1.evil",
            "http://user:secret@127.0.0.1",
            "http://127.0.0.1/arbitrary",
            "http://127.0.0.1?url=remote",
        ]) {
            expect(() => validateAppiumUrl(url)).toThrow();
        }
    });

    it("accepts only supported native driver sessions and accurate platform capabilities", () => {
        const targets = parseAppiumTargets([
            session(),
            session("Android", "UiAutomator2"),
            session("iOS", "Safari"),
            { id: "../evil", capabilities: session().capabilities },
        ]);
        expect(targets).toHaveLength(2);
        expect(targets[0].kind).toBe("ios-device");
        expect(targets[0].capabilities).not.toContain("back");
        expect(targets[1].capabilities).toContain("back");
    });

    it("rejects invalid actions before requests", async () => {
        const request = vi.fn();
        const adapter = new ComputerTargetsAppium("http://127.0.0.1:4723", request);
        const target = parseAppiumTargets([session()])[0];
        await expect(adapter.perform(target, { targetId: target.id, action: "tap", x: NaN, y: 0 })).rejects.toThrow(
            "coordinates"
        );
        await expect(
            adapter.perform(target, { targetId: target.id, action: "type", text: "a".repeat(4097) })
        ).rejects.toThrow("4096");
        expect(request).not.toHaveBeenCalled();
    });

    it("converts normalized taps into W3C touch actions", async () => {
        const request = vi.fn(async () => reply({ width: 101, height: 201 }));
        const adapter = new ComputerTargetsAppium("http://127.0.0.1:4723", request);
        const target = parseAppiumTargets([session()])[0];
        await adapter.perform(target, { targetId: target.id, action: "tap", x: 0.5, y: 1 });
        const [, init] = request.mock.calls[1] as unknown as [string, RequestInit];
        expect(JSON.parse(init.body as string).actions[0].actions[0]).toMatchObject({ x: 50, y: 200 });
    });

    it("checks ownership again after viewport lookup before sending a gesture", async () => {
        const request = vi.fn(async () => reply({ width: 101, height: 201 }));
        const adapter = new ComputerTargetsAppium("http://127.0.0.1:4723", request);
        const target = parseAppiumTargets([session()])[0];
        await expect(
            adapter.perform(target, { targetId: target.id, action: "tap", x: 0.5, y: 0.5 }, () => {
                throw new Error("taken over");
            })
        ).rejects.toThrow("taken over");
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("uses modern discovery and falls back only for missing legacy endpoints", async () => {
        const urls: string[] = [];
        const request = vi.fn(async (url: string) => {
            urls.push(url);
            return urls.length === 1
                ? new Response(JSON.stringify({ value: { error: "unknown command" } }), { status: 404 })
                : reply([session()]);
        });
        expect(await new ComputerTargetsAppium("http://127.0.0.1:4723", request).list()).toHaveLength(1);
        expect(urls).toEqual(["http://127.0.0.1:4723/appium/sessions", "http://127.0.0.1:4723/sessions"]);
        const denied = vi.fn(
            async () => new Response(JSON.stringify({ value: { error: "forbidden" } }), { status: 403 })
        );
        await expect(new ComputerTargetsAppium("http://127.0.0.1:4723", denied).list()).rejects.toThrow(
            "session_discovery"
        );
        expect(denied).toHaveBeenCalledTimes(1);
    });

    it("types Unicode into the focused native element through the supported value endpoint", async () => {
        const requests: { url: string; init: RequestInit }[] = [];
        const request = vi.fn(async (url: string, init: RequestInit) => {
            requests.push({ url, init });
            return reply({ "element-6066-11e4-a52e-4f735466cecf": "focused-field" });
        });
        const target = parseAppiumTargets([session()])[0];
        await new ComputerTargetsAppium("http://127.0.0.1:4723", request).perform(target, {
            targetId: target.id,
            action: "type",
            text: "Hello \u4e16\u754c",
        });
        expect(requests[1].url).toContain("/element/focused-field/value");
        expect(JSON.parse(requests[1].init.body as string)).toEqual({ text: "Hello \u4e16\u754c" });
    });

    it("rejects redirects and protocol errors", async () => {
        const request = vi.fn(async (_url: string, init: RequestInit) => {
            expect(init.redirect).toBe("error");
            return reply({ error: "invalid session id" });
        });
        await expect(new ComputerTargetsAppium("http://127.0.0.1:4723", request).list()).rejects.toThrow(
            "operation failed"
        );
    });
});
