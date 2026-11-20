// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createConnection, type Socket } from "node:net";
import { promisify } from "node:util";

const execute = promisify(execFile);
const MaxPacket = 8 * 1024 * 1024;
export type AndroidVideoPacket = { config: boolean; key: boolean; timestamp: number; data: string };

export class AndroidVideoParser {
    private buffer = Buffer.alloc(0);
    push(chunk: Buffer, emit: (packet: AndroidVideoPacket) => void): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length >= 12) {
            const size = this.buffer.readUInt32BE(8);
            if (size > MaxPacket) throw new Error("Android video packet exceeds the size limit.");
            if (this.buffer.length < size + 12) return;
            const flags = this.buffer.readBigUInt64BE(0);
            emit({
                config: Boolean(flags & (1n << 63n)),
                key: Boolean(flags & (1n << 62n)),
                timestamp: Number(flags & ((1n << 62n) - 1n)),
                data: this.buffer.subarray(12, 12 + size).toString("base64"),
            });
            this.buffer = this.buffer.subarray(12 + size);
        }
    }
}

/** Forward framed H.264 directly to WebCodecs, avoiding PNG capture and recording-container buffering. */
export class AndroidLiveStream {
    private child?: ChildProcess;
    private socket?: Socket;
    private port?: number;
    private stopped = false;
    private opening?: Promise<void>;
    private listeners = new Set<(packet: AndroidVideoPacket) => void>();
    private config?: AndroidVideoPacket;
    private replay: AndroidVideoPacket[] = [];
    private replayBytes = 0;
    private idle?: ReturnType<typeof setTimeout>;
    private failure?: string;

    constructor(
        private adb: string,
        private serial: string
    ) {}
    get isStopped(): boolean {
        return this.stopped;
    }

    async subscribe(listener: (packet: AndroidVideoPacket) => void): Promise<() => void> {
        clearTimeout(this.idle);
        await (this.opening ??= this.start().catch((error) => {
            this.stop();
            throw error;
        }));
        if (this.stopped) throw new Error(this.failure || "Android stream disconnected. Reconnect to retry.");
        if (this.config) listener(this.config);
        for (const packet of this.replay) listener(packet);
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
            if (!this.listeners.size) this.idle = setTimeout(() => this.stop(), 5000);
        };
    }

    private async start(): Promise<void> {
        const scrcpy =
            [process.env.KRONTERM_SCRCPY_PATH, "/opt/homebrew/bin/scrcpy", "/usr/local/bin/scrcpy"].find(
                (p) => p && existsSync(p)
            ) ?? "scrcpy";
        const jar = [
            process.env.SCRCPY_SERVER_PATH,
            "/opt/homebrew/share/scrcpy/scrcpy-server",
            "/usr/local/share/scrcpy/scrcpy-server",
        ].find((p) => p && existsSync(p));
        if (!jar) throw new Error("Install scrcpy to enable the Android live preview.");
        const version = /scrcpy ([\d.]+)/.exec((await execute(scrcpy, ["--version"], { timeout: 5000 })).stdout)?.[1];
        if (!version) throw new Error("Could not identify the scrcpy version.");
        const scid = (randomBytes(4).readUInt32BE() & 0x7fffffff).toString(16).padStart(8, "0");
        const remote = `/data/local/tmp/kronos-scrcpy-${scid}.jar`;
        const adb = (args: string[]) => execute(this.adb, ["-s", this.serial, ...args], { timeout: 15000 });
        try {
            await adb(["push", jar, remote]);
            if (this.stopped) {
                await adb(["shell", "rm", "-f", remote]);
                throw new Error("Stream stopped");
            }
            this.port = Number((await adb(["forward", "tcp:0", `localabstract:scrcpy_${scid}`])).stdout.trim());
            if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535)
                throw new Error("ADB returned an invalid video port.");
            if (this.stopped) {
                await adb(["forward", "--remove", `tcp:${this.port}`]);
                await adb(["shell", "rm", "-f", remote]);
                throw new Error("Stream stopped");
            }
            this.child = spawn(
                this.adb,
                [
                    "-s",
                    this.serial,
                    "shell",
                    `CLASSPATH=${remote}`,
                    "app_process",
                    "/",
                    "com.genymobile.scrcpy.Server",
                    version,
                    `scid=${scid}`,
                    "log_level=warn",
                    "audio=false",
                    "control=false",
                    "tunnel_forward=true",
                    "max_size=1080",
                    "max_fps=30",
                    "video_bit_rate=2000000",
                    "send_device_meta=false",
                    "send_dummy_byte=false",
                    "send_codec_meta=false",
                    "send_frame_meta=true",
                    "power_on=false",
                ],
                { stdio: ["ignore", "pipe", "pipe"] }
            );
            this.child.once("error", (error) => {
                this.failure = error.message;
                this.stop();
            });
            this.child.once("exit", () => this.stop());
            this.child.stderr.on("data", (data) => {
                this.failure = data.toString().slice(-500);
            });
            this.child.stdout.on("data", (data) => {
                this.failure = data.toString().slice(-500);
            });
            this.child.once("close", () => void adb(["shell", "rm", "-f", remote]).catch(() => {}));
            const deadline = Date.now() + 30000;
            for (let attempt = 0; attempt < 150 && !this.stopped && Date.now() < deadline; attempt++) {
                const socket = createConnection({ host: "127.0.0.1", port: this.port });
                let first: Buffer;
                this.socket = socket;
                socket.setTimeout(Math.min(10000, deadline - Date.now()), () => socket.destroy());
                const connected = await new Promise<boolean>((resolve) => {
                    socket.once("data", (chunk) => {
                        first = chunk;
                        socket.pause();
                        resolve(true);
                    });
                    socket.once("close", () => resolve(false));
                    socket.once("error", () => resolve(false));
                });
                if (!connected) {
                    socket.destroy();
                    await new Promise((r) => setTimeout(r, 200));
                    continue;
                }
                this.socket = socket;
                const parser = new AndroidVideoParser();
                socket.setTimeout(0);
                const receive = (chunk: Buffer) => {
                    try {
                        parser.push(chunk, (packet) => {
                            if (packet.config) {
                                this.config = packet;
                                this.replay = [];
                                this.replayBytes = 0;
                            } else {
                                if (packet.key) {
                                    this.replay = [];
                                    this.replayBytes = 0;
                                }
                                this.replayBytes += packet.data.length;
                                if (this.replayBytes > MaxPacket) {
                                    this.failure = "Video replay exceeded its buffer. Reconnect.";
                                    this.stop();
                                    return;
                                }
                                this.replay.push(packet);
                            }
                            for (const listener of this.listeners) listener(packet);
                        });
                    } catch (error) {
                        this.failure = error.message;
                        this.stop();
                    }
                };
                socket.on("data", receive);
                receive(first);
                socket.resume();
                socket.once("close", () => this.stop());
                return;
            }
            throw new Error(this.failure || "Android video connection did not become ready.");
        } catch (error) {
            this.stop();
            throw error;
        }
    }

    stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        clearTimeout(this.idle);
        this.socket?.destroy();
        this.child?.kill("SIGINT");
        const child = this.child;
        if (child) {
            const timer = setTimeout(() => child.kill("SIGKILL"), 1500);
            timer.unref();
            child.once("close", () => clearTimeout(timer));
        }
        if (this.port)
            void execute(this.adb, ["-s", this.serial, "forward", "--remove", `tcp:${this.port}`], {
                timeout: 5000,
            }).catch(() => {});
        this.listeners.clear();
        this.replay = [];
    }
}
