// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { augmentedPath } from "./upstream/openmaus/kronterm-adapter";

export class QemuVncBridge {
    private server: Server;
    private sockets: WebSocketServer;
    private children = new Set<ChildProcess>();
    private url = "";
    private onExit = () => this.close();

    constructor(
        private launch = spawn,
        private onInput: () => void = () => {}
    ) {}

    async open(sshArgs: string[]): Promise<string> {
        if (this.url) return this.url;
        const token = randomBytes(32).toString("hex");
        const server = createServer((_request, response) => response.writeHead(404).end());
        const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 4 * 1024 * 1024 });
        this.server = server;
        this.sockets = sockets;
        server.on("upgrade", (request, socket, head) => {
            // The unguessable URL is issued only through the existing trusted desktop IPC.
            if (request.url !== `/${token}` || sockets.clients.size >= 1) {
                socket.destroy();
                return;
            }
            if (socket instanceof Socket) socket.setNoDelay(true);
            sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit("connection", ws));
        });
        sockets.on("connection", (ws) => {
            const child = this.launch("ssh", ["-T", "-W", "127.0.0.1:5900", ...sshArgs], {
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env, PATH: augmentedPath() },
            });
            this.children.add(child);
            child.stdout.on("data", (data) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                child.stdout.pause();
                ws.send(data, { binary: true }, (error) => {
                    if (error) child.kill();
                    else child.stdout.resume();
                });
            });
            child.stderr.resume();
            child.on("error", () => ws.close(1011, "VM connection unavailable"));
            child.on("exit", () => {
                this.children.delete(child);
                ws.close();
            });
            child.stdin.on("error", () => ws.close(1011, "VM input unavailable"));
            child.stdin.on("drain", () => ws.resume());
            ws.on("message", (data) => {
                if ([4, 5, 6].includes((data as Buffer)[0])) this.onInput();
                if (!child.stdin.destroyed && !child.stdin.write(data as Buffer)) ws.pause();
            });
            ws.on("close", () => child.kill());
            ws.on("error", () => child.kill());
        });
        try {
            await new Promise<void>((resolve, reject) => {
                server.once("error", reject);
                server.listen(0, "127.0.0.1", resolve);
            });
            server.unref();
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("Computer bridge failed to bind.");
            this.url = `ws://127.0.0.1:${address.port}/${token}`;
            process.once("exit", this.onExit);
            return this.url;
        } catch (error) {
            this.close();
            throw error;
        }
    }

    close() {
        process.removeListener("exit", this.onExit);
        for (const ws of this.sockets?.clients ?? []) ws.terminate();
        for (const child of this.children) child.kill();
        this.children.clear();
        this.sockets?.close();
        this.server?.close();
        this.url = "";
    }
}
