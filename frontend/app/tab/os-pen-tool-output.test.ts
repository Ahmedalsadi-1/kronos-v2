// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { expect, it } from "vitest";
import { penToolOutput } from "./os-pen-tool-output";

const Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const Image = { type: "image", data: Png, mimeType: "image/png" };

it.each([
    Png,
    `data:image/png;base64,${Png}\n`,
    { output: Png },
    { content: [{ type: "text", text: `data:image/png;base64,${Png}` }] },
])("turns a screenshot returned as text into a Pen image", (result) => {
    const output = penToolOutput(result);
    expect(output).toContainEqual(Image);
    expect(JSON.stringify(output).split(Png)).toHaveLength(2);
});

it("keeps text around an embedded screenshot and leaves ordinary code readable", () => {
    expect(penToolOutput(`Captured the window.\n\n![Screenshot](data:image/png;base64,${Png})`)).toEqual([
        { type: "text", text: "Captured the window." },
        Image,
    ]);
    expect(penToolOutput("console.log('hello')")).toBe("console.log('hello')");
});
