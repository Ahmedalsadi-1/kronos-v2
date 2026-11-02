import assert from "node:assert/strict";
import { test } from "node:test";
import { WshBridge } from "../src/wsh-bridge.ts";

test("widget snapshot includes a screenshot for the same block", async () => {
    const bridge = Object.create(WshBridge.prototype) as WshBridge;
    const calls: string[][] = [];
    (bridge as any).run = async (args: string[]) => {
        calls.push(args);
        return args.includes("snapshot") ? JSON.stringify({ elements: [{ ref: "button-1" }] }) : "data:image/png;base64,aGVsbG8=";
    };
    const result = JSON.parse(await bridge.widgetSnapshot("browser"));
    assert.equal(result.elements[0].ref, "button-1");
    assert.equal(result.screenshot, "data:image/png;base64,aGVsbG8=");
    assert.equal(calls.length, 2);
    assert.equal(calls[0][1], calls[1][1]);
});
