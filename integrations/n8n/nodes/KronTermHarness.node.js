// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const { callTool } = require("./bridge");

class KronTermHarness {
    description = {
        displayName: "KronTerm Harness",
        name: "kronTermHarness",
        group: ["transform"],
        version: 1,
        icon: "fa:terminal",
        description: "Run a bounded task through the KronTerm ACP harness with scoped tools",
        defaults: { name: "KronTerm Harness" },
        inputs: ["main"],
        outputs: ["main"],
        usableAsTool: true,
        properties: [
            { displayName: "Agent Backend", name: "backend", type: "string", default: "hermes", required: true },
            {
                displayName: "Task",
                name: "task",
                type: "string",
                typeOptions: { rows: 5 },
                default: "",
                required: true,
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
        for (let index = 0; index < this.getInputData().length; index++) {
            const timeoutSeconds = this.getNodeParameter("timeoutSeconds", index);
            const backend = this.getNodeParameter("backend", index);
            const result = await callTool(
                backend === "hermes" ? "n8n_run_agent" : "acp_run_agent",
                {
                    backend: this.getNodeParameter("backend", index),
                    task: this.getNodeParameter("task", index),
                    timeoutSeconds,
                },
                (Math.min(600, Math.max(15, Number(timeoutSeconds) || 180)) + 10) * 1000
            );
            output.push({ json: { result }, pairedItem: { item: index } });
        }
        return [output];
    }
}

exports.KronTermHarness = KronTermHarness;
