// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Plugin } from "vite";
import { ComputerTargetSessions } from "../../emain/computer-target-sessions";
import { getLinuxDesktopsRuntime } from "../../emain/linux-desktops-runtime";
import { getComputerTargetsRuntime } from "../../emain/computer-targets-runtime";

export function liveDevicePreview(): Plugin {
    const enabled = process.env.KRONTERM_DEVICE_PREVIEW === "1";
    const runtimeGlobals = globalThis as typeof globalThis & { krontermDevicePreviewToken?: string };
    const token = (runtimeGlobals.krontermDevicePreviewToken ??= randomBytes(32).toString("base64url"));
    return {
        name: "kronterm-live-device-preview",
        transformIndexHtml: () =>
            enabled
                ? [
                      {
                          tag: "script",
                          children: `window.__krontermLiveDevices=true;window.__krontermDevicePreviewToken=${JSON.stringify(token)};`,
                          injectTo: "head",
                      },
                  ]
                : [],
        configureServer(server) {
            if (!enabled) return;
            const runtime = getComputerTargetsRuntime();
            const linux = getLinuxDesktopsRuntime();
            const sessions = new ComputerTargetSessions(runtime);
            server.httpServer?.once("close", () => void sessions.dispose());
            server.middlewares.use("/__kronterm_devices", async (request, response) => {
                response.setHeader("Content-Type", "application/json");
                response.setHeader("Cache-Control", "no-store");
                const received = Buffer.from(String(request.headers["x-kronterm-device-preview"] ?? ""));
                const expected = Buffer.from(token);
                const remote = request.socket.remoteAddress;
                const origin = request.headers.origin;
                const trustedOrigin = origin === `http://${request.headers.host}`;
                if (
                    request.method !== "POST" ||
                    !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) ||
                    !trustedOrigin ||
                    received.length !== expected.length ||
                    !timingSafeEqual(received, expected)
                ) {
                    response.statusCode = 403;
                    response.end(
                        JSON.stringify({
                            success: false,
                            error: {
                                code: "preview-denied",
                                message: "Live preview requires its local workspace page.",
                            },
                        })
                    );
                    return;
                }
                try {
                    const chunks: Buffer[] = [];
                    let length = 0;
                    for await (const chunk of request) {
                        length += chunk.length;
                        if (length > 32 * 1024) throw new Error("Device request is too large.");
                        chunks.push(Buffer.from(chunk));
                    }
                    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                    let data: unknown;
                    if (input.method === "linux-list") data = await linux.list();
                    else if (input.method === "linux-action") data = await linux.perform(input.action);
                    else if (input.method === "linux-assign") data = await linux.assign(input.desktopId, input.agentId, input.expectedGeneration);
                    else if (input.method === "linux-takeover") data = await linux.takeover(input.desktopId);
                    else if (input.method === "linux-resume") data = await linux.resume(input.desktopId, input.expectedGeneration);
                    else if (input.method === "list") data = await runtime.list();
                    else if (input.method === "action") data = await runtime.perform(input.action);
                    else if (input.method === "takeover") data = await runtime.takeOver(input.targetId);
                    else if (input.method === "resume")
                        data = await runtime.resume(input.targetId, input.expectedGeneration);
                    else if (input.method === "connect")
                        data = await sessions.start(input.targetId, input.expectedGeneration, 1);
                    else if (input.method === "frame") data = await sessions.frame(input.sessionId, 1);
                    else if (input.method === "disconnect") data = await sessions.stop(input.sessionId, 1);
                    else throw new Error("Unsupported device preview operation.");
                    response.end(JSON.stringify({ success: true, data }));
                } catch (error) {
                    response.end(
                        JSON.stringify({
                            success: false,
                            error: {
                                code: "device-error",
                                message: error instanceof Error ? error.message : "Device operation failed.",
                            },
                        })
                    );
                }
            });
        },
    };
}
