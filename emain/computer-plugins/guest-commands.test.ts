import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { GuestBrowser, GuestFiles, guestPython } from "./guest-commands";
const exec = promisify(execFile);
const input = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

it("passes arbitrary file text as data and reads the exact guest file in pages", async () => {
    const dir = await mkdtemp(join(tmpdir(), "guest-files-"));
    try {
        const path = join(dir, "quoted ' file.txt");
        const text = "$(touch /should-never-run) `echo no` ' \"\nhello";
        await exec("python3", ["-c", GuestFiles, input({ action: "write", path, text })]);
        const result = await exec("python3", ["-c", GuestFiles, input({ action: "read", path })]);
        expect(JSON.parse(result.stdout).text).toBe(text);
        expect(guestPython(GuestFiles, { action: "write", path, text })).not.toContain(text);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

it("uses the guest-only CDP transport for browser state and navigation", async () => {
    let port = 0;
    const methods: string[] = [];
    const paths: string[] = [];
    const server = createServer((_req, res) =>
        res.end(
            JSON.stringify([
                {
                    type: "page",
                    url: "devtools://devtools/bundled/inspector.html",
                    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/inspector`,
                },
                {
                    type: "page",
                    url: "http://localhost:5173",
                    webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/fixture`,
                },
            ])
        )
    );
    const sockets = new WebSocketServer({ server });
    sockets.on("connection", (ws, request) => {
        paths.push(request.url ?? "");
        ws.on("message", (raw) => {
            const message = JSON.parse(raw.toString());
            methods.push(message.method);
            ws.send(JSON.stringify({ id: message.id, result: { fixture: true } }));
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as any).port;
    const source = GuestBrowser.replaceAll("9222", String(port));
    try {
        const state = await exec("python3", ["-c", source, input({ action: "state" })]);
        expect(JSON.parse(state.stdout).result.fixture).toBe(true);
        await exec("python3", ["-c", source, input({ action: "navigate", url: "https://example.com" })]);
        expect(methods).toEqual(["Runtime.evaluate", "Page.navigate"]);
        expect(paths).toEqual(["/devtools/page/fixture", "/devtools/page/fixture"]);
    } finally {
        for (const ws of sockets.clients) ws.terminate();
        sockets.close();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
});
