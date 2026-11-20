import { describe, expect, test, vi } from "vitest";
import { DelegationPolicy } from "./delegation-policy";
import type { HermesSurfaceContext } from "./hermes-runtime";

vi.mock("./computer-access-policy", () => ({ sandboxComputerForTab: () => "vm:1" }));
const context = { tabId: "tab:1", nativeCallerId: "caller:1", sandboxComputerId: "vm:1" } as HermesSurfaceContext;
const tools = ["sandbox_vm_exec"];
const desktop = () =>
    ({
        id: "vm:1",
        ready: true,
        status: "running",
        controlOwner: "agent",
        assignedAgentId: "sandbox:tab:1",
        controlGeneration: 7,
    }) as any;
describe("delegated computer leases", () => {
    test("device-only inherited workers do not require an unrelated VM and cannot acquire its tools", async () => {
        const inspect = vi.fn(async () => { throw new Error("Start the virtual machine."); });
        const policy = new DelegationPolicy(inspect);
        const grant = await policy.prepare({ ...context, sandboxComputerMode: "hybrid" }, "inherit", 1,
            ["device_observe", "device_step"], ["device_observe", "device_step", "sandbox_vm_exec", "terminal", "tool_search"]);
        expect(inspect).not.toHaveBeenCalled();
        expect(grant.tools).toEqual(["device_observe", "device_step", "tool_search"]);
        expect((await policy.resolve(grant.token, "caller:1")).context.deviceOnly).toBe(true);
        policy.finish(grant.token, undefined, "caller:1");
    });
    test("validates readiness and required tools before issuing a lease", async () => {
        const vm = desktop();
        const policy = new DelegationPolicy(async () => vm);
        vm.ready = false;
        await expect(policy.prepare(context, "sandbox", 1, tools, tools)).rejects.toThrow("ready");
        vm.ready = true;
        await expect(policy.prepare(context, "sandbox", 1, ["terminal_execute"], tools)).rejects.toThrow("unavailable");
        await expect(policy.prepare(context, "sandbox", 2, tools, tools)).rejects.toThrow("one sandbox");
        const grant = await policy.prepare(context, "sandbox", 1, tools, tools);
        expect((await policy.resolve(grant.token, "caller:1")).context.delegationScope).toBe("sandbox");
        await expect(policy.resolve(grant.token, "caller:2")).rejects.toThrow("revoked");
    });
    test("serializes sandbox workers, fences takeover, and accepts a new control generation", async () => {
        const vm = desktop();
        const policy = new DelegationPolicy(async () => vm);
        const first = await policy.prepare(context, "sandbox", 1);
        await expect(policy.prepare(context, "sandbox", 1)).rejects.toThrow("already controls");
        vm.controlGeneration++;
        await expect(policy.resolve(first.token, "caller:1")).rejects.toThrow("control changed");
        const second = await policy.prepare(context, "sandbox", 1);
        policy.finish(second.token, "worker", "caller:2");
        expect(await policy.resolve(second.token, "caller:1")).toBeDefined();
        policy.finish(second.token, "worker", "caller:1");
        await expect(policy.resolve(second.token, "caller:1")).rejects.toThrow("revoked");
    });
    test("expires leases and prevents nested scope escalation", async () => {
        let now = 10;
        const policy = new DelegationPolicy(
            async () => desktop(),
            () => now
        );
        await expect(policy.prepare({ ...context, delegationScope: "widgets" }, "sandbox", 1)).rejects.toThrow(
            "broaden"
        );
        const grant = await policy.prepare({ ...context, delegationScope: "widgets" }, "inherit", 2);
        const { signal } = await policy.resolve(grant.token, "caller:1");
        expect(grant.scope).toBe("widgets");
        policy.finish(grant.token, "child:1", "caller:1");
        policy.finish(grant.token, "child:1", "caller:1");
        expect(await policy.resolve(grant.token, "caller:1")).toBeDefined();
        expect(signal.aborted).toBe(false);
        now += 16 * 60_000;
        await expect(policy.resolve(grant.token, "caller:1")).rejects.toThrow("expired");
        expect(signal.aborted).toBe(true);
    });

    test("revokes active tools for the stopped runtime without affecting another caller", async () => {
        const policy = new DelegationPolicy(async () => desktop());
        const first = await policy.prepare(context, "widgets", 1);
        const second = await policy.prepare({ ...context, nativeCallerId: "caller:2" }, "widgets", 1);
        const worker = await policy.resolve(first.token, "caller:1");
        const otherWorker = await policy.resolve(second.token, "caller:2");
        policy.revokeCaller("caller:1");
        expect(worker.signal.aborted).toBe(true);
        expect(otherWorker.signal.aborted).toBe(false);
        await expect(policy.resolve(first.token, "caller:1")).rejects.toThrow("revoked");
    });
});

test("Hybrid inherited workers keep one VM controller and invalidate on takeover", async () => {
    const vm = desktop();
    const policy = new DelegationPolicy(async () => vm);
    const hybrid = { ...context, sandboxComputerMode: "hybrid" as const };
    await expect(policy.prepare(hybrid, "inherit", 2)).rejects.toThrow("one sandbox");
    const grant = await policy.prepare(hybrid, "inherit", 1);
    await expect(policy.prepare(context, "sandbox", 1)).rejects.toThrow("already controls");
    vm.controlGeneration++;
    await expect(policy.resolve(grant.token, "caller:1")).rejects.toThrow("control changed");
});


test("cancels one worker immediately and keeps its unfinished calls visible to the drain", async () => {
    const policy = new DelegationPolicy(async () => desktop());
    const grant = await policy.prepare(context, "widgets", 2);
    const first = await policy.resolve(grant.token, "caller:1", "child:1");
    const second = await policy.resolve(grant.token, "caller:1", "child:2");
    let settle: () => void;
    const running = new Promise<void>((resolve) => { settle = resolve; });
    first.track(running);

    expect(policy.cancel(grant.token, "child:1", "caller:2")).toBe(0);
    expect(first.signal.aborted).toBe(false);
    expect(policy.cancel(grant.token, "child:1", "caller:1")).toBe(1);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    await expect(policy.resolve(grant.token, "caller:1", "child:1")).rejects.toThrow(/abort/i);
    policy.finish(grant.token, undefined, "caller:1");
    expect(policy.cancel(grant.token, "child:1", "caller:1")).toBe(1);
    settle();
    await running;
    expect(policy.cancel(grant.token, "child:1", "caller:1")).toBe(0);
});
