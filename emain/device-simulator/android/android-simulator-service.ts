// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { SaxesParser } from "saxes";
import type { DeviceSelectedElement } from "../../../frontend/types/computer-targets";
import { AndroidLiveStream } from "./android-live-stream";
import { parseAdbDevices, parseWmSize } from "./vendor/orca/android/adb-devices";
import { androidButtonKeycode, normalizedToDevicePixels } from "./vendor/orca/android/android-input-mapping";
import { AndroidSdkPaths, discoverAndroidSdk } from "./vendor/orca/android/android-sdk-discovery";
import { bootAvdArgs, emuKillArgs, parseAvdList } from "./vendor/orca/android/avd-manager";

export type AndroidSimulatorDevice = {
    id: string;
    name: string;
    serial?: string;
    avdName?: string;
    status: "booted" | "shutdown" | "unavailable";
    runtime: string;
};
export type AndroidRunner = (binary: string, args: string[]) => Promise<Buffer>;
type AndroidServiceOptions = {
    sdk?: AndroidSdkPaths;
    run?: AndroidRunner;
    launch?: (binary: string, args: string[]) => Promise<void>;
    sleep?: (ms: number) => Promise<void>;
    bootTimeoutMs?: number;
};

const runCommand: AndroidRunner = (binary, args) =>
    new Promise((resolve, reject) => {
        execFile(
            binary,
            args,
            { encoding: "buffer", timeout: 15000, maxBuffer: 32 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr?.toString().trim() || error.message));
                    return;
                }
                resolve(stdout);
            }
        );
    });

function launchEmulator(binary: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, { stdio: "ignore", windowsHide: true, detached: true });
        child.once("error", reject);
        child.once("spawn", () => {
            child.unref();
            resolve();
        });
    });
}

function validateCoordinate(value: number): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error("Coordinates must be between 0 and 1.");
    }
}

export class AndroidSimulatorService {
    private readonly sdk: AndroidSdkPaths;
    private readonly run: AndroidRunner;
    private readonly launch: AndroidServiceOptions["launch"];
    private readonly sleep: AndroidServiceOptions["sleep"];
    private readonly bootTimeoutMs: number;
    private readonly starts = new Map<string, Promise<AndroidSimulatorDevice>>();
    private discovery?: Promise<AndroidSimulatorDevice[]>;
    private readonly captures = new Map<string, Promise<string>>();
    private readonly streams = new Map<string, AndroidLiveStream>();
    private inventory: AndroidSimulatorDevice[] = [];
    private inventoryUpdatedAt = 0;
    private screenSizes = new Map<string, { width: number; height: number; time: number }>();

    constructor(options: AndroidServiceOptions = {}) {
        this.sdk =
            options.sdk ??
            discoverAndroidSdk({ env: process.env, platform: platform(), homedir: homedir(), exists: existsSync });
        this.run = options.run ?? runCommand;
        this.launch = options.launch ?? launchEmulator;
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.bootTimeoutMs = options.bootTimeoutMs ?? 120000;
    }

    getAvailability(): { available: boolean; reason?: string } {
        return this.sdk
            ? { available: true }
            : {
                  available: false,
                  reason: "Install Android SDK platform-tools and emulator, then create a virtual device in Android Studio.",
              };
    }

    discover(): Promise<AndroidSimulatorDevice[]> {
        return (this.discovery ??= this.readInventory().finally(() => {
            this.discovery = undefined;
        }));
    }

    private async readInventory(knownAvds?: string[]): Promise<AndroidSimulatorDevice[]> {
        if (!this.sdk) {
            return [];
        }
        const [avdOutput, deviceOutput] = await Promise.all([
            knownAvds
                ? Promise.resolve(Buffer.from(knownAvds.join("\n")))
                : this.run(this.sdk.emulator, ["-list-avds"]),
            this.run(this.sdk.adb, ["devices", "-l"]),
        ]);
        const devices = parseAdbDevices(deviceOutput.toString());
        const avds = parseAvdList(avdOutput.toString());
        const mapped = await Promise.all(
            devices.map(async (device): Promise<AndroidSimulatorDevice> => {
                let avdName: string;
                if (device.isEmulator && device.state === "device") {
                    try {
                        avdName = (await this.run(this.sdk.adb, ["-s", device.serial, "emu", "avd", "name"]))
                            .toString()
                            .split(/\r?\n/)
                            .find((line) => line.trim() && line.trim() !== "OK")
                            ?.trim();
                    } catch {
                        /* Offline emulators cannot identify their AVD. */
                    }
                }
                return {
                    id: avdName ? `android-avd:${avdName}` : `android-adb:${device.serial}`,
                    name: avdName ?? device.model ?? device.serial,
                    avdName,
                    serial: device.serial,
                    status: device.state === "device" ? "booted" : "unavailable",
                    runtime: device.isEmulator ? "Android emulator" : "Android device",
                };
            })
        );
        this.inventory = [
            ...mapped,
            ...avds
                .filter((name) => !mapped.some((device) => device.avdName === name))
                .map((name): AndroidSimulatorDevice => ({
                    id: `android-avd:${name}`,
                    name,
                    avdName: name,
                    status: "shutdown",
                    runtime: "Android emulator",
                })),
        ];
        const connectedSerials = new Set(
            mapped.filter((device) => device.status === "booted").map((device) => device.serial)
        );
        for (const serial of this.screenSizes.keys()) {
            if (!connectedSerials.has(serial)) this.screenSizes.delete(serial);
        }
        this.inventoryUpdatedAt = Date.now();
        return this.inventory;
    }

    async boot(id: string): Promise<AndroidSimulatorDevice> {
        const pending = this.starts.get(id);
        if (pending) {
            return pending;
        }
        const start = this.bootDevice(id);
        this.starts.set(id, start);
        try {
            return await start;
        } finally {
            this.starts.delete(id);
        }
    }

    private async bootDevice(id: string): Promise<AndroidSimulatorDevice> {
        const inventory = await this.discover();
        const knownAvds = inventory.flatMap((device) => (device.avdName ? [device.avdName] : []));
        const target = inventory.find((device) => device.id === id);
        if (!target) {
            throw new Error("Android device no longer exists.");
        }
        if (target.status === "booted") {
            return target;
        }
        if (!target.avdName) {
            throw new Error("Connect and authorize this Android device first.");
        }
        await this.launch(this.sdk.emulator, [
            ...bootAvdArgs(target.avdName, { noWindow: true, noBootAnim: true }),
            "-memory",
            "1536",
            "-cores",
            "2",
        ]);
        let current: AndroidSimulatorDevice;
        const deadline = performance.now() + this.bootTimeoutMs;
        for (let elapsed = 0; elapsed < this.bootTimeoutMs && performance.now() < deadline; elapsed += 1000) {
            current ??= (await this.readInventory(knownAvds)).find(
                (device) => device.id === id && device.status === "booted"
            );
            if (current?.serial) {
                const completed = await this.run(this.sdk.adb, [
                    "-s",
                    current.serial,
                    "shell",
                    "getprop",
                    "sys.boot_completed",
                ]);
                if (completed.toString().trim() === "1") {
                    return current;
                }
            }
            await this.sleep(1000);
        }
        throw new Error(
            `Android virtual device ${target.name} did not finish booting within ${this.bootTimeoutMs / 1000} seconds.`
        );
    }

    private async connected(id: string): Promise<AndroidSimulatorDevice> {
        // Streaming must not enumerate the entire SDK before every frame; adb still rejects stale serials.
        const inventory = Date.now() - this.inventoryUpdatedAt < 2000 ? this.inventory : await this.discover();
        const device = inventory.find((target) => target.id === id);
        if (!device?.serial || device.status !== "booted") {
            throw new Error("Start or connect this Android device first.");
        }
        return device;
    }

    async shutdown(id: string): Promise<void> {
        const device = await this.connected(id);
        if (!device.serial.startsWith("emulator-")) {
            throw new Error("Only Android virtual devices can be shut down.");
        }
        this.detachLive(id);
        await this.run(this.sdk.adb, emuKillArgs(device.serial));
        this.inventoryUpdatedAt = 0;
        this.screenSizes.delete(device.serial);
    }

    async screenshot(id: string, generation = 0): Promise<string> {
        const device = await this.connected(id);
        const captureKey = JSON.stringify([id, device.serial, generation]);
        const active = this.captures.get(captureKey);
        if (active) return active;
        const capture = this.capture(device.serial).finally(() => {
            if (this.captures.get(captureKey) === capture) this.captures.delete(captureKey);
        });
        this.captures.set(captureKey, capture);
        return capture;
    }

    async subscribeVideo(
        id: string,
        listener: (packet: import("./android-live-stream").AndroidVideoPacket) => void
    ): Promise<() => void> {
        const device = await this.connected(id);
        let stream = this.streams.get(id);
        if (!stream || stream.isStopped) {
            stream = new AndroidLiveStream(this.sdk.adb, device.serial);
            this.streams.set(id, stream);
        }
        return stream.subscribe(listener);
    }

    detachLive(id: string): void {
        this.streams.get(id)?.stop();
        this.streams.delete(id);
    }

    stopVideoStreams(): void {
        for (const id of this.streams.keys()) this.detachLive(id);
    }

    private async capture(serial: string): Promise<string> {
        const png = await this.run(this.sdk.adb, ["-s", serial, "exec-out", "screencap", "-p"]);
        if (png.length < 8 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
            throw new Error("Android returned an invalid screenshot.");
        }
        return `data:image/png;base64,${png.toString("base64")}`;
    }

    async pickElement(id: string, x: number, y: number, width: number, height: number): Promise<DeviceSelectedElement> {
        const device = await this.connected(id);
        const target = ["-s", device.serial, "shell"];
        const dumpPath = `/data/local/tmp/kronterm-pick-${randomUUID()}.xml`;
        try {
            await this.run(this.sdk.adb, [...target, "uiautomator", "dump", dumpPath]);
            const data = await this.run(this.sdk.adb, [...target, "cat", dumpPath]);
            if (data.length > 4 * 1024 * 1024) throw new Error("Android element tree is too large.");
            let selected: DeviceSelectedElement;
            let smallestArea = Infinity;
            const parser = new SaxesParser();
            parser.on("opentag", ({ name, attributes }) => {
                if (name !== "node") return;
                const match = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attributes.bounds);
                if (!match) return;
                const [left, top, right, bottom] = match.slice(1).map(Number);
                const area = (right - left) * (bottom - top);
                if (left >= right || top >= bottom || area > smallestArea) return;
                if (x * width < left || x * width >= right || y * height < top || y * height >= bottom) return;
                const role = attributes.class || "Element";
                const secure = attributes.password === "true" || role.endsWith("EditText");
                selected = {
                    application: attributes.package?.slice(0, 300),
                    role: role.slice(0, 150),
                    name: secure ? undefined : (attributes["content-desc"] || attributes.text)?.slice(0, 250),
                    id: attributes["resource-id"]?.slice(0, 300),
                    frame: {
                        x: left / width,
                        y: top / height,
                        width: (right - left) / width,
                        height: (bottom - top) / height,
                    },
                };
                smallestArea = area;
            });
            parser.write(data.toString()).close();
            return selected ?? null;
        } finally {
            await this.run(this.sdk.adb, [...target, "rm", "-f", dumpPath]).catch(() => {});
        }
    }

    private async screen(id: string) {
        const device = await this.connected(id);
        const cached = this.screenSizes.get(device.serial);
        const size =
            cached && Date.now() - cached.time < 5000
                ? cached
                : await this.currentDisplaySize(device.serial);
        if (!size || size.width < 1 || size.height < 1) {
            throw new Error("Android display size is unavailable.");
        }
        this.screenSizes.set(device.serial, { ...size, time: cached === size ? cached.time : Date.now() });
        return { device, size };
    }

    private async currentDisplaySize(serial: string) {
        const shell = ["-s", serial, "shell"];
        const displays = await this.run(this.sdk.adb, [...shell, "dumpsys", "window", "displays"]);
        const size = /\bcur=(\d+)x(\d+)/.exec(displays.toString());
        if (size) return { width: Number(size[1]), height: Number(size[2]) };
        return parseWmSize((await this.run(this.sdk.adb, [...shell, "wm", "size"])).toString());
    }

    async rotate(id: string, orientation: string): Promise<void> {
        const rotations = { portrait: 0, "landscape-left": 1, "portrait-upside-down": 2, "landscape-right": 3 };
        if (!Object.hasOwn(rotations, orientation)) throw new Error("Unsupported Android orientation.");
        const device = await this.connected(id);
        if (!device.avdName) throw new Error("Rotation is available for Android emulators.");
        await this.run(this.sdk.adb, [
            "-s", device.serial, "shell", "cmd", "window", "user-rotation", "lock", String(rotations[orientation]),
        ]);
        this.screenSizes.delete(device.serial);
        this.invalidateCaptures(id);
    }

    private invalidateCaptures(id: string) {
        for (const key of this.captures.keys()) {
            if (JSON.parse(key)[0] === id) this.captures.delete(key);
        }
    }

    async tap(id: string, x: number, y: number): Promise<void> {
        validateCoordinate(x);
        validateCoordinate(y);
        const { device, size } = await this.screen(id);
        const pixel = normalizedToDevicePixels(x, y, size);
        this.invalidateCaptures(id);
        await this.run(this.sdk.adb, ["-s", device.serial, "shell", "input", "tap", String(pixel.x), String(pixel.y)]);
    }

    async swipe(id: string, x: number, y: number, endX: number, endY: number): Promise<void> {
        [x, y, endX, endY].forEach(validateCoordinate);
        const { device, size } = await this.screen(id);
        const from = normalizedToDevicePixels(x, y, size),
            to = normalizedToDevicePixels(endX, endY, size);
        this.invalidateCaptures(id);
        await this.run(this.sdk.adb, [
            "-s",
            device.serial,
            "shell",
            "input",
            "swipe",
            String(from.x),
            String(from.y),
            String(to.x),
            String(to.y),
            "300",
        ]);
    }

    async type(id: string, text: string): Promise<void> {
        if (typeof text !== "string" || text.length > 4096 || /[^\x20-\x7e]/.test(text)) {
            throw new Error("Android typing currently supports up to 4096 printable ASCII characters.");
        }
        const device = await this.connected(id);
        // adb shell joins arguments before remote parsing, so shell quoting is required even with execFile.
        const escaped = text.replace(/ /g, "%s").replace(/'/g, "'\\''");
        this.invalidateCaptures(id);
        await this.run(this.sdk.adb, ["-s", device.serial, "shell", "input", "text", `'${escaped}'`]);
    }

    async key(id: string, key: string): Promise<void> {
        const keycodes = {
            Enter: 66,
            Backspace: 67,
            Delete: 112,
            Tab: 61,
            Escape: 111,
            ArrowUp: 19,
            ArrowDown: 20,
            ArrowLeft: 21,
            ArrowRight: 22,
            Home: 122,
            End: 123,
            Power: 26,
            VolumeUp: 24,
            VolumeDown: 25,
        };
        if (!Object.hasOwn(keycodes, key)) throw new Error("Unsupported Android keyboard key.");
        const device = await this.connected(id);
        this.invalidateCaptures(id);
        await this.run(this.sdk.adb, ["-s", device.serial, "shell", "input", "keyevent", String(keycodes[key])]);
    }

    async button(id: string, button: "home" | "back" | "recents"): Promise<void> {
        const device = await this.connected(id);
        this.invalidateCaptures(id);
        await this.run(this.sdk.adb, [
            "-s",
            device.serial,
            "shell",
            "input",
            "keyevent",
            String(androidButtonKeycode(button)),
        ]);
    }
}
