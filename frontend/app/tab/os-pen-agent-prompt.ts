// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PenMobileSelection } from "./os-pen-chat-dock-model";

function count(value: unknown, max: number) {
    return typeof value === "number" && Number.isInteger(value) ? Math.max(1, Math.min(value, max)) : 1;
}

export function readPenRunSettings(options: unknown) {
    const run = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
    return {
        agents: count(run.agentCount, 5),
        designs: count(run.designCount, 6),
        parallelMode: run.parallelMode === "side-by-side" ? "side-by-side" : "split",
        iterateMode: run.iterateMode === "style" || run.iterateMode === "creative" ? run.iterateMode : "layout",
    };
}

export function preparePenAgentPrompt(
    prompt: string,
    options: unknown,
    mobile?: PenMobileSelection,
    fullChat = false,
    design = 1,
    voice = false
): string {
    const run = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
    const { agents, designs, parallelMode, iterateMode } = readPenRunSettings(run);
    const skills = Array.isArray(run.skillNames)
        ? run.skillNames
              .filter((name): name is string => typeof name === "string" && /^[\w-]{1,64}$/.test(name))
              .slice(0, 8)
        : [];
    return [
        "You are the main agent. For local coding tasks with a known absolute project directory, call delegate_pi_coding directly with the task, directory and verification command before inspecting or editing files. Review Pi’s result and reply yourself. Look up workspace state only if needed. Handle workspace controls and ordinary conversation yourself.",
        fullChat
            ? "The user is in KronOS full chat. Use workspace_snapshot to identify right-side tabs and workspace_focus_widget to select a tab in the background. Use coding tools normally. Completed file writes and patches prepare background previews. For files created through the terminal, use workspace_open_file with an absolute path. Set reveal=true on workspace_focus_widget or workspace_open_file only if the user explicitly requests that you show the side panel."
            : "The user is chatting from the live Pen canvas in KronOS. For design edits, inspect workspace_design_editor_state and read the execute skill with workspace_design_read_skill before using workspace_design_execute. Verify the edits and save with workspace_design_save. Use coding tools for project files and the existing KronOS workspace tools for live canvas widgets.",
        "For multi-step work, use the todo tool to show the plan and update each item as its status changes.",
        voice && "This is a live voice conversation. Answer greetings and simple questions immediately in short, natural sentences. Use tools when the request requires workspace action or verified information. Keep spoken progress updates brief.",
        agents > 1 &&
            (parallelMode === "side-by-side"
                ? `Build ${agents} independent versions of the same task. Use one inline delegate_task batch with ${agents - 1} workers for independent proposals and develop one yourself. Integrate each proposal as a separate, named deliverable.`
                : `Divide the task among up to ${agents} agents including yourself. Use one inline delegate_task batch with up to ${agents - 1} workers for independent subtasks and integrate their results.`),
        agents > 1 &&
            "Use the active Hermes delegation scope and verify tool availability. Give each worker a distinct goal and success check. Keep edits to shared documents and control of a shared computer with the parent. If delegation is unavailable, report the harness error and continue with the work you can perform.",
        designs > 1 &&
            `This is design pass ${design} of ${designs}. Complete only this pass. ${design === 1
                ? "Establish the first design."
                : `Review the preceding work and create a distinct variation, varying the ${iterateMode}.`} Preserve all earlier deliverables and give the output of this pass a distinct name.`,
        !fullChat && skills.length > 0 &&
            `Selected Pen skills: ${skills.join(", ")}. Discover their available names with workspace_design_read_skill (index) and read the matching bundled skills before use.`,
        mobile &&
            (mobile.targetId
                ? `Active HomeChat mobile widget (device metadata): ${JSON.stringify(mobile)}. For operations on this widget, use only its exact targetId. Read the selected-widget workflow in kronterm-phone-control. Use device_observe, inspect the requested point with device_pick_element, and when asked to tap use device_step with that observation. Compare the before and after images and report the visible change. Respect automationPaused and never substitute another device.`
                : `The active ${mobile.platform} widget has no verified device binding. If asked to operate on it, report that it is unavailable and do not infer a replacement.`),
        `User request:\n${prompt}`,
    ]
        .filter(Boolean)
        .join("\n\n");
}
