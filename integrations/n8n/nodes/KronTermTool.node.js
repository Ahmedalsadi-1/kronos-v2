// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const { callTool, listTools, objectParameter } = require("./bridge");

class KronTermTool {
    description = {
        displayName: "KronTerm Tool",
        name: "kronTermTool",
        group: ["transform"],
        version: 1,
        icon: "fa:wrench",
        description: "Call a tool attached to the originating KronTerm workspace",
        defaults: { name: "KronTerm Tool" },
        inputs: ["main"],
        outputs: ["main"],
        usableAsTool: true,
        properties: [
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                default: "call",
                options: [
                    { name: "Call Tool", value: "call" },
                    { name: "Discover Tools", value: "list" },
                ],
            },
            { displayName: "Tool Name", name: "tool", type: "string", default: "list_blocks", required: true },
            { displayName: "Arguments", name: "arguments", type: "json", default: "{}", required: true },
        ],
    };

    async execute() {
        const output = [];
        for (let index = 0; index < this.getInputData().length; index++) {
            const result =
                this.getNodeParameter("operation", index, "call") === "list"
                    ? await listTools()
                    : await callTool(
                          this.getNodeParameter("tool", index),
                          objectParameter(this.getNodeParameter("arguments", index))
                      );
            output.push({ json: { result }, pairedItem: { item: index } });
        }
        return [output];
    }
}

exports.KronTermTool = KronTermTool;
