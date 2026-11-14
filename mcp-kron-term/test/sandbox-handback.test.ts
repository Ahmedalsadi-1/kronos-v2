import assert from "node:assert/strict";
import test from "node:test";
import { registerSandboxComputerTools, setSandboxComputerBridge } from "../src/sandbox-computer-tools.js";

test("publishes handback and keeps login policy selection outside model arguments", async () => {
    const tools = new Map<string, { schema: Record<string, unknown>; handler: Function }>();
    registerSandboxComputerTools({
        tool(name: string, _description: string, schema: Record<string, unknown>, handler: Function) {
            tools.set(name, { schema, handler });
        },
    } as any);
    const calls: string[] = [];
    setSandboxComputerBridge(async (name) => {
        calls.push(name);
        return { handedBack: true };
    });
    const result = await tools.get("sandbox_vm_handback")!.handler({}, {});
    assert.equal(result.isError, undefined);
    assert.deepEqual(calls, ["sandbox_vm_handback"]);
    const memory = tools.get("sandbox_vm_login_preferences")!;
    assert.deepEqual(Object.keys(memory.schema).sort(), ["account", "action", "origin"]);
    assert.equal("policy" in memory.schema, false);
    setSandboxComputerBridge(async () => {
        throw new Error("Control changed");
    });
    const denied = await tools.get("sandbox_vm_handback")!.handler({}, {});
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /Control changed/);
});
