// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ComputerTarget, ComputerTargetAction, ComputerTargetSnapshot } from "../frontend/types/computer-targets";

import { ComputerTargetsAppium } from "./computer-targets-appium";
import { AndroidSimulatorService } from "./device-simulator/android/android-simulator-service";
import { createIosSimulatorExecutor, IosSimulatorControl } from "./device-simulator/ios-simulator-control";

const UdidPattern = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const Actions = new Set([
    "boot",
    "shutdown",
    "open",
    "screenshot",
    "tap",
    "type",
    "key",
    "back",
    "home",
    "swipe",
    "rotate",
    "button",
]);
const MaxImageBytes = 20 * 1024 * 1024;
export type ComputerTargetExecutor = (file: string, args: string[]) => Promise<string>;

export const executeComputerTargetCommand: ComputerTargetExecutor = (file, args) =>
    new Promise((resolve, reject) => {
        execFile(file, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
            if (error) {
                reject(
                    new Error("Simulator operation failed. Check that full Xcode and an iOS runtime are installed.")
                );
                return;
            }
            resolve(stdout);
        });
    });

export function parseComputerTargets(stdout: string): ComputerTarget[] {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed.devices !== "object" || parsed.devices == null) {
        throw new Error("Simulator returned an invalid device list.");
    }
    const targets: ComputerTarget[] = [];
    for (const [runtime, devices] of Object.entries(parsed.devices)) {
        if (!Array.isArray(devices) || !runtime.includes("iOS")) continue;
        for (const device of devices) {
            if (typeof device?.udid !== "string" || !UdidPattern.test(device.udid)) continue;
            const available = device.isAvailable !== false;
            const booted = device.state === "Booted";
            targets.push({
                id: device.udid,
                name: typeof device.name === "string" ? device.name : device.udid,
                kind: "ios-simulator",
                status: !available ? "unavailable" : booted ? "booted" : "shutdown",
                runtime,
                capabilities: !available ? [] : booted ? ["shutdown", "open", "screenshot"] : ["boot", "open"],
                controlOwner: "user",
                controlGeneration: 0,
                labs: true,
            });
        }
    }
    return targets.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export class ComputerTargetsRuntime {
    private generations = new Map<string, number>();
    private pausedTargets = new Set<string>();
    private busy = new Set<string>();
    private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

    private touchEmulator(target: ComputerTarget, delay = 300_000) {
        if (target.kind !== "ios-simulator" && target.kind !== "android-emulator") return;
        clearTimeout(this.idleTimers.get(target.id));
        const timer = setTimeout(() => {
            if (this.busy.has(target.id)) {
                this.touchEmulator(target, 1000);
                return;
            }
            void this.perform({
                targetId: target.id,
                action: "shutdown",
                expectedGeneration: this.generations.get(target.id) ?? 0,
            }).catch(() => this.touchEmulator(target));
        }, delay);
        timer.unref?.();
        this.idleTimers.set(target.id, timer);
    }

    constructor(
        private execute: ComputerTargetExecutor = executeComputerTargetCommand,
        private platform = process.platform,
        private appium = process.env.KRONTERM_APPIUM_URL
            ? new ComputerTargetsAppium(process.env.KRONTERM_APPIUM_URL)
            : undefined,
        private android?: AndroidSimulatorService,
        private ios?: IosSimulatorControl
    ) {}

    async list(): Promise<ComputerTarget[]> {
        let targets: ComputerTarget[] = [];
        let simulatorError: Error;
        if (this.platform === "darwin") {
            try {
                targets = parseComputerTargets(
                    await this.execute("/usr/bin/xcrun", ["simctl", "list", "devices", "--json"])
                );
            } catch (error) {
                simulatorError = error instanceof Error ? error : new Error("Simulator tools are unavailable.");
            }
        } else {
            simulatorError = new Error("iOS Simulator requires macOS with full Xcode installed.");
        }
        if (this.ios) {
            targets = targets.map((target) =>
                target.status === "booted"
                    ? {
                          ...target,
                          capabilities: [...target.capabilities, "tap", "type", "home", "swipe", "rotate", "button"],
                      }
                    : target
            );
        }
        if (this.android) {
            targets.push(
                ...(await this.android.discover()).map((device): ComputerTarget => ({
                    id: device.id,
                    name: device.name,
                    kind: device.avdName ? "android-emulator" : "android-device",
                    status: device.status,
                    runtime: device.runtime,
                    capabilities:
                        device.status === "shutdown"
                            ? ["boot"]
                            : device.status === "booted"
                              ? [
                                    ...(device.avdName ? ["shutdown" as const] : []),
                                    "screenshot",
                                    "tap",
                                    "type",
                                    "key",
                                    "button",
                                    "home",
                                    "back",
                                    "swipe",
                                ]
                              : [],
                    controlOwner: "user",
                    controlGeneration: 0,
                    labs: true,
                }))
            );
        }
        if (this.appium) targets.push(...(await this.appium.list()));
        if (targets.length === 0 && simulatorError && !this.appium) throw simulatorError;
        for (const target of targets) {
            if (target.status === "booted" && !this.idleTimers.has(target.id)) this.touchEmulator(target);
            if (target.status === "shutdown" || target.status === "unavailable") {
                clearTimeout(this.idleTimers.get(target.id));
                this.idleTimers.delete(target.id);
            }
        }
        return targets.map((target) => ({
            ...target,
            controlGeneration: this.generations.get(target.id) ?? 0,
            automationPaused: this.pausedTargets.has(target.id),
        }));
    }

    private async resolve(id: unknown): Promise<ComputerTarget> {
        if (
            typeof id !== "string" ||
            !(
                UdidPattern.test(id) ||
                /^appium:[a-zA-Z0-9_-]{1,128}$/.test(id) ||
                /^android-(avd|adb):[a-zA-Z0-9_.:-]{1,128}$/.test(id)
            )
        )
            throw new Error("Invalid simulator identifier.");
        const target = (await this.list()).find((item) => item.id === id);
        if (!target) throw new Error("Simulator no longer exists. Refresh the device list.");
        return target;
    }

    async takeOver(id: unknown): Promise<ComputerTargetSnapshot> {
        const target = await this.resolve(id);
        const generation = target.controlGeneration + 1;
        this.generations.set(target.id, generation);
        this.pausedTargets.add(target.id);
        return { target: { ...target, controlGeneration: generation, controlOwner: "user", automationPaused: true } };
    }

    async resume(id: unknown, expectedGeneration: unknown): Promise<ComputerTargetSnapshot> {
        const target = await this.resolve(id);
        if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration !== target.controlGeneration) {
            throw new Error("Control changed. Refresh before resuming automation.");
        }
        const generation = target.controlGeneration + 1;
        this.generations.set(target.id, generation);
        this.pausedTargets.delete(target.id);
        return { target: { ...target, controlGeneration: generation, automationPaused: false } };
    }

    async performAgent(input: unknown): Promise<ComputerTargetSnapshot> {
        if (input && typeof input === "object") {
            const action = input as ComputerTargetAction;
            if (action.action !== "screenshot" && !Number.isSafeInteger(action.expectedGeneration)) {
                throw new Error("Agent actions require the latest device control generation.");
            }
        }
        return this.perform(input, true);
    }

    async perform(input: unknown, agent = false): Promise<ComputerTargetSnapshot> {
        if (!input || typeof input !== "object") throw new Error("Invalid simulator action.");
        const action = input as ComputerTargetAction;
        if (!Actions.has(action.action)) throw new Error("Unsupported simulator action.");
        if (action.action === "button" && !["power", "volume-up", "volume-down"].includes(action.button))
            throw new Error("Unsupported device button.");
        if (
            action.expectedGeneration != null &&
            (!Number.isSafeInteger(action.expectedGeneration) || action.expectedGeneration < 0)
        ) {
            throw new Error("Invalid control generation.");
        }
        const target = await this.resolve(action.targetId);
        if (action.expectedGeneration != null && action.expectedGeneration !== target.controlGeneration) {
            throw new Error("Control changed. Refresh before continuing.");
        }
        if (agent && action.action !== "screenshot" && this.pausedTargets.has(target.id)) {
            throw new Error(
                "Device automation is paused by the user. Resume it from Computers & Devices before continuing."
            );
        }
        if (!target.capabilities.includes(action.action))
            throw new Error("This action is unavailable for the simulator's current state.");
        if (this.busy.has(target.id)) throw new Error("A simulator action is already running.");
        this.busy.add(target.id);
        if (action.action !== "screenshot") this.touchEmulator(target);
        try {
            if (target.id.startsWith("android-")) {
                if (!this.android) throw new Error("Android emulator control is unavailable.");
                let imageDataUrl: string;
                if (action.action === "boot") await this.android.boot(target.id);
                else if (action.action === "shutdown") await this.android.shutdown(target.id);
                else if (action.action === "screenshot") imageDataUrl = await this.android.screenshot(target.id);
                else if (action.action === "tap") await this.android.tap(target.id, action.x, action.y);
                else if (action.action === "type") await this.android.type(target.id, action.text);
                else if (action.action === "key") await this.android.key(target.id, action.key);
                else if (action.action === "button")
                    await this.android.key(
                        target.id,
                        { power: "Power", "volume-up": "VolumeUp", "volume-down": "VolumeDown" }[action.button]
                    );
                else if (action.action === "swipe")
                    await this.android.swipe(target.id, action.x, action.y, action.endX, action.endY);
                else if (action.action === "home" || action.action === "back")
                    await this.android.button(target.id, action.action);
                else throw new Error("Unsupported Android control.");
                const updated = ["boot", "shutdown"].includes(action.action)
                    ? await this.resolve(target.id)
                    : {
                          ...target,
                          controlGeneration: this.generations.get(target.id) ?? 0,
                          automationPaused: this.pausedTargets.has(target.id),
                      };
                if (updated.controlGeneration !== target.controlGeneration)
                    throw new Error("Control changed during the action.");
                return { target: updated, ...(imageDataUrl ? { imageDataUrl, capturedAt: Date.now() } : {}) };
            }
            if (target.id.startsWith("appium:")) {
                if (!this.appium) throw new Error("Appium is not configured.");
                const snapshot = await this.appium.perform(target, action, () => {
                    if ((this.generations.get(target.id) ?? 0) !== target.controlGeneration)
                        throw new Error("Control changed before the action could be sent.");
                });
                if ((this.generations.get(target.id) ?? 0) !== target.controlGeneration)
                    throw new Error("Control changed while the action was running. Its result was discarded.");
                return snapshot;
            }
            let imageDataUrl: string;
            if (this.ios && ["tap", "type", "home", "swipe", "rotate", "button"].includes(action.action)) {
                const assertControl = () => {
                    if ((this.generations.get(target.id) ?? 0) !== target.controlGeneration)
                        throw new Error("Control changed before device input.");
                };
                if (action.action === "tap") await this.ios.tap(target.id, action.x, action.y, assertControl);
                else if (action.action === "type") await this.ios.type(target.id, action.text, assertControl);
                else if (action.action === "home") await this.ios.button(target.id, "home", assertControl);
                else if (action.action === "button")
                    await this.ios.button(target.id, action.button === "power" ? "lock" : action.button, assertControl);
                else if (action.action === "rotate")
                    await this.ios.rotate(target.id, action.orientation ?? "landscape-left", assertControl);
                else
                    await this.ios.gesture(
                        target.id,
                        [
                            { type: "begin", x: action.x, y: action.y },
                            { type: "move", x: action.endX, y: action.endY },
                            { type: "end", x: action.endX, y: action.endY },
                        ],
                        assertControl
                    );
            } else if (action.action === "open") {
                await this.execute("/usr/bin/open", ["-a", "Simulator", "--args", "-CurrentDeviceUDID", target.id]);
            } else if (action.action === "screenshot") {
                const directory = await mkdtemp(join(tmpdir(), "kronterm-simulator-"));
                try {
                    const path = join(directory, "screen.png");
                    await this.execute("/usr/bin/xcrun", ["simctl", "io", target.id, "screenshot", "--type=png", path]);
                    if ((await stat(path)).size > MaxImageBytes)
                        throw new Error("Simulator screenshot exceeds the size limit.");
                    const image = await readFile(path);
                    if (
                        image.length > MaxImageBytes ||
                        !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                    ) {
                        throw new Error("Simulator returned an invalid screenshot.");
                    }
                    imageDataUrl = `data:image/png;base64,${image.toString("base64")}`;
                } finally {
                    await rm(directory, { recursive: true, force: true });
                }
            } else {
                await this.execute("/usr/bin/xcrun", ["simctl", action.action, target.id]);
            }
            const updated = ["boot", "shutdown"].includes(action.action)
                ? await this.resolve(target.id)
                : {
                      ...target,
                      controlGeneration: this.generations.get(target.id) ?? 0,
                      automationPaused: this.pausedTargets.has(target.id),
                  };
            if (target.controlGeneration !== updated.controlGeneration) {
                throw new Error("Control changed while the action was running. Its result was discarded.");
            }
            return { target: updated, ...(imageDataUrl ? { imageDataUrl, capturedAt: Date.now() } : {}) };
        } finally {
            this.busy.delete(target.id);
        }
    }

    async attachLive(targetId: string, expectedGeneration: number): Promise<ComputerTarget> {
        const target = await this.resolve(targetId);
        if (target.controlGeneration !== expectedGeneration) throw new Error("Control changed. Refresh the device.");
        if (target.status !== "booted" && target.status !== "connected") throw new Error("Start the device first.");
        if (target.kind === "ios-simulator") {
            if (!this.ios) throw new Error("Simulator live control helper is unavailable.");
            await this.ios.attach(target.id);
        }
        return target;
    }

    async liveFrame(targetId: string): Promise<{ imageDataUrl: string; capturedAt: number }> {
        if (UdidPattern.test(targetId) && this.ios) return this.ios.frame(targetId);
        if (targetId.startsWith("android-") && this.android)
            return { imageDataUrl: await this.android.screenshot(targetId), capturedAt: Date.now() };
        const result = await this.perform({ targetId, action: "screenshot" });
        return { imageDataUrl: result.imageDataUrl, capturedAt: result.capturedAt };
    }

    async detachLive(targetId: string): Promise<void> {
        if (UdidPattern.test(targetId) && this.ios) await this.ios.stop(targetId);
    }
}

let sharedRuntime: ComputerTargetsRuntime;

export function getComputerTargetsRuntime(): ComputerTargetsRuntime {
    return (sharedRuntime ??= new ComputerTargetsRuntime(
        undefined,
        undefined,
        undefined,
        new AndroidSimulatorService(),
        new IosSimulatorControl(
            createIosSimulatorExecutor([
                join(process.cwd(), "node_modules", "serve-sim"),
                fileURLToPath(new URL("../node_modules/serve-sim", import.meta.url)),
                join(process.resourcesPath ?? process.cwd(), "serve-sim"),
            ])
        )
    ));
}
