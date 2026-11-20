// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ComfyWorkflow } from "./comfyui";

export function comfyPromptNodes(workflow: ComfyWorkflow) {
    const inputs = Object.values(workflow).flatMap((node) =>
        Object.entries(node.inputs)
            .filter(([key]) => key === "positive" || key.startsWith("positive_"))
            .map(([, value]) => value)
    );
    const positive = new Set(
        inputs.flatMap((value) => (Array.isArray(value) && typeof value[0] === "string" ? [value[0]] : []))
    );
    return Object.entries(workflow)
        .filter(([, node]) => node.class_type === "CLIPTextEncode" && typeof node.inputs.text === "string")
        .map(([id, node]) => ({ id, text: node.inputs.text as string, positive: positive.has(id) }))
        .sort((left, right) => Number(right.positive) - Number(left.positive));
}

export function comfyFixedSeeds(workflow: ComfyWorkflow) {
    return Object.values(workflow).flatMap((node) =>
        Object.entries(node.inputs)
            .filter(
                ([key, value]) =>
                    (key === "seed" || key === "noise_seed") && Number.isSafeInteger(value) && Number(value) >= 0
            )
            .map(([, value]) => value as number)
    );
}

export function makeComfyVariants(workflow: ComfyWorkflow, nodeId: string, prompts: string[]) {
    if (!comfyPromptNodes(workflow).some((node) => node.id === nodeId))
        throw new Error("Choose a CLIP text node from the source render.");
    if (!comfyFixedSeeds(workflow).length) throw new Error("The source recipe does not expose a fixed numeric seed.");
    if (prompts.length < 2 || prompts.length > 4 || prompts.some((prompt) => !prompt.trim() || prompt.length > 8000))
        throw new Error("Enter between two and four prompts, up to 8,000 characters each.");
    return prompts.map((text) => {
        const variant = structuredClone(workflow);
        variant[nodeId].inputs.text = text;
        return variant;
    });
}
