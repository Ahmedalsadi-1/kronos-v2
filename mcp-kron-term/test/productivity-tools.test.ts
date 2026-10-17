import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { registerProductivityTools, setProductivityToolBridge } from "../src/productivity-tools.js";

afterEach(() => setProductivityToolBridge(undefined));

function tools() {
    const registered = new Map<string, { schema: any; handler: (input: any) => Promise<any> }>();
    registerProductivityTools({
        registerTool: (name: string, schema: any, handler: any) => registered.set(name, { schema, handler }),
    } as any);
    return registered;
}

test("productivity tools share the desktop bridge and separate reads from changes", async () => {
    const calls: unknown[] = [];
    setProductivityToolBridge({
        query: (input) => {
            calls.push(input);
            return { items: [{ id: "task", title: "Review" }] };
        },
        command: (input) => {
            calls.push(input);
            return { saved: true, id: "task" };
        },
    });
    const registry = tools();
    assert.equal(registry.get("productivity_query")!.schema.annotations.readOnlyHint, true);
    assert.equal(registry.get("productivity_update")!.schema.annotations.readOnlyHint, false);
    const read = await registry.get("productivity_query")!.handler({ collection: "tasks", limit: 1 });
    assert.equal(JSON.parse(read.content[0].text).items[0].id, "task");
    const command = { type: "task.status", id: "task", status: "completed" };
    const result = await registry.get("productivity_update")!.handler({ command });
    assert.deepEqual(calls, [{ collection: "tasks", limit: 1 }, command]);
    assert.equal(JSON.parse(result.content[0].text).saved, true);
});

test("validation failures never become successful delivery claims", async () => {
    setProductivityToolBridge({
        query: () => ({}),
        command: () => {
            throw new Error("Invalid duration");
        },
    });
    const result = await tools()
        .get("productivity_update")!
        .handler({ command: { type: "focus.start", minutes: -1 } });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, "Invalid duration");
});
