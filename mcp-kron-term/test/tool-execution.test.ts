import assert from "node:assert/strict";
import { test } from "node:test";
import { executeTool, normalizeToolResult, ToolOperationContext, toolTimeoutMs } from "../src/tool-execution.js";

test("budgets distinguish observations, mutations, waits and explicit long operations", () => {
    assert.equal(toolTimeoutMs("workspace_snapshot", {}, true), 10000);
    assert.equal(toolTimeoutMs("widget_type", {}, false), 30000);
    assert.equal(toolTimeoutMs("widget_wait_for", { timeoutMs: 60000 }, true), 62000);
    assert.equal(toolTimeoutMs("acp_run_agent", { timeoutSeconds: 600 }, false), 605000);
    assert.equal(toolTimeoutMs("linux_desktop_start", {}, false), 180000);
    assert.equal(toolTimeoutMs("sandbox_task_start", {}, false), 180000);
    assert.equal(toolTimeoutMs("kron_computer_background_workspace_start", {}, false), 120000);
    assert.equal(toolTimeoutMs("kron_computer_background_workspace_observe", {}, true), 120000);
});

test("embedded unsuccessful results never report success", async () => {
    const result = await executeTool("workspace_move_widget", {}, false, async () => ({
        content: [{ type: "text", text: JSON.stringify({ success: false, message: "Cannot resize tabs" }) }],
    }));
    assert.equal(result.isError, true);
    assert.equal(result._meta.failure.code, "ACTION_FAILED");
    assert.equal(
        normalizeToolResult({ content: [{ type: "text", text: "plain successful output" }] }).isError,
        undefined
    );
});

test("concurrent operations have isolated identity and deadlines", async () => {
    const identities = await Promise.all(
        [1, 2].map(() =>
            executeTool("workspace_snapshot", {}, true, async () => {
                const before = ToolOperationContext.getStore();
                await new Promise((resolve) => setImmediate(resolve));
                assert.equal(ToolOperationContext.getStore(), before);
                return before!.requestId;
            })
        )
    );
    assert.notEqual(identities[0], identities[1]);
    assert.equal(ToolOperationContext.getStore(), undefined);
});

test("exceptions are structured and are never automatically replayed", async () => {
    let attempts = 0;
    const result = await executeTool("terminal_input", { blockId: "exact" }, false, async () => {
        attempts++;
        throw new Error("connection lost");
    });
    assert.equal(attempts, 1);
    const failure = JSON.parse(result.content[0].text);
    assert.equal(failure.target.blockId, "exact");
    assert.equal(failure.retryable, false);
    assert.equal(result.isError, true);
});

test("deadline aborts execution and marks a mutation outcome uncertain", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let signal: AbortSignal;
    const pending = executeTool("widget_type", {}, false, async () => {
        signal = ToolOperationContext.getStore()!.signal;
        return new Promise(() => {});
    });
    t.mock.timers.tick(30000);
    const result = await pending;
    assert.equal(signal!.aborted, true);
    const failure = JSON.parse(result.content[0].text);
    assert.equal(failure.code, "DEADLINE_EXCEEDED");
    assert.equal(failure.outcome, "uncertain");
    assert.equal(failure.retryable, false);
});

test("caller cancellation stops future RPC work without replay", async () => {
    const controller = new AbortController();
    let signal: AbortSignal;
    const pending = executeTool(
        "widget_click",
        {},
        false,
        async () => {
            signal = ToolOperationContext.getStore()!.signal;
            return new Promise(() => {});
        },
        controller.signal
    );
    controller.abort();
    const result = await pending;
    assert.equal(signal!.aborted, true);
    assert.equal(JSON.parse(result.content[0].text).code, "CANCELLED");
});

test("already cancelled requests never execute", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const result = await executeTool(
        "terminal_input",
        {},
        false,
        async () => {
            calls++;
        },
        controller.signal
    );
    assert.equal(calls, 0);
    assert.equal(result.isError, true);
});
