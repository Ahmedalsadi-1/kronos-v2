import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { KronComputerUseClient } from "../src/kron-computer-use.js";
import { ToolOperationContext } from "../src/tool-execution.js";

const fixture = async (run: (client: KronComputerUseClient, log: string) => Promise<void>) => {
    const directory = mkdtempSync(join(tmpdir(), "kron-computer-timings-"));
    const binary = join(directory, "fixture.mjs");
    const log = join(directory, "calls.jsonl");
    writeFileSync(
        binary,
        `#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
let initialized = false;
const lines = createInterface({input:process.stdin});
lines.on('line', async line => {
 const request = JSON.parse(line);
 if (!request.id) return;
 const name = request.params?.name ?? request.method;
 appendFileSync(process.env.KRON_TIMING_FIXTURE_LOG, JSON.stringify({name,initialized,args:request.params?.arguments})+'\\n');
 if(request.method === 'initialize') { await new Promise(resolve=>setTimeout(resolve,30)); initialized = true; }
 const result = request.method === 'initialize' ? {} : {content:[{type:'text',text:'private-result'}], ...(request.params?.arguments?.fail ? {isError:true} : {})};
 await new Promise(resolve=>setTimeout(resolve,5));
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\\n');
});
`,
        { mode: 0o755 }
    );
    const previousBinary = process.env.KRON_COMPUTER_USE_BIN;
    const previousLog = process.env.KRON_TIMING_FIXTURE_LOG;
    process.env.KRON_COMPUTER_USE_BIN = binary;
    process.env.KRON_TIMING_FIXTURE_LOG = log;
    const client = new KronComputerUseClient();
    try {
        await run(client, log);
    } finally {
        client.close();
        if (previousBinary == null) delete process.env.KRON_COMPUTER_USE_BIN;
        else process.env.KRON_COMPUTER_USE_BIN = previousBinary;
        if (previousLog == null) delete process.env.KRON_TIMING_FIXTURE_LOG;
        else process.env.KRON_TIMING_FIXTURE_LOG = previousLog;
        rmSync(directory, { recursive: true, force: true });
    }
};

test("warmup completes initialization before queued tools and records private aggregate metrics", async () => {
    await fixture(async (client, log) => {
        await Promise.all([client.warm(), client.callTool("get_app_state", { app: "Private app" })]);
        await client.callTool("get_app_state", { app: "Private app" });
        const calls = readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        assert.equal(calls[0].name, "initialize");
        assert.ok(calls.slice(1).every((call) => call.initialized));
        const diagnostics = client.diagnostics() as any;
        assert.equal(diagnostics.latency.startup.count, 1);
        assert.equal(diagnostics.latency.get_app_state.count, 2);
        assert.equal(diagnostics.latency["call:warm"].count, 1);
        assert.ok(!JSON.stringify(diagnostics.latency).includes("Private"));
        assert.ok(!JSON.stringify(diagnostics.latency).includes("private-result"));
    });
});

test("sequences never interleave other calls and stop after failed actions", async () => {
    await fixture(async (client, log) => {
        const sequence = client.callSequence([
            { name: "click", args: { app: "Fixture" } },
            { name: "type_text", args: { app: "Fixture", fail: true } },
            { name: "get_app_state", args: { app: "Fixture" } },
        ]);
        const other = client.callTool("press_key", { app: "Fixture" });
        const [results] = await Promise.all([sequence, other]);
        assert.equal(results.length, 3);
        assert.equal(results[1].isError, true);
        const calls = readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line).name);
        assert.deepEqual(calls, ["initialize", "click", "type_text", "get_app_state", "press_key"]);
        const latency = client.diagnostics().latency as any;
        assert.equal(latency.sequence.failures, 1);
        assert.equal(latency.type_text.failures, 1);
    });
});

test("closing an initializing process cannot clear or kill its replacement", async () => {
    await fixture(async (client) => {
        const interrupted = client.warm();
        client.close();
        const replacement = client.warm();
        await assert.rejects(interrupted, /stopped/);
        await replacement;
        const result = await client.callTool("get_app_state", { app: "Fixture" });
        assert.equal(result.isError, undefined);
        assert.equal(client.diagnostics().running, true);
        const latency = client.diagnostics().latency as any;
        assert.equal(latency.startup.count, 2);
        assert.equal(latency.startup.failures, 1);
    });
});

test("closing cancels queued mutations and only explicit new calls restart the client", async () => {
    await fixture(async (client) => {
        const queued = client.callTool("click", { app: "Fixture" });
        client.close();
        await assert.rejects(queued, /stopped/);
        assert.equal(client.diagnostics().running, false);
        await client.callTool("get_app_state", { app: "Fixture" });
        assert.equal(client.diagnostics().running, true);
    });
});

test("queued tools keep the exact arguments supplied at invocation", async () => {
    await fixture(async (client, log) => {
        const args = { app: "Original", text: "safe" };
        const pending = client.callTool("type_text", args);
        args.app = "Different";
        args.text = "changed";
        await pending;
        const call = readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
            .at(-1);
        assert.deepEqual(call.args, { app: "Original", text: "safe" });
    });
});

test("cancelled queued desktop mutations never reach the native runtime", async () => {
    await fixture(async (client, log) => {
        const blocker = client.callTool("get_app_state", { app: "Fixture" });
        const controller = new AbortController();
        const pending = ToolOperationContext.run({ signal: controller.signal } as any, () =>
            client.callTool("click", { app: "Fixture" })
        );
        controller.abort();
        await assert.rejects(pending, /abort/i);
        await blocker;
        const names = readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line).name);
        assert.deepEqual(names, ["initialize", "get_app_state"]);
    });
});

test("a desktop completion arriving after cancellation cannot report success", async (t) => {
    const client = new KronComputerUseClient();
    const controller = new AbortController();
    let complete: (value: unknown) => void;
    let entered: () => void;
    const requestEntered = new Promise<void>((resolve) => {
        entered = resolve;
    });
    t.mock.method(client as any, "ensureStarted", async () => {});
    t.mock.method(client as any, "request", async () => {
        entered();
        return new Promise((resolve) => {
            complete = resolve;
        });
    });
    const pending = ToolOperationContext.run({ signal: controller.signal } as any, () =>
        client.callTool("click", { app: "Fixture" })
    );
    await requestEntered;
    controller.abort();
    complete({ content: [] });
    await assert.rejects(pending, /abort/i);
    client.close();
});

test("starts a helper installed beside node when the GUI PATH omits its runtime", async () => {
    const previousPath = process.env.PATH;
    try {
        await fixture(async (client, log) => {
            symlinkSync(process.execPath, join(log, "..", "node"));
            process.env.PATH = "/usr/bin:/bin";
            await client.warm();
            assert.equal(client.diagnostics().running, true);
        });
    } finally {
        process.env.PATH = previousPath;
    }
});
