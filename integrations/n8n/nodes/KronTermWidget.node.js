// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const { callTool, objectParameter, toolOutput } = require("./bridge");

class KronTermWidget {
    description = {
        displayName: "KronTerm Widget",
        name: "kronTermWidget",
        group: ["transform"],
        version: 1,
        icon: "icon:monitor",
        description: "Inspect, create, or control workspace widgets through KronTerm tools",
        defaults: { name: "KronTerm Widget" },
        inputs: ["main"],
        outputs: ["main"],
        usableAsTool: true,
        properties: [
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                default: "list_blocks",
                options: [
                    { name: "List Widgets", value: "list_widgets" },
                    { name: "List Blocks", value: "list_blocks" },
                    { name: "Launch Widget", value: "trigger_widget" },
                    { name: "Get State", value: "widget_get_state" },
                    { name: "Snapshot", value: "widget_snapshot" },
                    { name: "Click", value: "widget_click" },
                    { name: "Type", value: "widget_type" },
                    { name: "Press Key", value: "widget_press" },
                ],
            },
            {
                displayName: "Workspace Widget ID",
                name: "blockId",
                type: "string",
                default: "",
                description:
                    "The existing KronTerm widget this node controls. Choose a widget from the workspace node picker.",
                displayOptions: {
                    show: {
                        operation: [
                            "widget_get_state",
                            "widget_snapshot",
                            "widget_click",
                            "widget_type",
                            "widget_press",
                        ],
                    },
                },
            },
            { displayName: "Arguments", name: "arguments", type: "json", default: "{}", required: true },
        ],
    };

    async execute() {
        const output = [];
        for (let index = 0; index < this.getInputData().length; index++) {
            const operation = this.getNodeParameter("operation", index);
            const args = objectParameter(this.getNodeParameter("arguments", index));
            const blockId = this.getNodeParameter("blockId", index, "");
            if (operation.startsWith("widget_") && blockId) {
                if (typeof blockId !== "string" || !blockId.trim())
                    throw new Error("Workspace Widget ID must be a string.");
                args.blockId = blockId.trim();
            }
            const result = await callTool(operation, args);
            output.push({ json: { ...toolOutput(result), result }, pairedItem: { item: index } });
        }
        return [output];
    }
}

exports.KronTermWidget = KronTermWidget;
