// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomBytes } from "node:crypto";
import { createServer, request, type IncomingMessage } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { WebSocket, WebSocketServer } from "ws";

const EditorRoute =
    /^\/(?:api\/|internal\/)?(?:system_stats|features|users|settings|userdata|object_info|embeddings|global_subgraphs|default_workflow|workflow_templates|folder_paths|model_folders|models|prompt|queue|jobs|history|view|upload|experiment|custom_nodes|i18n|assets|logs|ws)(?:\/|$)/;

export async function startComfyEditorProxy(origin: string, rendererOrigin: string) {
    const prefix = "/" + randomBytes(24).toString("hex");
    const sockets = new Set<Socket>();
    const wsServer = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });

    function resolveRoute(incoming: IncomingMessage): URL | null {
        if (incoming.headers.origin && incoming.headers.origin !== rendererOrigin) return null;
        if (!incoming.url?.startsWith(prefix + "/")) return null;
        const path = incoming.url.slice(prefix.length);
        if (!URL.canParse(path, origin)) return null;
        const target = new URL(path, origin);
        if (target.origin !== origin || !EditorRoute.test(target.pathname)) return null;
        return target;
    }

    const server = createServer((incoming, outgoing) => {
        const target = resolveRoute(incoming);
        if (!target) {
            outgoing.writeHead(404).end();
            return;
        }
        outgoing.setHeader("Access-Control-Allow-Origin", rendererOrigin);
        outgoing.setHeader("Vary", "Origin");
        outgoing.setHeader("Cache-Control", "no-store");
        if (incoming.method === "OPTIONS") {
            outgoing.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, DELETE, PUT, PATCH");
            outgoing.setHeader(
                "Access-Control-Allow-Headers",
                incoming.headers["access-control-request-headers"] ?? ""
            );
            outgoing.writeHead(204).end();
            return;
        }
        const upstream = request(
            target,
            {
                method: incoming.method,
                timeout: 120_000,
                headers: Object.fromEntries(
                    ["content-type", "content-length", "accept", "comfy-user", "range"]
                        .filter((key) => incoming.headers[key] != null)
                        .map((key) => [key, incoming.headers[key]])
                ),
            },
            (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400) {
                    response.resume();
                    outgoing.writeHead(502).end("ComfyUI redirected the editor request");
                    return;
                }
                for (const key of [
                    "content-type",
                    "content-length",
                    "content-encoding",
                    "content-range",
                    "accept-ranges",
                ]) {
                    if (response.headers[key] != null) outgoing.setHeader(key, response.headers[key]);
                }
                outgoing.writeHead(response.statusCode ?? 502);
                response.pipe(outgoing);
            }
        );
        upstream.on("timeout", () => upstream.destroy(new Error("ComfyUI request timed out")));
        upstream.on("error", () => {
            if (outgoing.headersSent) outgoing.destroy();
            else outgoing.writeHead(502).end("ComfyUI could not be reached");
        });
        outgoing.on("close", () => upstream.destroy());
        incoming.pipe(upstream);
    });
    server.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
    });
    server.on("upgrade", (incoming, socket, head) => {
        const target = resolveRoute(incoming);
        if (target?.pathname !== "/ws") {
            socket.destroy();
            return;
        }
        target.protocol = "ws:";
        const upstream = new WebSocket(target, { handshakeTimeout: 5000, maxPayload: 32 * 1024 * 1024 });
        const stop = () => upstream.terminate();
        socket.once("close", stop);
        upstream.on("error", () => socket.destroy());
        upstream.once("open", () => {
            if (socket.destroyed) {
                stop();
                return;
            }
            wsServer.handleUpgrade(incoming, socket, head, (client) => {
                client.on("message", (data, binary) => upstream.send(data, { binary }));
                upstream.on("message", (data, binary) => client.send(data, { binary }));
                client.on("error", stop);
                client.once("close", stop);
                upstream.once("close", () => client.close());
            });
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", reject);
            resolve();
        });
    });

    return {
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}${prefix}`,
        close() {
            for (const socket of sockets) socket.destroy();
            wsServer.close();
            server.close();
        },
    };
}
