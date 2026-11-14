import { describe, expect, it } from "vitest";
import type { LinuxDesktop } from "../frontend/types/linux-desktops";
import { SandboxTaskRuntime } from "./sandbox-task-runtime";

const args = { desktopId: "linux-desktop:primary", assignedAgentId: "demo", expectedGeneration: 1, taskId: "task-1" };
function fixture(status = "stopped") {
    const desktop = {
        id: args.desktopId,
        status,
        controlOwner: "agent",
        assignedAgentId: "demo",
        controlGeneration: 1,
    } as LinuxDesktop;
    const actions: string[] = [];
    const runtime = new SandboxTaskRuntime({
        list: async () => [desktop],
        performAgent: async (action) => {
            actions.push(action.action);
            desktop.status = action.action === "start" ? "running" : "stopped";
            return { desktop };
        },
    });
    return { runtime, desktop, actions };
}

describe("sandbox task lifecycle", () => {
    it("starts only once and closes only its owned start with repeatable cleanup", async () => {
        const { runtime, actions } = fixture();
        const session = await runtime.start(args);
        expect((await runtime.start(args)).sessionId).toBe(session.sessionId);
        await runtime.finish(session.sessionId);
        await runtime.finish(session.sessionId);
        expect(actions).toEqual(["start", "stop"]);
    });
    it("stops the reserved desktop when its task ends", async () => {
        const { runtime, actions } = fixture("running");
        const session = await runtime.start(args);
        await runtime.finish(session.sessionId);
        expect(actions).toEqual(["stop"]);
    });
    it("refuses to stop after human takeover or generation changes", async () => {
        const { runtime, desktop, actions } = fixture();
        const session = await runtime.start(args);
        desktop.controlOwner = "user";
        desktop.controlGeneration++;
        expect(await runtime.finish(session.sessionId)).toMatchObject({
            finished: true,
            stopped: false,
            preserved: true,
        });
        desktop.controlOwner = "agent";
        await expect(
            runtime.start({ ...args, expectedGeneration: desktop.controlGeneration, taskId: "fresh" })
        ).resolves.toHaveProperty("sessionId");
        expect(actions).toEqual(["start"]);
    });
    it("rejects stale launches, unknown sessions and overlapping tasks", async () => {
        const { runtime, actions } = fixture();
        await expect(runtime.start({ ...args, expectedGeneration: 0 })).rejects.toThrow("control changed");
        await expect(runtime.finish("unknown")).rejects.toThrow("Unknown");
        await runtime.start(args);
        await expect(runtime.start({ ...args, taskId: "another" })).rejects.toThrow("active task");
        expect(actions).toEqual(["start"]);
    });
    it("accepts a new grant when the previous caller lost ownership without finishing", async () => {
        const { runtime, desktop, actions } = fixture("running");
        const stale = await runtime.start(args);
        desktop.assignedAgentId = "replacement";
        desktop.controlGeneration++;
        const fresh = await runtime.start({
            ...args,
            assignedAgentId: desktop.assignedAgentId,
            expectedGeneration: desktop.controlGeneration,
            taskId: "fresh",
        });
        expect(fresh.sessionId).not.toBe(stale.sessionId);
        await expect(runtime.finish(stale.sessionId)).resolves.toMatchObject({ finished: true, preserved: true });
        expect(actions).toEqual([]);
        await expect(runtime.finish(fresh.sessionId)).resolves.toMatchObject({ stopped: true });
        expect(actions).toEqual(["stop"]);
    });
    it("returns a cleanup session when startup partly succeeds then fails", async () => {
        const desktop = {
            id: args.desktopId,
            status: "stopped",
            controlOwner: "agent",
            assignedAgentId: "demo",
            controlGeneration: 1,
        } as LinuxDesktop;
        const actions: string[] = [];
        const runtime = new SandboxTaskRuntime({
            list: async () => [desktop],
            performAgent: async (action) => {
                actions.push(action.action);
                if (action.action === "start") {
                    desktop.status = "running";
                    throw new Error("Health check timed out");
                }
                desktop.status = "stopped";
                return { desktop };
            },
        });
        let message = "";
        try {
            await runtime.start(args);
        } catch (error) {
            message = (error as Error).message;
        }
        const sessionId = /sessionId=([a-f0-9-]+)/.exec(message)?.[1];
        expect(sessionId).toBeTruthy();
        await runtime.finish(sessionId);
        expect(actions).toEqual(["start", "stop"]);
    });
});
