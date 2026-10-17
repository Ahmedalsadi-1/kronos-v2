import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { NativeBackgroundDisplays } from "../src/background-display-runtime.js";

const Ready = { displayId: 42, spaceIds: ["71"], bounds: { x: 1920, y: 0, width: 1280, height: 800 } };
class FakeChild extends EventEmitter {
    stdout = new PassThrough();
    stderr = new PassThrough();
    stdin = new PassThrough();
    kills = 0;
    signals: string[] = [];
    autoExit = true;
    kill(signal = "SIGTERM") {
        this.kills++;
        this.signals.push(signal);
        if (this.autoExit) queueMicrotask(() => this.emit("exit", 0, signal));
        return true;
    }
}
function setup(timeout = 1000) {
    const child = new FakeChild();
    const calls: string[] = [];
    const runtime = new NativeBackgroundDisplays({
        binaryPath: "/owned/background-display",
        startupTimeoutMs: timeout,
        shutdownTimeoutMs: 5,
        registerExitCleanup: false,
        spawn: (binary) => {
            calls.push(binary);
            return child as any;
        },
    });
    return { child, runtime, calls };
}

test("keeps the owned helper alive, scopes metadata and refuses duplicate or concurrent displays", async () => {
    const { child, runtime, calls } = setup();
    const creating = runtime.create("agent-a");
    await assert.rejects(runtime.create("agent-a"), /already owns/);
    await assert.rejects(runtime.create("agent-b"), /Only one/);
    child.stdout.write(JSON.stringify(Ready).slice(0, 15));
    child.stdout.write(JSON.stringify(Ready).slice(15) + "\n");
    const result = await creating;
    assert.deepEqual(result, Ready);
    assert.deepEqual(calls, ["/owned/background-display"]);
    assert.equal(child.stdin.destroyed, false);
    assert.equal(child.kills, 0);
    assert.equal(runtime.get("agent-b"), undefined);
    result.bounds.width = 1;
    assert.deepEqual(runtime.get("agent-a"), Ready);
    await runtime.dispose("agent-b");
    assert.equal(child.kills, 0);
    child.emit("exit", 1);
    assert.throws(() => runtime.get("agent-a"), /unavailable/);
    await assert.rejects(runtime.create("agent-b"), /Only one/);
    await runtime.dispose("agent-a");
    assert.equal(child.kills, 0);
});

for (const value of [
    "not-json",
    JSON.stringify({ ...Ready, displayId: -1 }),
    JSON.stringify({ ...Ready, success: false }),
    JSON.stringify({ ...Ready, spaceIds: [] }),
    JSON.stringify({ ...Ready, spaceIds: ["0"] }),
    JSON.stringify({ ...Ready, bounds: { ...Ready.bounds, width: 1440 } }),
    JSON.stringify({ ...Ready, bounds: { ...Ready.bounds, width: 0 } }),
]) {
    test(`refuses invalid readiness ${value.slice(0, 30)}`, async () => {
        const { child, runtime } = setup();
        const pending = runtime.create("owner");
        child.stdout.write(value + "\n");
        await assert.rejects(pending, /invalid readiness/);
        assert.equal(child.kills, 1);
        assert.equal(runtime.get("owner"), undefined);
    });
}

test("limits receipt bytes and terminates only its owned helper", async () => {
    const { child, runtime } = setup();
    const pending = runtime.create("owner");
    child.stdout.write("x".repeat(16385));
    await assert.rejects(pending, /size limit/);
    assert.equal(child.kills, 1);
});

test("fails on early exit, spawn error, or timeout without automatic retry", async () => {
    for (const mode of ["exit", "error", "timeout"]) {
        const { child, runtime, calls } = setup(5);
        const pending = runtime.create("owner");
        if (mode === "exit") child.emit("exit", 2);
        if (mode === "error") child.emit("error", new Error("failed"));
        await assert.rejects(pending, /before readiness|could not start|timed out/);
        assert.equal(child.kills, mode === "exit" ? 0 : 1);
        assert.equal(calls.length, 1);
    }
});

test("rejects blank owners before spawning", async () => {
    const { runtime, calls } = setup();
    await assert.rejects(runtime.create(" "), /trusted/);
    assert.equal(calls.length, 0);
});

test("explicit disposal and application exit clean up only owned helper children", async () => {
    const { child, runtime } = setup();
    const pending = runtime.create("owner");
    child.stdout.write(JSON.stringify(Ready) + "\n");
    await pending;
    (runtime as any).exitCleanup();
    assert.equal(child.kills, 1);
    await runtime.dispose("owner");
    assert.equal(child.kills, 2);
    assert.equal(runtime.get("owner"), undefined);
    await runtime.dispose("owner");
    assert.equal(child.kills, 2);
});

test("stdin errors invalidate the display without an unhandled EPIPE", async () => {
    const { child, runtime } = setup();
    const pending = runtime.create("owner");
    child.stdout.write(JSON.stringify(Ready) + "\n");
    await pending;
    child.stdin.emit("error", new Error("EPIPE"));
    assert.throws(() => runtime.get("owner"), /unavailable/);
    await runtime.dispose("owner");
});

test("creation rate caps include failed startup and expire over their rolling windows", async () => {
    let now = 0;
    let spawns = 0;
    const runtime = new NativeBackgroundDisplays({
        registerExitCleanup: false,
        now: () => now,
        spawn: () => {
            spawns++;
            throw new Error("fake spawn failure");
        },
    });
    const attempt = () => assert.rejects(runtime.create("owner"), /fake spawn failure/);
    for (let batch = 0; batch < 3; batch++) {
        for (let i = 0; i < 4; i++) await attempt();
        await assert.rejects(runtime.create("owner"), /rate limit/);
        now += 60001;
    }
    assert.equal(spawns, 12);
    await assert.rejects(runtime.create("owner"), /rate limit/);
    now = 600001;
    for (let batch = 0; batch < 5; batch++) {
        for (let i = 0; i < 4; i++) await attempt();
        now += 600001;
    }
    assert.equal(spawns, 32);
    await assert.rejects(runtime.create("owner"), /rate limit/);
    now = 86400001;
    await attempt();
    assert.equal(spawns, 33);
});

test("disposal keeps the capacity reservation until delayed exit is confirmed", async () => {
    const { child, runtime } = setup();
    child.autoExit = false;
    const pending = runtime.create("owner");
    child.stdout.write(JSON.stringify(Ready) + "\n");
    await pending;
    const disposing = runtime.dispose("owner");
    await assert.rejects(runtime.create("replacement"), /Only one/);
    assert.throws(() => runtime.get("owner"), /unavailable/);
    child.emit("exit", 0);
    await disposing;
    assert.deepEqual(child.signals, ["SIGTERM"]);
    assert.equal(runtime.get("owner"), undefined);
});

test("a helper that never exits blocks replacements after bounded TERM and KILL", async () => {
    const { child, runtime } = setup();
    child.autoExit = false;
    const pending = runtime.create("owner");
    child.stdout.write(JSON.stringify(Ready) + "\n");
    await pending;
    const disposing = runtime.dispose("owner");
    await assert.rejects(disposing, /shutdown could not be confirmed/);
    assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
    await assert.rejects(runtime.create("replacement"), /Only one/);
    await assert.rejects(runtime.dispose("owner"), /shutdown could not be confirmed/);
    assert.equal(child.kills, 2);
    child.emit("exit", 0);
    assert.equal(runtime.get("owner"), undefined);
});

test("failed TERM delivery escalates only the owned helper and waits for KILL exit", async () => {
    const { child, runtime } = setup();
    child.kill = (signal = "SIGTERM") => {
        child.kills++;
        child.signals.push(signal);
        if (signal === "SIGKILL") queueMicrotask(() => child.emit("exit", null, "SIGKILL"));
        return signal === "SIGKILL";
    };
    const pending = runtime.create("owner");
    child.stdout.write(JSON.stringify(Ready) + "\n");
    await pending;
    await runtime.dispose("owner");
    assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
    assert.equal(runtime.get("owner"), undefined);
});

test("invalid startup cannot release capacity while failed helper remains alive", async () => {
    const { child, runtime, calls } = setup();
    child.autoExit = false;
    const pending = runtime.create("owner");
    child.stdout.write("bad receipt\n");
    await assert.rejects(pending, /startup failed and helper shutdown could not be confirmed/);
    assert.deepEqual(child.signals, ["SIGTERM", "SIGKILL"]);
    await assert.rejects(runtime.create("replacement"), /Only one/);
    assert.equal(calls.length, 1);
    child.emit("close", 1);
    assert.equal(runtime.get("owner"), undefined);
});
