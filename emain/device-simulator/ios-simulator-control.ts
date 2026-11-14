// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DeviceSelectedElement } from "../../frontend/types/computer-targets";
import { sendEmulatorGestureSequence, type EmulatorGesturePoint } from "./orca-ios/emulator-gesture-sender";
import { MjpegFrameStream } from "./orca-ios/mjpeg-frame-stream";
import { normalizeServeSimAxTree, type NormalizedAxNode } from "./orca-ios/serve-sim-ax-normalization";
import { waitForServeSimEndpointReady } from "./orca-ios/serve-sim-endpoint-readiness";
import { computerOutput } from "./upstream/openmuse/computer-output";

export type IosSimulatorSession = {
    deviceUdid: string;
    streamUrl: string;
    wsUrl: string;
    axUrl: string;
    streamCodec: "mjpeg";
};
export type IosSimulatorExecutor = (args: string[]) => Promise<string>;

export function validateIosSimulatorEndpoint(value: unknown, protocol: "http:" | "ws:"): string {
    if (typeof value !== "string") throw new Error("Simulator helper did not return an endpoint.");
    const url = new URL(value);
    if (
        url.protocol !== protocol ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password ||
        !url.port
    ) {
        throw new Error("Simulator helper returned an unsafe endpoint.");
    }
    return url.href;
}

function validateUdid(udid: string): void {
    if (!/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(udid)) throw new Error("Invalid simulator identifier.");
}

export function createIosSimulatorExecutor(packageDirs: string[]): IosSimulatorExecutor {
    return (args) =>
        new Promise((resolve, reject) => {
            const entry = packageDirs.map((dir) => join(dir, "dist", "serve-sim.js")).find(existsSync);
            if (!entry) {
                reject(new Error("Simulator control helper is missing. Install the pinned serve-sim dependency."));
                return;
            }
            const output = computerOutput(4 * 1024 * 1024);
            const child = spawn(process.execPath, [entry, ...args], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
                shell: false,
                stdio: ["ignore", "pipe", "pipe"],
            });
            child.stdout.on("data", output.stdout);
            child.stderr.on("data", output.stderr);
            let escalation: ReturnType<typeof setTimeout>;
            const timeout = setTimeout(() => {
                output.result.timedOut = true;
                child.kill("SIGTERM");
                escalation = setTimeout(() => child.kill("SIGKILL"), 2000);
            }, 90_000);
            child.once("error", (error) => {
                clearTimeout(timeout);
                clearTimeout(escalation);
                reject(error);
            });
            child.once("close", (code) => {
                clearTimeout(timeout);
                clearTimeout(escalation);
                const result = output.finish();
                if (code !== 0 || result.timedOut || result.truncated) {
                    reject(
                        new Error(
                            (result.stderr || result.stdout || "Simulator helper failed or timed out.").slice(0, 1024)
                        )
                    );
                    return;
                }
                resolve(result.stdout.trim());
            });
        });
}

export class IosSimulatorControl {
    private sessions = new Map<string, IosSimulatorSession>();
    private pending = new Map<string, Promise<IosSimulatorSession>>();
    private streams = new Map<
        string,
        { stream: MjpegFrameStream; imageDataUrl?: string; capturedAt?: number; error?: string }
    >();
    constructor(
        private execute: IosSimulatorExecutor,
        private ready = waitForServeSimEndpointReady,
        private request: typeof fetch = fetch
    ) {}

    attach(udid: string): Promise<IosSimulatorSession> {
        validateUdid(udid);
        const pending = this.pending.get(udid);
        if (pending) return pending;
        const operation = this.start(udid).finally(() => this.pending.delete(udid));
        this.pending.set(udid, operation);
        return operation;
    }

    private async start(udid: string): Promise<IosSimulatorSession> {
        const previous = this.sessions.get(udid);
        if (previous && (await this.ready(previous.streamUrl))) return previous;
        this.streams.get(udid)?.stream.stop();
        this.streams.delete(udid);
        try {
            const raw = JSON.parse(await this.execute(["--detach", "-q", udid]));
            if (raw.device && raw.device !== udid) throw new Error("Helper attached to a different simulator.");
            const stream = raw.streamUrl ?? `${String(raw.url).replace(/\/$/, "")}/stream.mjpeg`;
            const streamUrl = validateIosSimulatorEndpoint(stream, "http:");
            const wsUrl = validateIosSimulatorEndpoint(raw.wsUrl, "ws:");
            const axUrl = validateIosSimulatorEndpoint(raw.axUrl ?? new URL("/ax", streamUrl).href, "http:");
            if (!(await this.ready(streamUrl))) throw new Error("Simulator stream did not become ready.");
            const session: IosSimulatorSession = { deviceUdid: udid, streamUrl, wsUrl, axUrl, streamCodec: "mjpeg" };
            this.sessions.set(udid, session);
            return session;
        } catch (error) {
            await this.execute(["--kill", "-q", udid]).catch(() => {});
            throw error;
        }
    }

    async stop(udid: string): Promise<void> {
        validateUdid(udid);
        await this.pending.get(udid)?.catch(() => {});
        this.sessions.delete(udid);
        this.streams.get(udid)?.stream.stop();
        this.streams.delete(udid);
        await this.execute(["--kill", "-q", udid]);
    }

    async frame(udid: string): Promise<{ imageDataUrl: string; capturedAt: number }> {
        const session = await this.attach(udid);
        let state = this.streams.get(udid);
        if (!state) {
            const record: { stream: MjpegFrameStream; imageDataUrl?: string; capturedAt?: number; error?: string } = {
                stream: null,
            };
            record.stream = new MjpegFrameStream(session.streamUrl, {
                onFrame: (frame) => {
                    if (frame.length > 20 * 1024 * 1024) return;
                    record.imageDataUrl = `data:image/jpeg;base64,${frame.toString("base64")}`;
                    record.capturedAt = Date.now();
                    record.error = undefined;
                },
                onError: (error) => {
                    record.error = error;
                },
            });
            this.streams.set(udid, record);
            record.stream.start();
            state = record;
        }
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            if (this.streams.get(udid) !== state) throw new Error("Simulator stream was detached.");
            if (state.imageDataUrl && Date.now() - state.capturedAt < 2000) {
                return { imageDataUrl: state.imageDataUrl, capturedAt: state.capturedAt };
            }
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error(state.error || "Simulator did not produce a live frame.");
    }

    async dispose(): Promise<void> {
        await Promise.allSettled(
            [...new Set([...this.sessions.keys(), ...this.pending.keys()])].map((id) => this.stop(id))
        );
    }

    async tap(udid: string, x: number, y: number, assertControl?: () => void): Promise<void> {
        if (![x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1))
            throw new Error("Tap coordinates must be between 0 and 1.");
        await this.attach(udid);
        assertControl?.();
        await this.execute(["tap", String(x), String(y), "-d", udid]);
    }

    async gesture(udid: string, points: EmulatorGesturePoint[], assertControl?: () => void): Promise<void> {
        if (
            !Array.isArray(points) ||
            points.length < 2 ||
            points.length > 600 ||
            points[0].type !== "begin" ||
            points[points.length - 1].type !== "end" ||
            points.some(
                (point) =>
                    !["begin", "move", "end"].includes(point.type) ||
                    ![point.x, point.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
            )
        ) {
            throw new Error("Invalid simulator gesture.");
        }
        const session = await this.attach(udid);
        assertControl?.();
        await sendEmulatorGestureSequence(session.wsUrl, points);
    }

    async type(udid: string, text: string, assertControl?: () => void): Promise<void> {
        if (typeof text !== "string" || text.length > 4096 || /[^\x20-\x7e\n\r\t]/.test(text))
            throw new Error("Simulator typing currently supports up to 4096 ASCII characters.");
        await this.attach(udid);
        assertControl?.();
        await this.execute(["type", "-d", udid, "--", text]);
    }

    async button(udid: string, name: string, assertControl?: () => void): Promise<void> {
        if (!["home", "lock", "volume-up", "volume-down", "siri"].includes(name))
            throw new Error("Unsupported simulator button.");
        await this.attach(udid);
        assertControl?.();
        await this.execute(["button", name, "-d", udid]);
    }

    async rotate(udid: string, orientation: string, assertControl?: () => void): Promise<void> {
        if (!["portrait", "landscape-left", "landscape-right", "portrait-upside-down"].includes(orientation))
            throw new Error("Unsupported orientation.");
        await this.attach(udid);
        assertControl?.();
        await this.execute(["rotate", orientation.replace(/-/g, "_"), "-d", udid]);
    }

    async accessibility(udid: string) {
        const session = await this.attach(udid);
        const response = await this.request(session.axUrl, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`Simulator accessibility request failed (${response.status}).`);
        const text = await response.text();
        if (text.length > 4 * 1024 * 1024) throw new Error("Simulator accessibility response is too large.");
        const tree = JSON.parse(text);
        if (!Array.isArray(tree)) throw new Error("Simulator returned an invalid accessibility tree.");
        return normalizeServeSimAxTree(tree);
    }

    async pickElement(udid: string, x: number, y: number): Promise<DeviceSelectedElement> {
        const tree = await this.accessibility(udid);
        let selected: DeviceSelectedElement;
        let smallestArea = Infinity;
        const visit = (node: NormalizedAxNode, application?: string) => {
            const role = node.role || node.type || "Element";
            if (/^(AX)?Application$/i.test(node.type) || role.toLowerCase() === "application") {
                application = node.label.slice(0, 250) || undefined;
            }
            const frame = node.frame;
            const area = frame.width * frame.height;
            if (
                frame.width > 0 &&
                frame.height > 0 &&
                area <= smallestArea &&
                x >= frame.x &&
                x < frame.x + frame.width &&
                y >= frame.y &&
                y < frame.y + frame.height
            ) {
                selected = {
                    application,
                    role: role.slice(0, 150),
                    name: /secure|password/i.test(`${role} ${node.type}`) ? undefined : node.label.slice(0, 250),
                    id: node.id?.slice(0, 300),
                    frame,
                };
                smallestArea = area;
            }
            for (const child of node.children) visit(child, application);
        };
        for (const node of tree) visit(node);
        return selected ?? null;
    }
}
