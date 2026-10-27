// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { ComputerTargetsRuntime, parseComputerTargets } from "./computer-targets-runtime";

const DeviceId = "12345678-1234-1234-1234-123456789abc";
const deviceList = (state = "Shutdown") =>
    JSON.stringify({
        devices: {
            "com.apple.CoreSimulator.SimRuntime.iOS-18-0": [
                { udid: DeviceId, name: "iPhone", state, isAvailable: true },
            ],
        },
    });

it("validates and routes phone hardware buttons to each simulator adapter", async () => {
    const androidKey = vi.fn();
    const android = {
        discover: async () => [{ id: "android-adb:phone", name: "Phone", status: "booted", runtime: "Android" }],
        key: androidKey,
    };
    const androidRuntime = new ComputerTargetsRuntime(vi.fn(), "linux", undefined, android as any);
    await androidRuntime.perform({
        targetId: "android-adb:phone",
        action: "button",
        button: "power",
        expectedGeneration: 0,
    });
    expect(androidKey).toHaveBeenCalledWith("android-adb:phone", "Power");
    await expect(
        androidRuntime.perform({ targetId: "android-adb:phone", action: "button", button: "invalid" })
    ).rejects.toThrow("Unsupported device button");
    await expect(
        androidRuntime.perform({
            targetId: "android-adb:phone",
            action: "button",
            button: "power",
            expectedGeneration: 99,
        })
    ).rejects.toThrow("Control changed");

    const iosButton = vi.fn();
    const iosRuntime = new ComputerTargetsRuntime(
        vi.fn(async () => deviceList("Booted")),
        "darwin",
        undefined,
        undefined,
        { button: iosButton } as any
    );
    await iosRuntime.perform({ targetId: DeviceId, action: "button", button: "power", expectedGeneration: 0 });
    expect(iosButton).toHaveBeenCalledWith(DeviceId, "lock", expect.any(Function));
    await iosRuntime.perform({ targetId: DeviceId, action: "button", button: "volume-up", expectedGeneration: 0 });
    expect(iosButton).toHaveBeenCalledWith(DeviceId, "volume-up", expect.any(Function));
});

describe("ComputerTargetsRuntime", () => {
    it("filters unsupported devices and exposes only state-supported capabilities", () => {
        const data = JSON.parse(deviceList());
        data.devices["com.apple.CoreSimulator.SimRuntime.watchOS-11-0"] = [{ udid: DeviceId }];
        data.devices["com.apple.CoreSimulator.SimRuntime.iOS-18-0"].push({ udid: "bad", name: "unsafe" });
        expect(parseComputerTargets(JSON.stringify(data))).toHaveLength(1);
        expect(parseComputerTargets(deviceList())[0].capabilities).toEqual(["boot", "open"]);
        expect(parseComputerTargets(deviceList("Booted"))[0].capabilities).toContain("screenshot");
    });

    it("reports unavailable platform without spawning commands", async () => {
        const execute = vi.fn();
        await expect(new ComputerTargetsRuntime(execute, "linux").list()).rejects.toThrow("macOS");
        expect(execute).not.toHaveBeenCalled();
    });

    it("rejects malformed identifiers and unsupported commands before execution", async () => {
        const execute = vi.fn(async (_file: string, _args: string[]) => deviceList());
        const runtime = new ComputerTargetsRuntime(execute, "darwin");
        await expect(runtime.perform({ targetId: "--all", action: "boot" })).rejects.toThrow("identifier");
        await expect(runtime.perform({ targetId: DeviceId, action: "install" })).rejects.toThrow("Unsupported");
        expect(execute).not.toHaveBeenCalled();
    });

    it("invalidates stale requests when a user takes control", async () => {
        const execute = vi.fn(async (_file: string, _args: string[]) => deviceList());
        const runtime = new ComputerTargetsRuntime(execute, "darwin");
        await runtime.takeOver(DeviceId);
        await expect(runtime.perform({ targetId: DeviceId, action: "boot", expectedGeneration: 0 })).rejects.toThrow(
            "Control changed"
        );
        expect(execute.mock.calls.every(([, args]) => args[1] === "list")).toBe(true);
    });

    it("uses argument arrays and refreshes status after boot", async () => {
        let state = "Shutdown";
        const execute = vi.fn(async (_file: string, args: string[]) => {
            if (args[1] === "boot") state = "Booted";
            return deviceList(state);
        });
        const snapshot = await new ComputerTargetsRuntime(execute, "darwin").perform({
            targetId: DeviceId,
            action: "boot",
        });
        expect(execute).toHaveBeenCalledWith("/usr/bin/xcrun", ["simctl", "boot", DeviceId]);
        expect(snapshot.target.status).toBe("booted");
    });

    it("discards in-flight results after takeover and releases the action lock", async () => {
        let finish: () => void;
        let started: () => void;
        const didStart = new Promise<void>((resolve) => {
            started = resolve;
        });
        const canFinish = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const execute = vi.fn(async (_file: string, args: string[]) => {
            if (args[1] === "boot") {
                started();
                await canFinish;
            }
            return deviceList();
        });
        const runtime = new ComputerTargetsRuntime(execute, "darwin");
        const pending = runtime.perform({ targetId: DeviceId, action: "boot" });
        await didStart;
        await expect(runtime.perform({ targetId: DeviceId, action: "boot" })).rejects.toThrow("already running");
        await runtime.takeOver(DeviceId);
        finish();
        await expect(pending).rejects.toThrow("result was discarded");
        await expect(runtime.perform({ targetId: DeviceId, action: "open" })).resolves.toMatchObject({
            target: { controlGeneration: 1 },
        });
    });

    it("keeps agent mutations paused even after discovery until explicit user resume", async () => {
        const execute = vi.fn(async (_file: string, _args: string[]) => deviceList());
        const runtime = new ComputerTargetsRuntime(execute, "darwin");
        const taken = await runtime.takeOver(DeviceId);
        expect(taken.target.automationPaused).toBe(true);
        const fresh = (await runtime.list())[0];
        await expect(
            runtime.performAgent({ targetId: DeviceId, action: "open", expectedGeneration: fresh.controlGeneration })
        ).rejects.toThrow("paused by the user");
        await expect(runtime.resume(DeviceId, 0)).rejects.toThrow("Control changed");
        const resumed = await runtime.resume(DeviceId, fresh.controlGeneration);
        expect(resumed.target.automationPaused).toBe(false);
        expect(resumed.target.controlGeneration).toBe(2);
        await expect(
            runtime.performAgent({ targetId: DeviceId, action: "open", expectedGeneration: fresh.controlGeneration })
        ).rejects.toThrow("Control changed");
        await expect(
            runtime.performAgent({
                targetId: DeviceId,
                action: "open",
                expectedGeneration: resumed.target.controlGeneration,
            })
        ).resolves.toMatchObject({ target: { automationPaused: false } });
    });

    it("captures a validated PNG without exposing a filesystem path", async () => {
        const execute = vi.fn(async (_file: string, args: string[]) => {
            if (args.includes("screenshot"))
                await writeFile(args[args.length - 1], Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
            return deviceList("Booted");
        });
        const snapshot = await new ComputerTargetsRuntime(execute, "darwin").perform({
            targetId: DeviceId,
            action: "screenshot",
        });
        expect(snapshot.imageDataUrl).toMatch(/^data:image\/png;base64,/);
        expect(snapshot.capturedAt).toBeGreaterThan(0);
    });
});

it("shuts down an idle iOS simulator despite repeated discovery", async () => {
    vi.useFakeTimers();
    let state = "Booted";
    const execute = vi.fn(async (_file: string, args: string[]) => {
        if (args[1] === "shutdown") state = "Shutdown";
        return deviceList(state);
    });
    try {
        const runtime = new ComputerTargetsRuntime(execute, "darwin");
        await runtime.list();
        await vi.advanceTimersByTimeAsync(290_000);
        await runtime.list();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(execute).toHaveBeenCalledWith("/usr/bin/xcrun", ["simctl", "shutdown", DeviceId]);
    } finally {
        vi.useRealTimers();
    }
});

it("never arms an idle shutdown for a physical Android phone", async () => {
    vi.useFakeTimers();
    const shutdown = vi.fn();
    const android = {
        discover: async () => [{ id: "android-adb:phone", name: "Phone", status: "booted", runtime: "Android device" }],
        shutdown,
    };
    try {
        const runtime = new ComputerTargetsRuntime(vi.fn(), "linux", undefined, android as any);
        const targets = await runtime.list();
        expect(targets[0].capabilities).toContain("key");
        expect(targets[0].capabilities).not.toContain("shutdown");
        await vi.advanceTimersByTimeAsync(600_000);
        expect(shutdown).not.toHaveBeenCalled();
    } finally {
        vi.useRealTimers();
    }
});
