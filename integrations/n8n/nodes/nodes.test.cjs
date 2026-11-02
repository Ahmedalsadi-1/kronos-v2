const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { KronTermTool } = require("./KronTermTool.node");
const { KronTermHarness } = require("./KronTermHarness.node");
const { KronTermWidget } = require("./KronTermWidget.node");
const { callTool } = require("./bridge");

const originalFetch = global.fetch;
const originalUrl = process.env.KRONTERM_N8N_TOOL_URL;
const originalToken = process.env.KRONTERM_N8N_TOOL_TOKEN;
afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl == null) delete process.env.KRONTERM_N8N_TOOL_URL;
    else process.env.KRONTERM_N8N_TOOL_URL = originalUrl;
    if (originalToken == null) delete process.env.KRONTERM_N8N_TOOL_TOKEN;
    else process.env.KRONTERM_N8N_TOOL_TOKEN = originalToken;
});

function bridge(handler) {
    process.env.KRONTERM_N8N_TOOL_URL = "http://127.0.0.1:1234/native";
    process.env.KRONTERM_N8N_TOOL_TOKEN = "private-token";
    global.fetch = async (url, options) => {
        assert.equal(url.hostname, "127.0.0.1");
        assert.equal(options.headers.authorization, "Bearer private-token");
        handler(JSON.parse(options.body));
        return { ok: true, json: async () => ({ content: [{ type: "text", text: "done" }] }) };
    };
}

test("tool node evaluates parameters per item and preserves item links", async () => {
    const calls = [];
    bridge((payload) => calls.push(payload));
    const result = await new KronTermTool().execute.call({
        getInputData: () => [{ json: {} }, { json: {} }],
        getNodeParameter: (name, index) =>
            name === "tool" ? "widget_type" : JSON.stringify({ blockId: `block-${index}`, text: "hello" }),
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[1].arguments.blockId, "block-1");
    assert.deepEqual(result[0][1].pairedItem, { item: 1 });
});

test("harness node invokes the ACP harness with the chosen agent and timeout", async () => {
    let payload;
    bridge((value) => {
        payload = value;
    });
    await new KronTermHarness().execute.call({
        getInputData: () => [{ json: {} }],
        getNodeParameter: (name) =>
            ({ backend: "kronoscode", task: "Inspect the assigned widget", timeoutSeconds: 60 })[name],
    });
    assert.equal(payload.name, "acp_run_agent");
    assert.equal(payload.arguments.task, "Inspect the assigned widget");
    assert.equal(payload.arguments.timeoutSeconds, 60);
});

test("widget node passes the exact widget target to the existing bridge", async () => {
    let payload;
    bridge((value) => {
        payload = value;
    });
    await new KronTermWidget().execute.call({
        getInputData: () => [{ json: {} }],
        getNodeParameter: (name, _index, fallback) =>
            name === "operation" ? "widget_snapshot" : name === "arguments" ? { blockId: "widget-123" } : fallback,
    });
    assert.equal(payload.name, "widget_snapshot");
    assert.equal(payload.arguments.blockId, "widget-123");
});

test("invalid arguments and failed tool results fail the n8n node", async () => {
    bridge(() => {});
    await assert.rejects(
        new KronTermTool().execute.call({
            getInputData: () => [{ json: {} }],
            getNodeParameter: (name) => (name === "tool" ? "list_blocks" : "[]"),
        }),
        /JSON object/
    );
    global.fetch = async () => ({
        ok: true,
        json: async () => ({ isError: true, content: [{ text: "Approval required" }] }),
    });
    await assert.rejects(callTool("widget_click", {}), /Approval required/);
    process.env.KRONTERM_N8N_TOOL_URL = "https://example.com/native";
    await assert.rejects(callTool("list_blocks", {}), /Invalid KronTerm tool endpoint/);
});

test("bound widget nodes use their selected live widget and preserve chained output", async () => {
    const calls = [];
    bridge((payload) => calls.push(payload));
    const result = await new KronTermWidget().execute.call({
        getInputData: () => [{ json: {} }, { json: {} }],
        getNodeParameter: (name, index) =>
            ({
                operation: "widget_type",
                blockId: `widget-${index}`,
                arguments: { blockId: "stale-target", text: "hello" },
            })[name],
    });
    assert.deepEqual(
        calls.map((call) => call.arguments),
        [
            { blockId: "widget-0", text: "hello" },
            { blockId: "widget-1", text: "hello" },
        ]
    );
    assert.deepEqual(result[0][1].pairedItem, { item: 1 });
    assert.equal(result[0][1].json.output, "done");
});

test("bound widget node exchanges live state over the authenticated loopback bridge", async () => {
    const { createServer } = require("node:http");
    const server = createServer(async (request, response) => {
        let body = "";
        for await (const chunk of request) body += chunk;
        const payload = JSON.parse(body);
        assert.equal(request.headers.authorization, "Bearer scoped-widget-token");
        assert.equal(payload.name, "widget_get_state");
        assert.deepEqual(payload.arguments, { blockId: "live-browser" });
        response.setHeader("content-type", "application/json");
        response.end(
            JSON.stringify({
                content: [
                    { type: "text", text: JSON.stringify({ blockId: "live-browser", title: "Workspace browser" }) },
                ],
            })
        );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    process.env.KRONTERM_N8N_TOOL_URL = `http://127.0.0.1:${server.address().port}/native`;
    process.env.KRONTERM_N8N_TOOL_TOKEN = "scoped-widget-token";
    try {
        const result = await new KronTermWidget().execute.call({
            getInputData: () => [{ json: {} }],
            getNodeParameter: (name) =>
                ({ operation: "widget_get_state", blockId: "live-browser", arguments: "{}" })[name],
        });
        assert.equal(result[0][0].json.blockId, "live-browser");
        assert.equal(result[0][0].json.title, "Workspace browser");
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
