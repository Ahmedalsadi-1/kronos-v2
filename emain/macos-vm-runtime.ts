// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { MacVmConnection, MacVmInventory } from "../frontend/types/macos-vms";

export function parseMacVmVncUrl(text: string): URL | undefined {
    const match = text.match(/vnc:\/\/[^\s]+/);
    if (!match) return;
    const url = new URL(match[0]);
    if (url.hostname !== "127.0.0.1" || !url.port || !url.password) {
        throw new Error("The macOS VM must expose an authenticated loopback display");
    }
    return url;
}

type VmSession = {
    owner: number;
    name: string;
    child: ChildProcess;
    server?: Server;
    sockets?: WebSocketServer;
    connection?: MacVmConnection;
};

export class MacVmRuntime {
    private sessions = new Map<string, VmSession>();
    private starting = new Set<string>();

    hasActiveSessions(): boolean {
        return this.sessions.size > 0;
    }

    constructor(
        private platform = process.platform,
        private architecture = process.arch,
        private execute = (binary: string, args: string[]) =>
            new Promise<string>((resolve, reject) => {
                execFile(binary, args, { timeout: 15_000, maxBuffer: 1024 * 1024 }, (error, stdout) =>
                    error ? reject(error) : resolve(stdout)
                );
            }),
        private readConfig = async (name: string) =>
            JSON.parse(
                await readFile(
                    join(process.env.TART_HOME || join(homedir(), ".tart"), "vms", name, "config.json"),
                    "utf8"
                )
            )
    ) {}

    private async binary(): Promise<string> {
        for (const path of ["/opt/homebrew/bin/tart", "/usr/local/bin/tart"]) {
            if (
                await access(path).then(
                    () => true,
                    () => false
                )
            )
                return path;
        }
        return "tart";
    }

    async list(): Promise<MacVmInventory> {
        if (this.platform !== "darwin" || this.architecture !== "arm64") {
            return { available: false, problem: "macOS VMs require an Apple-silicon Mac.", machines: [] };
        }
        try {
            const rows = JSON.parse(
                await this.execute(await this.binary(), ["list", "--source", "local", "--format", "json"])
            );
            if (!Array.isArray(rows)) throw new Error("Invalid Tart inventory");
            const machines = await Promise.all(
                rows
                    .filter(
                        (row) => typeof row.Name === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(row.Name)
                    )
                    .map(async (row) => {
                        const config = await this.readConfig(row.Name).catch(() => undefined);
                        if (!config || (config.os != null && config.os !== "darwin")) return;
                        return { name: row.Name, running: row.Running === true };
                    })
            );
            return {
                available: true,
                machines: machines.filter(Boolean),
            };
        } catch {
            return {
                available: false,
                problem: "Install Tart and create a local macOS guest to use this Labs feature.",
                machines: [],
            };
        }
    }

    async start(name: string, owner: number, origin: string): Promise<MacVmConnection> {
        if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name)) {
            throw new Error("Select a local macOS VM with a simple name");
        }
        const owned = [...this.sessions.values()].find((session) => session.name === name);
        if (owned?.owner === owner && owned.connection) return owned.connection;
        if (owned || this.starting.has(name))
            throw new Error("This VM is already controlled by another surface or is starting");
        this.starting.add(name);
        try {
            const inventory = await this.list();
            if (!inventory.available) throw new Error(inventory.problem);
            const machine = inventory.machines.find((machine) => machine.name === name);
            if (!machine) throw new Error("The selected local VM is unavailable");
            if (machine.running) throw new Error("Stop the externally running VM before opening it in KronTerm");
            const child = spawn(
                await this.binary(),
                ["run", name, "--no-graphics", "--vnc-experimental", "--no-clipboard", "--no-audio"],
                {
                    stdio: ["ignore", "pipe", "pipe"],
                }
            );
            const sessionId = randomBytes(24).toString("hex");
            const session: VmSession = { owner, name, child };
            this.sessions.set(sessionId, session);
            child.once("exit", () => this.cleanup(sessionId));
            try {
                const endpoint = await this.waitForDisplay(child);
                if (!this.sessions.has(sessionId)) throw new Error("The VM exited before its display connected");
                const connection = await this.bridge(sessionId, session, endpoint, origin);
                if (!this.sessions.has(sessionId)) {
                    session.sockets?.close();
                    session.server?.close();
                    throw new Error("The VM stopped while connecting its display");
                }
                session.connection = connection;
                return connection;
            } catch (error) {
                await this.stop(sessionId, owner);
                throw error;
            }
        } finally {
            this.starting.delete(name);
        }
    }

    private waitForDisplay(child: ChildProcess): Promise<URL> {
        return new Promise((resolve, reject) => {
            let output = "";
            const finish = (error?: Error, url?: URL) => {
                clearTimeout(timer);
                child.stdout.off("data", data);
                child.off("error", failed);
                child.off("exit", exited);
                if (error) {
                    reject(error);
                } else {
                    resolve(url);
                }
            };
            const failed = () => finish(new Error("Tart could not start the macOS VM"));
            const exited = () => finish(new Error("The macOS VM exited before its display was ready"));
            const data = (chunk: Buffer) => {
                output = (output + chunk.toString()).slice(-16_384);
                try {
                    // Wait for a full line; credentials and ports can span stdout chunks.
                    const lines = output.split(/\r?\n/);
                    output = lines.pop();
                    for (const line of lines) {
                        const url = parseMacVmVncUrl(line);
                        if (url) return finish(undefined, url);
                    }
                } catch {
                    finish(new Error("Tart returned an invalid VM display address"));
                }
            };
            const timer = setTimeout(
                () => finish(new Error("The macOS VM display did not become ready within 90 seconds")),
                90_000
            );
            child.stdout.on("data", data);
            child.stderr.on("data", () => {});
            child.once("error", failed);
            child.once("exit", exited);
        });
    }

    private async bridge(id: string, session: VmSession, endpoint: URL, origin: string): Promise<MacVmConnection> {
        const token = randomBytes(24).toString("hex");
        const server = createServer((_request, response) => {
            response.writeHead(404).end();
        });
        const sockets = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
        session.server = server;
        session.sockets = sockets;
        server.on("upgrade", (request, socket, head) => {
            if (request.url !== `/${token}` || request.headers.origin !== origin || sockets.clients.size > 0) {
                socket.destroy();
                return;
            }
            sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws));
        });
        sockets.on("connection", (ws) => {
            const tcp = connect({ host: "127.0.0.1", port: Number(endpoint.port) });
            tcp.on("data", (data) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                tcp.pause();
                ws.send(data, { binary: true }, (error) => {
                    if (error) tcp.destroy();
                    else tcp.resume();
                });
            });
            tcp.on("close", () => ws.close());
            tcp.on("error", () => ws.close(1011, "VM display unavailable"));
            ws.on("message", (data) => {
                if (!tcp.destroyed && !tcp.write(data as Buffer)) ws.pause();
            });
            tcp.on("drain", () => ws.resume());
            ws.on("close", () => tcp.destroy());
            ws.on("error", () => tcp.destroy());
        });
        await new Promise<void>((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", () => resolve());
        });
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("VM display bridge unavailable");
        return {
            name: session.name,
            sessionId: id,
            url: `ws://127.0.0.1:${address.port}/${token}`,
            password: decodeURIComponent(endpoint.password),
        };
    }

    private cleanup(id: string): void {
        const session = this.sessions.get(id);
        if (!session) return;
        this.sessions.delete(id);
        for (const ws of session.sockets?.clients ?? []) ws.terminate();
        session.sockets?.close();
        session.server?.close();
    }

    async stop(id: string, owner: number): Promise<void> {
        const session = this.sessions.get(id);
        if (!session) return;
        if (session.owner !== owner) throw new Error("This VM belongs to another workspace surface");
        if (session.child.exitCode == null && session.child.signalCode == null) {
            const child = session.child;
            await new Promise<void>((resolve) => {
                const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
                child.once("exit", () => {
                    clearTimeout(timer);
                    resolve();
                });
                child.kill("SIGTERM");
            });
        }
        this.cleanup(id);
    }

    async closeOwner(owner: number): Promise<void> {
        await Promise.all(
            [...this.sessions].filter(([, session]) => session.owner === owner).map(([id]) => this.stop(id, owner))
        );
    }

    async dispose(): Promise<void> {
        await Promise.all([...this.sessions].map(([id, session]) => this.stop(id, session.owner)));
    }
}
