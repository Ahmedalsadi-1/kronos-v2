// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { comfyFixedSeeds, comfyPromptNodes, makeComfyVariants } from "./comfy-variants";

const Recipe = {
    "1": { class_type: "CLIPTextEncode", inputs: { text: "negative" } },
    "2": { class_type: "CLIPTextEncode", inputs: { text: "green" } },
    "3": { class_type: "KSampler", inputs: { seed: 42, positive: ["2", 0], negative: ["1", 0], steps: 20 } },
    "4": { class_type: "LoadImage", inputs: { image: "reference.png" } },
};

it("builds independently editable variants while holding the input, seed and graph constant", () => {
    expect(comfyPromptNodes(Recipe).map(({ id }) => id)).toEqual(["2", "1"]);
    const variants = makeComfyVariants(Recipe, "2", ["red", "blue"]);
    expect(variants.map((variant) => variant["2"].inputs.text)).toEqual(["red", "blue"]);
    for (const variant of variants) {
        expect(comfyFixedSeeds(variant)).toEqual([42]);
        expect(variant["1"]).toEqual(Recipe["1"]);
        expect(variant["3"]).toEqual(Recipe["3"]);
        expect(variant["4"]).toEqual(Recipe["4"]);
    }
    expect(Recipe["2"].inputs.text).toBe("green");
    expect(() => makeComfyVariants(Recipe, "3", ["red", "blue"])).toThrow(/CLIP text node/);
    expect(() => makeComfyVariants(Recipe, "2", ["red", ""])).toThrow(/prompts/);
});
