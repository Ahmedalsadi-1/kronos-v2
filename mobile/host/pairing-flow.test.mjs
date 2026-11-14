import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Mac pairing advertises agent chat only when the upstream has a compatible session API", async () => {
    let sessions = { service: "Healthy service without the iPhone API" };
    const upstream = createHttpServer((request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(request.url === "/api/session" ? sessions : { status: "ok" }));
    });
    await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const reservation = createServer();
    await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const directory = await mkdtemp(join(tmpdir(), "kronterm-pair-test-"));
    const child = spawn(process.execPath, [new URL("./kronlink-host.mjs", import.meta.url).pathname,
        "--port", String(port), "--code", "123456", "--disable-phoneagent", "--token-store", join(directory, "tokens.json"),
        "--upstream", `http://127.0.0.1:${upstream.address().port}`],
        { env: { ...process.env, KRONTERM_AGENT_URL: "" }, stdio: ["ignore", "pipe", "pipe"] });
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Connector failed to start")), 10_000);
            child.stdout.on("data", (chunk) => { if (chunk.toString().includes("KronLink Host:")) {clearTimeout(timer); resolve();} });
            child.once("error", (error) => {clearTimeout(timer); reject(error);});
            child.once("exit", () => {clearTimeout(timer); reject(new Error("Connector stopped"));});
        });
        const origin = `http://127.0.0.1:${port}`;
        const page = await fetch(`${origin}/pair`);
        assert.equal(page.status, 200); assert.match(await page.text(), /<svg/);
        const pair = (code) => fetch(`${origin}/v1/pair`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({code})});
        assert.equal((await pair("000000")).status, 401);
        const response = await pair("123456"); assert.equal(response.status, 200);
        const identity = await response.json(); assert.equal(typeof identity.token, "string"); assert.ok(identity.token.length >= 32);
        assert.deepEqual(identity.capabilities, []);
        const health = async () => (await fetch(`${origin}/health`)).json();
        const incompatible = await health();
        assert.equal(incompatible.ready, false);
        assert.match(incompatible.detail, /does not expose the iPhone session API/);
        sessions = { sessions: [] };
        const compatible = await health();
        assert.equal(compatible.ready, true);
        assert.ok(compatible.capabilities.includes("kronoscode"));
        const repairedPair = await (await pair("123456")).json();
        assert.ok(repairedPair.capabilities.includes("kronoscode"));
    } finally {
        if (child.exitCode == null) { const exited = new Promise((resolve) => child.once("exit", resolve)); child.kill(); await exited; }
        await new Promise((resolve) => upstream.close(resolve));
        await rm(directory, {recursive: true, force: true});
    }
});
