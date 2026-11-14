// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { startComfyEditorProxy } from "./comfyui-editor-proxy";

it("limits the ComfyUI editor transport to its renderer and forwards job events", async () => {
    const upstream = createServer((request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ path: request.url, user: request.headers["comfy-user"] }));
    });
    const upstreamWs = new WebSocketServer({ noServer: true });
    upstream.on("upgrade", (request, socket, head) => {
        upstreamWs.handleUpgrade(request, socket, head, (client) => {
            client.on("message", (data, binary) => client.send(data, { binary }));
        });
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");

    const origin = "http://localhost:9124";
    const port = (upstream.address() as AddressInfo).port;
    const proxy = await startComfyEditorProxy(`http://127.0.0.1:${port}`, origin);
    try {
        const endpoint = `${proxy.url}/api/users`;
        const response = await fetch(endpoint, { headers: { Origin: origin, "Comfy-User": "test" } });
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
        expect(await response.json()).toEqual({ path: "/api/users", user: "test" });
        expect((await fetch(endpoint, { headers: { Origin: "https://unrelated.test" } })).status).toBe(404);
        expect((await fetch(new URL("/api/users", proxy.url))).status).toBe(404);
        expect((await fetch(`${proxy.url}/extensions/test.js`)).status).toBe(404);
        for (const path of ["/api/assets?tags=output", "/api/assets/sample/content", "/internal/logs/raw"]) {
            const response = await fetch(proxy.url + path, { headers: { Origin: origin } });
            expect(await response.json()).toMatchObject({ path });
        }
        const logs = await fetch(proxy.url + "/internal/logs/subscribe", {
            method: "PATCH",
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true, clientId: "test" }),
        });
        expect(await logs.json()).toMatchObject({ path: "/internal/logs/subscribe" });

        const client = new WebSocket(proxy.url.replace("http:", "ws:") + "/ws?clientId=test", { origin });
        await once(client, "open");
        const message = once(client, "message");
        client.send(Buffer.from([1, 2, 3]));
        expect(await message).toEqual([Buffer.from([1, 2, 3]), true]);
        client.close();
        await once(client, "close");
    } finally {
        proxy.close();
        upstream.closeAllConnections();
        upstream.close();
        upstreamWs.close();
    }
});
