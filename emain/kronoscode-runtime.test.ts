import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    getKronosCodeBinaryCandidates,
    isKronosCodeLoopbackUrl,
    KronosCodeRuntimeManager,
    validateKronosCodeEndpoint,
    withKronosCodeAttachArgs,
} from "./kronoscode-runtime";

const servers: http.Server[] = [];
const managers: KronosCodeRuntimeManager[] = [];
const runtimeFixtures: string[] = [];

function healthPayload(protocolVersion = "1.0") {
    return {
        healthy: true,
        version: "test",
        protocolVersion,
        serverInstanceId: "test-instance",
        capabilities: {
            gateway: true,
            replay: true,
            asyncPrompt: true,
            promptIdempotency: true,
            pagedHistory: true,
        },
    };
}

async function startHealthServer(
    handler: (request: http.IncomingMessage) => { status?: number; body?: unknown } = () => ({
        body: healthPayload(),
    })
): Promise<string> {
    const server = http.createServer((request, response) => {
        const result = handler(request);
        response.writeHead(result.status ?? 200, { "content-type": "application/json" });
        response.end(JSON.stringify(result.body ?? healthPayload()));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const manager of managers.splice(0)) {
        manager.stop();
    }
    for (const directory of runtimeFixtures.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
    await Promise.all(
        servers.splice(0).map(
            (server) =>
                new Promise<void>((resolve) => {
                    server.close(() => resolve());
                })
        )
    );
});

describe("KronosCode runtime manager", () => {
    it.skipIf(process.platform === "win32")("reports spawn failures and removes the startup directory", async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-runtime-test-"));
        runtimeFixtures.push(directory);
        const binary = path.join(directory, "kronoscode");
        fs.writeFileSync(binary, "#!/nonexistent/kronterm-test-interpreter\n", { mode: 0o700 });
        const directories = vi.spyOn(fs.promises, "mkdtemp");
        vi.stubEnv("KRONOSCODE_SERVER_URL", "");
        const manager = new KronosCodeRuntimeManager();
        managers.push(manager);
        await expect(manager.ensure({ settings: { "kronoscode:binary": binary } } as FullConfigType)).rejects.toThrow(
            "ENOENT"
        );
        expect(manager.progress.phase).toBe("error");
        expect(manager.descriptor).toBeNull();
        const runtimeDir = await directories.mock.results[0].value;
        expect(fs.existsSync(runtimeDir)).toBe(false);
    });

    it("does not restore a connection when shutdown happens during validation", async () => {
        const manager = new KronosCodeRuntimeManager();
        managers.push(manager);
        let release: (response: Response) => void;
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
            () =>
                new Promise<Response>((resolve) => {
                    release = resolve;
                })
        );
        vi.stubEnv("KRONOSCODE_SERVER_URL", "http://127.0.0.1:9999");
        try {
            const pending = manager.ensure({ settings: {} } as FullConfigType);
            await Promise.resolve();
            manager.stop();
            release(
                new Response(JSON.stringify(healthPayload()), {
                    headers: { "content-type": "application/json" },
                })
            );
            await expect(pending).rejects.toThrow("startup was cancelled");
            expect(manager.descriptor).toBeNull();
            expect(manager.progress.phase).not.toBe("ready");
        } finally {
            fetchSpy.mockRestore();
        }
    });

    it.skipIf(process.platform === "win32")(
        "starts a cold managed server and waits for its assigned port and health",
        async () => {
            const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kronterm-runtime-test-"));
            runtimeFixtures.push(directory);
            const binary = path.join(directory, "kronoscode");
            fs.writeFileSync(
                binary,
                `#!${process.execPath}
const http = require("node:http");
const fs = require("node:fs");
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
const readyFile = args[args.indexOf("--ready-file") + 1];
const health = ${JSON.stringify(healthPayload())};
const server = http.createServer((request, response) => {
    const expected = "Basic " + Buffer.from(process.env.KRONOSCODE_SERVER_USERNAME + ":" + process.env.KRONOSCODE_SERVER_PASSWORD).toString("base64");
    response.writeHead(request.headers.authorization === expected ? 200 : 401, { "content-type": "application/json" });
    response.end(JSON.stringify(health));
});
setTimeout(() => server.listen(port, "127.0.0.1", () => {
    fs.writeFileSync(readyFile, JSON.stringify({ type: "KRONOSCODE_BACKEND_READY", url: "http://127.0.0.1:" + server.address().port, protocolVersion: "1.0" }));
}), 100);
`,
                { mode: 0o700 }
            );
            vi.stubEnv("KRONOSCODE_SERVER_URL", "");
            const manager = new KronosCodeRuntimeManager();
            managers.push(manager);
            const directories = vi.spyOn(fs.promises, "mkdtemp");
            const startup = manager.ensure({ settings: { "kronoscode:binary": binary } } as FullConfigType);
            expect(manager.descriptor).toBeNull();
            const connection = await startup;
            expect(connection.managed).toBe(true);
            expect(Number(new URL(connection.baseUrl).port)).toBeGreaterThan(0);
            expect(manager.progress.phase).toBe("ready");
            expect(await manager.revalidate()).toEqual(connection);
            const runtimeDir = await directories.mock.results[0].value;
            expect(fs.existsSync(runtimeDir)).toBe(false);
        }
    );

    it("rejects a cached external connection whose server has stopped", async () => {
        const endpoint = await startHealthServer();
        const manager = new KronosCodeRuntimeManager();
        managers.push(manager);
        await manager.applyConnection({ endpoint });
        const server = servers.pop();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await expect(manager.revalidate()).rejects.toThrow("KronosCode validation failed");
    });

    it("enforces endpoint transport policy", () => {
        expect(validateKronosCodeEndpoint("http://127.0.0.1:4096").hostname).toBe("127.0.0.1");
        expect(validateKronosCodeEndpoint("https://backend.example.com").protocol).toBe("https:");
        expect(() => validateKronosCodeEndpoint("http://backend.example.com")).toThrow(
            "Non-loopback KronosCode endpoints require TLS"
        );
        expect(() => validateKronosCodeEndpoint("ws://127.0.0.1:4096")).toThrow(
            "KronosCode endpoint must use http or https"
        );
        expect(isKronosCodeLoopbackUrl("http://127.0.0.1:4096")).toBe(true);
        expect(isKronosCodeLoopbackUrl("https://backend.example.com")).toBe(false);
    });

    it("keeps binary override precedence and replaces stale ACP attach arguments", () => {
        const candidates = getKronosCodeBinaryCandidates("/tmp/kronoscode-override");
        expect(candidates[0]).toBe("/tmp/kronoscode-override");
        expect(new Set(candidates).size).toBe(candidates.length);
        expect(withKronosCodeAttachArgs(["acp", "--attach", "http://old", "--verbose"], "http://new")).toEqual([
            "acp",
            "--verbose",
            "--attach",
            "http://new",
        ]);
    });

    it("honors the documented bundled binary override for Hermes delegation too", () => {
        vi.stubEnv("KRONTERM_KRONOSCODE_BIN", "/custom/kronoscode");
        expect(getKronosCodeBinaryCandidates()[0]).toBe("/custom/kronoscode");
        expect(getKronosCodeBinaryCandidates("/explicit/kronoscode").slice(0, 2)).toEqual([
            "/explicit/kronoscode",
            "/custom/kronoscode",
        ]);
    });

    it("single-flights external validation and never owns the external process", async () => {
        let healthRequests = 0;
        const endpoint = await startHealthServer(() => {
            healthRequests += 1;
            return { body: healthPayload() };
        });
        const manager = new KronosCodeRuntimeManager();
        managers.push(manager);
        const config = {
            settings: {
                "kronoscode:endpoint": endpoint,
                "kronoscode:username": "kronoscode",
            },
        } as FullConfigType;

        const [first, second] = await Promise.all([manager.ensure(config), manager.ensure(config)]);

        expect(first).toEqual(second);
        expect(first.managed).toBe(false);
        expect(healthRequests).toBe(1);
        manager.stop();
        expect((await fetch(`${endpoint}/global/health`)).ok).toBe(true);
    });

    it("authenticates health checks and retains a working connection after failed re-homing", async () => {
        const authorization = `Basic ${Buffer.from("alice:secret").toString("base64")}`;
        const endpoint = await startHealthServer((request) => ({
            status: request.headers.authorization === authorization ? 200 : 401,
            body: request.headers.authorization === authorization ? healthPayload() : { error: "unauthorized" },
        }));
        const invalidEndpoint = await startHealthServer(() => ({ body: healthPayload("0.9") }));
        const manager = new KronosCodeRuntimeManager();
        managers.push(manager);

        const working = await manager.applyConnection({
            endpoint,
            username: "alice",
            password: "secret",
        });
        await expect(
            manager.applyConnection({
                endpoint: invalidEndpoint,
                username: "alice",
                password: "secret",
            })
        ).rejects.toThrow("required KronosCode desktop protocol");

        expect(manager.descriptor).toEqual(working);
    });

    it("times out stalled API requests", async () => {
        const server = http.createServer((request, response) => {
            if (request.url === "/global/health") {
                response.writeHead(200, { "content-type": "application/json" });
                response.end(JSON.stringify(healthPayload()));
            }
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const manager = new KronosCodeRuntimeManager(25);
        managers.push(manager);
        await manager.applyConnection({ endpoint, username: "kronoscode" });

        await expect(manager.api({ path: "/stalled" })).rejects.toThrow(/timeout|aborted/i);
    });
});
