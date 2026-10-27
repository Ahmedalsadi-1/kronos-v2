import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeToolManifest, server, setKronTermToolBridge } from "../src/index.js";
import { WshBridge } from "../src/wsh-bridge.js";

const registry = (server as any)._registeredTools;
test("pixel scrolling preserves zero origins and batches without observing between known actions", async () => {
    const calls: unknown[] = [];
    class ScrollBridge extends WshBridge {
        async getBlockInfo() {
            return "{}";
        }
        async focusBlock() {
            return "focused";
        }
        async widgetScroll(blockId: string, amount: number, x?: number, y?: number) {
            calls.push([blockId, amount, x, y]);
            return JSON.stringify({ success: true });
        }
        async widgetGetState() {
            return JSON.stringify({ focused: true });
        }
        async widgetSnapshot() {
            calls.push("snapshot");
            return "{}";
        }
        async publishAgentSurfaceActivity() {}
    }
    setKronTermToolBridge(new ScrollBridge());
    try {
        const result = await registry.widget_sequence.handler({
            blockId: "browser",
            actions: [
                { action: "scroll", amount: 120, originX: 0, originY: 0 },
                { action: "scroll", amount: -60, originX: 0, originY: 0 },
            ],
        });
        assert.ok(!result.isError);
        assert.deepEqual(calls, [["browser", 120, 0, 0], ["browser", -60, 0, 0], "snapshot"]);
        const invalid = await registry.widget_scroll.handler({ blockId: "browser", amount: 50, originX: 0 });
        assert.equal(invalid.isError, true);
        assert.equal(calls.length, 3);
        assert.equal(
            registry.widget_sequence.inputSchema.safeParse({
                blockId: "browser",
                actions: [{ action: "scroll", amount: 50, originX: 0 }],
            }).success,
            false
        );
    } finally {
        setKronTermToolBridge(new WshBridge());
    }
});
test("browser zoom rejects invalid factors before updating the live widget", () => {
    for (const zoom of ["", "0", "-1", "NaN", "Infinity", "6"]) {
        assert.equal(registry.browser_configure.inputSchema.safeParse({ blockId: "browser", zoom }).success, false);
    }
    for (const zoom of ["0.1", "1", "1.25", "5"]) {
        assert.equal(registry.browser_configure.inputSchema.safeParse({ blockId: "browser", zoom }).success, true);
    }
});
test("SDK empty schemas and typed schemas accept additive targets without mixed validators", async () => {
    assert.deepEqual(await registry.workspace_inventory.inputSchema.parseAsync({ targetTabId: "tab" }), {
        targetTabId: "tab",
    });
    assert.deepEqual(await registry.workspace_snapshot.inputSchema.parseAsync({}), {});
    assert.deepEqual(
        await registry.widget_click.inputSchema.parseAsync({
            blockId: "widget",
            elementRef: "ref",
            targetWorkspaceId: "workspace",
        }),
        { blockId: "widget", elementRef: "ref", targetWorkspaceId: "workspace" }
    );
    await assert.rejects(() => registry.workspace_inventory.inputSchema.parseAsync({ targetTabId: 42 }));
    const manifest = nativeToolManifest(() => true);
    for (const name of ["workspace_inventory", "workspace_snapshot", "tool_diagnostics"]) {
        const schema = manifest.find((tool) => tool.name === name)!.inputSchema;
        assert.equal(schema.type, "object");
        assert.ok(!JSON.stringify(schema).includes('"parseAsync"'));
    }
});

test("native clicks reject missing and conflicting targets before invoking desktop control", async () => {
    for (const args of [
        { app: "Fixture" },
        { app: "Fixture", elementIndex: "2", x: 5, y: 6 },
        { app: "Fixture", x: 5 },
    ]) {
        const result = await registry.kron_computer_click.handler(args);
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /exactly one click target/);
    }
    assert.equal(registry.kron_computer_click.inputSchema.safeParse({ app: "Fixture", x: -1, y: 2 }).success, false);
});

test("a failed widget wait cannot be accompanied by verified interaction evidence", async () => {
    class FixtureBridge extends WshBridge {
        async getBlockInfo() {
            return JSON.stringify({ blockid: "browser" });
        }
        async widgetWaitFor() {
            return JSON.stringify({ met: false, message: "condition timed out" });
        }
        async publishAgentSurfaceActivity() {}
    }
    setKronTermToolBridge(new FixtureBridge());
    try {
        const result = await registry.widget_wait_for.handler({
            blockId: "browser",
            condition: "visible",
            elementRef: "missing",
        });
        assert.equal(result.isError, true);
        const evidence = result.content
            .filter((item) => item.type === "text")
            .map((item) => {
                try {
                    return JSON.parse(item.text).interaction;
                } catch {
                    return undefined;
                }
            })
            .find(Boolean);
        assert.equal(evidence.ok, false);
        assert.equal(evidence.evidence.verifiedAfter, false);
    } finally {
        setKronTermToolBridge(new WshBridge());
    }
});
