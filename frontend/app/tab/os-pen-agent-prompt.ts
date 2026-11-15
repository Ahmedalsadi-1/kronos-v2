// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

function count(value: unknown, max: number) {
    return typeof value === "number" && Number.isInteger(value) ? Math.max(1, Math.min(value, max)) : 1;
}

export function preparePenAgentPrompt(prompt: string, options: unknown): string {
    const run = (options && typeof options === "object" ? options : {}) as Record<string, unknown>;
    const agents = count(run.agentCount, 6);
    const variants = count(run.designCount, 6);
    const axis = run.iterateMode === "layout" || run.iterateMode === "creative" ? run.iterateMode : "style";
    const skills = Array.isArray(run.skillNames)
        ? run.skillNames
              .filter((name): name is string => typeof name === "string" && /^[\w-]{1,64}$/.test(name))
              .slice(0, 8)
        : [];
    return [
        "The user is chatting from the live Pen canvas in KronOS. For design edits, inspect workspace_design_editor_state and read the execute skill with workspace_design_read_skill before using workspace_design_execute. Verify the edits and save with workspace_design_save. For workspace actions use the existing KronOS tools with their normal scope and approval requirements.",
        agents > 1 &&
            (run.parallelMode === "side-by-side"
                ? `Run option: build ${agents} independent versions of the same task. Take one version yourself and use delegate_task for the other independent explorations. Create separately named root frames for the alternatives. Coordinate edits in the parent; do not have multiple workers edit the same document concurrently.`
                : `Run option: divide the task among up to ${agents} agents including yourself. Use delegate_task for independent subtasks, gather their results, and integrate the edits yourself. Do not have multiple workers edit the same document concurrently.`),
        variants > 1 &&
            `Run option: explore ${variants} versions sequentially, varying the ${axis}. Create each version in its own named frame and keep earlier frames intact.`,
        skills.length > 0 &&
            `Selected Pen skills: ${skills.join(", ")}. Discover their available names with workspace_design_read_skill (index) and read the matching bundled skills before use.`,
        `User request:\n${prompt}`,
    ]
        .filter(Boolean)
        .join("\n\n");
}
