import type { LiveAgentSurfaceActivity } from "@/types/agent-activity";
import { describe, expect, it } from "vitest";
import { activityToPlan } from "./agent-plan-model";

const event = (patch: Partial<LiveAgentSurfaceActivity>): LiveAgentSurfaceActivity => ({
    id: "step",
    source: "hermes",
    phase: "queued",
    surface: "file",
    action: "inspect",
    timestamp: 1,
    ...patch,
});

describe("agent plan continuity", () => {
    it("updates the same task in place and preserves nested work", () => {
        const plan = activityToPlan([
            event({ id: "parent", detail: "Inspect files", phase: "running" }),
            event({ parentid: "parent", phase: "running" }),
            event({ phase: "succeeded", parentid: "parent" }),
        ]);
        expect(plan).toHaveLength(1);
        expect(plan[0].children).toHaveLength(1);
        expect(plan[0].children[0].status).toBe("done");
    });
    it("keeps cyclic and orphaned events visible without recursive trees", () => {
        const plan = activityToPlan([
            event({ id: "a", parentid: "b" }),
            event({ id: "b", parentid: "a" }),
            event({ id: "c", parentid: "missing", phase: "failed" }),
        ]);
        expect(plan).toHaveLength(3);
        expect(plan.every((task) => task.children.length === 0)).toBe(true);
        expect(plan[2].status).toBe("failed");
    });
});
