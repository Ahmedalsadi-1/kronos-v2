#!/usr/bin/env node

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { server } from "./index.js";
import { isToolAllowedBySurfaceCapability } from "./surface-policy.js";
import { readSurfaceCapability, type SurfaceCapability } from "./wsh-bridge.js";

type NativeBridgeRequest =
    | { method: "manifest" }
    | { method: "list" }
    | { method: "allowed"; name: string }
    | { method: "call"; name: string; arguments?: Record<string, unknown> };

export { isToolAllowedBySurfaceCapability } from "./surface-policy.js";

function currentSurfaceCapability(): SurfaceCapability | undefined {
    const file = process.env.KRONTERM_SURFACE_CAPABILITY_FILE;
    return file ? readSurfaceCapability(file) : undefined;
}

export async function runNativeBridgeRequest(request: NativeBridgeRequest): Promise<unknown> {
    const client = new Client({ name: "kronterm-native-hermes", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
        if (request.method === "manifest") {
            return await client.listTools();
        }
        if (request.method === "list") {
            const result = await client.listTools();
            const capability = currentSurfaceCapability();
            return {
                ...result,
                tools: result.tools.filter((tool) => isToolAllowedBySurfaceCapability(tool.name, capability)),
            };
        }
        const capability = currentSurfaceCapability();
        if (request.method === "allowed") {
            return { allowed: isToolAllowedBySurfaceCapability(request.name, capability) };
        }
        if (!isToolAllowedBySurfaceCapability(request.name, capability)) {
            throw new Error(`Tool ${request.name} is not enabled for the active Hermes workspace`);
        }
        return await client.callTool({
            name: request.name,
            arguments: request.arguments ?? {},
        });
    } finally {
        await client.close().catch(() => undefined);
    }
}

async function main(): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const input = Buffer.concat(chunks).toString("utf8").trim();
    if (!input) {
        throw new Error("native bridge request is required on stdin");
    }
    const request = JSON.parse(input) as NativeBridgeRequest;
    const result = await runNativeBridgeRequest(request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMainModule = process.argv[1] != null && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
    main().catch((error) => {
        process.stderr.write(`kronterm-native-bridge: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}
