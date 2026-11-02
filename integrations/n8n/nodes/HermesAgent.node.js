// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

const { callTool, toolOutput } = require("./bridge");

class HermesAgent {
    description = {
        displayName: "Hermes Agent",
        name: "hermesAgent",
        group: ["transform"],
        version: 1,
        icon: "fa:robot",
        description: "Run a scoped Hermes workflow worker with KronTerm tools",
        defaults: { name: "Hermes Agent" },
        inputs: ["main"],
        outputs: ["main"],
        usableAsTool: true,
        properties: [
            {
                displayName: "Task",
                name: "task",
                type: "string",
                typeOptions: { rows: 5 },
                required: true,
                default: "",
            },
            {
                displayName: "Timeout (Seconds)",
                name: "timeoutSeconds",
                type: "number",
                typeOptions: { minValue: 15, maxValue: 600 },
                default: 180,
            },
        ],
    };

    async execute() {
        const output = [];
        const items = this.getInputData();
        for (let index = 0; index < items.length; index++) {
            const timeoutSeconds = this.getNodeParameter("timeoutSeconds", index, 180);
            const result = await callTool(
                "n8n_run_agent",
                {
                    task: this.getNodeParameter("task", index),
                    timeoutSeconds,
                    workflowId: this.getWorkflow().id,
                    executionId: this.getExecutionId(),
                    input: items[index].json,
                },
                (Math.min(600, Math.max(15, timeoutSeconds)) + 10) * 1000
            );
            output.push({ json: { ...toolOutput(result), result }, pairedItem: { item: index } });
        }
        return [output];
    }
}

exports.HermesAgent = HermesAgent;
