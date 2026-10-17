import assert from "node:assert/strict";
import { test } from "node:test";
import { ComputerUseLatency } from "../src/computer-use-latency.js";
import { validateComputerUseSequence } from "../src/kron-computer-use.js";

test("latency stores bounded aggregate timings without caller data", () => {
    const latency = new ComputerUseLatency();
    for (let index = 1; index <= 200; index++) latency.record("get_app_state", index);
    latency.record("private-app-or-tool-name", 10, "timeout");
    latency.record("another-private-name", 20, "error");
    const values = latency.snapshot() as Record<string, any>;
    assert.equal(values.get_app_state.count, 200);
    assert.equal(values.get_app_state.sampleCount, 128);
    assert.equal(values.get_app_state.maxMs, 200);
    assert.equal(values.other.failures, 2);
    assert.equal(values.other.timeouts, 1);
    assert.ok(!JSON.stringify(values).includes("private"));
});

test("sequences are bounded to one app and final observation", () => {
    const click = { name: "click", args: { app: "Fixture", x: 1, y: 2 } };
    validateComputerUseSequence([click, { name: "get_app_state", args: { app: "Fixture" } }]);
    assert.throws(() => validateComputerUseSequence([]), /between/);
    assert.throws(() => validateComputerUseSequence(Array(13).fill(click)), /between/);
    assert.throws(
        () => validateComputerUseSequence([click, { name: "press_key", args: { app: "Other" } }]),
        /same app/
    );
    assert.throws(() => validateComputerUseSequence([{ name: "launch_app", args: { app: "Fixture" } }]), /Unsupported/);
    assert.throws(
        () => validateComputerUseSequence([{ name: "get_app_state", args: { app: "Fixture" } }, click]),
        /Unsupported/
    );
});
