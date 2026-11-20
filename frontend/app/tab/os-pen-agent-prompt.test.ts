import { describe, expect, it } from "vitest";
import { preparePenAgentPrompt, readPenRunSettings } from "./os-pen-agent-prompt";

describe("Pen chat run options", () => {
    it("directs design requests to the live editor without delegating a default run", () => {
        const prompt = preparePenAgentPrompt("Add a frame", {});
        expect(prompt).toContain("workspace_design_execute");
        expect(prompt).toContain("workspace_design_save");
        expect(prompt).not.toContain("delegate_task");
        expect(prompt).toMatch(/User request:\nAdd a frame$/);
    });

    it("directs full-chat turns to the right-side tabs and coding tools", () => {
        const prompt = preparePenAgentPrompt("Create a file", { skillNames: ["execute"] }, undefined, true);
        expect(prompt).toContain("workspace_focus_widget");
        expect(prompt).toContain("workspace_open_file");
        expect(prompt).not.toContain("workspace_design_read_skill");
    });

    it("binds mobile operations to the device selected in HomeChat", () => {
        const prompt = preparePenAgentPrompt(
            "Tap Settings",
            {},
            {
                platform: "android",
                targetId: "android-adb:emulator-5554",
                name: "Pixel",
            }
        );
        expect(prompt).toContain('"targetId":"android-adb:emulator-5554"');
        expect(prompt).toContain("device_observe");
        expect(prompt).toContain("device_pick_element");
        expect(prompt).toContain("device_step");

        const unavailable = preparePenAgentPrompt("Tap Settings", {}, { platform: "iphone" });
        expect(unavailable).toContain("no verified device binding");
        expect(unavailable).not.toContain("device_step");
    });

    it("distinguishes independent versions from divided work and bounds variant counts", () => {
        expect(
            preparePenAgentPrompt("Add a frame", {
                agentCount: 3,
                parallelMode: "side-by-side",
                designCount: 20,
                iterateMode: "layout",
            })
        ).toContain("Build 3 independent versions");
        const options = { agentCount: 2, designCount: 20, iterateMode: "layout" };
        expect(readPenRunSettings({ agentCount: 6 })).toMatchObject({ agents: 5, designs: 1 });
        const divided = preparePenAgentPrompt("Add a frame", options, undefined, false, 2);
        expect(divided).toContain("Divide the task among up to 2 agents");
        expect(divided).toContain("design pass 2 of 6");
        expect(divided).toContain("varying the layout");
        expect(divided).toContain("delegate_task");
    });
});
