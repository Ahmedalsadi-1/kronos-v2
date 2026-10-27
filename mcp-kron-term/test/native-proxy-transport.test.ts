import assert from "node:assert/strict";
import { test } from "node:test";
import { bridgeRequest } from "../src/native-proxy.js";

async function withEnvironment(run: () => Promise<void>) {
    const previousUrl = process.env.KRONTERM_NATIVE_TOOL_URL;
    const previousToken = process.env.KRONTERM_NATIVE_TOOL_TOKEN;
    process.env.KRONTERM_NATIVE_TOOL_URL = "http://127.0.0.1:9999/native";
    process.env.KRONTERM_NATIVE_TOOL_TOKEN = "fixture";
    try {
        await run();
    } finally {
        if (previousUrl == null) delete process.env.KRONTERM_NATIVE_TOOL_URL;
        else process.env.KRONTERM_NATIVE_TOOL_URL = previousUrl;
        if (previousToken == null) delete process.env.KRONTERM_NATIVE_TOOL_TOKEN;
        else process.env.KRONTERM_NATIVE_TOOL_TOKEN = previousToken;
    }
}

test("native proxy refuses remote or credential-bearing endpoints before sending a token", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
    await withEnvironment(async () => {
        for (const url of [
            "https://remote.example/native",
            "http://user:password@127.0.0.1/native",
            "http://127.0.0.1/wrong",
        ]) {
            process.env.KRONTERM_NATIVE_TOOL_URL = url;
            const result = await bridgeRequest({ method: "call", name: "widget_click" });
            assert.match(String(result.error), /local HTTP/);
            assert.equal((result.failure as any).uncertain, false);
        }
    });
    assert.equal(fetch.mock.callCount(), 0);
});

test("native proxy catches body-stream failures and marks dispatched mutations uncertain", async (t) => {
    t.mock.method(globalThis, "fetch", async (_url, options) => {
        assert.equal(options?.redirect, "error");
        return new Response(
            new ReadableStream({
                start(controller) {
                    controller.error(new Error("stream disconnected"));
                },
            })
        );
    });
    await withEnvironment(async () => {
        const result = await bridgeRequest({ method: "call", name: "widget_click" });
        assert.match(String(result.error), /stream disconnected/);
        assert.equal((result.failure as any).uncertain, true);
    });
});

test("already cancelled proxy requests never dispatch", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response("{}"));
    await withEnvironment(async () => {
        const controller = new AbortController();
        controller.abort();
        const result = await bridgeRequest({ method: "call", name: "widget_click" }, controller.signal);
        assert.equal((result.failure as any).uncertain, false);
    });
    assert.equal(fetch.mock.callCount(), 0);
});

test("native proxy caps streamed response bytes and cancels the reader", async (t) => {
    let cancelled = false;
    t.mock.method(
        globalThis,
        "fetch",
        async () =>
            new Response(
                new ReadableStream({
                    pull(controller) {
                        controller.enqueue(new Uint8Array(1024 * 1024));
                    },
                    cancel() {
                        cancelled = true;
                    },
                })
            )
    );
    await withEnvironment(async () => {
        const result = await bridgeRequest({ method: "call", name: "widget_click" });
        assert.match(String(result.error), /oversized/);
        assert.equal(cancelled, true);
    });
});
