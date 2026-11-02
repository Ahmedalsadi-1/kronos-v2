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
    test("validates readiness and required tools before issuing a lease", async () => {
        const vm = desktop();
        const policy = new DelegationPolicy(async () => vm);
        vm.ready = false;
        await expect(policy.prepare(context, "sandbox", 1, tools, tools)).rejects.toThrow("ready");
        vm.ready = true;
        await expect(policy.prepare(context, "sandbox", 1, ["terminal_execute"], tools)).rejects.toThrow("unavailable");
        await expect(policy.prepare(context, "sandbox", 2, tools, tools)).rejects.toThrow("one sandbox");
        const grant = await policy.prepare(context, "sandbox", 1, tools, tools);
        expect((await policy.resolve(grant.token, "caller:1")).delegationScope).toBe("sandbox");
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
        expect(grant.scope).toBe("widgets");
        policy.finish(grant.token, "child:1", "caller:1");
        policy.finish(grant.token, "child:1", "caller:1");
        expect(await policy.resolve(grant.token, "caller:1")).toBeDefined();
        now += 16 * 60_000;
        await expect(policy.resolve(grant.token, "caller:1")).rejects.toThrow("expired");
    });
});
