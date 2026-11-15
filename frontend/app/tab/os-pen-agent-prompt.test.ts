import { describe, expect, it } from "vitest";
import { preparePenAgentPrompt } from "./os-pen-agent-prompt";

describe("Pen chat run options", () => {
    it("directs design requests to the live editor without delegating a default run", () => {
        const prompt = preparePenAgentPrompt("Add a frame", {});
        expect(prompt).toContain("workspace_design_execute");
        expect(prompt).toContain("workspace_design_save");
        expect(prompt).not.toContain("delegate_task");
        expect(prompt).toMatch(/User request:\nAdd a frame$/);
    });

    it("distinguishes independent versions from divided work and bounds variant counts", () => {
        expect(
            preparePenAgentPrompt("Add a frame", {
                agentCount: 3,
                parallelMode: "side-by-side",
                designCount: 20,
                iterateMode: "layout",
            })
        ).toContain("build 3 independent versions");
        const divided = preparePenAgentPrompt("Add a frame", { agentCount: 2, designCount: 20, iterateMode: "layout" });
        expect(divided).toContain("divide the task among up to 2 agents");
        expect(divided).toContain("explore 6 versions sequentially, varying the layout");
        expect(divided).toContain("delegate_task");
    });
});
