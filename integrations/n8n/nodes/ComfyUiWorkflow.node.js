// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const { callTool, objectParameter } = require("./bridge");

class ComfyUiWorkflow {
    description = {
        displayName: "KronOS ComfyUI",
        name: "comfyUiWorkflow",
        group: ["transform"],
        version: 1,
        icon: "fa:image",
        description: "Queue a ComfyUI workflow or check a render from this KronOS workspace",
        defaults: { name: "KronOS ComfyUI" },
        inputs: ["main"],
        outputs: ["main"],
        properties: [
            {
                displayName: "Operation",
                name: "operation",
                type: "options",
                default: "submit",
                options: [
                    { name: "Queue Render", value: "submit" },
                    { name: "Check Render", value: "job" },
                ],
            },
            {
                displayName: "API Workflow",
                name: "workflow",
                type: "json",
                default: "{}",
                required: true,
                displayOptions: { show: { operation: ["submit"] } },
                description: "A workflow saved from ComfyUI in API format",
            },
            {
                displayName: "Prompt ID",
                name: "promptId",
                type: "string",
                default: "={{ $json.promptId }}",
                required: true,
                displayOptions: { show: { operation: ["job"] } },
                description: "The prompt ID returned by Queue Render",
            },
            {
                displayName: "ComfyUI Address",
                name: "origin",
                type: "string",
                default: "",
                placeholder: "http://127.0.0.1:8188",
                description:
                    "Optional loopback address. Check Render reuses the address from the matching input render when blank.",
            },
        ],
    };

    async execute() {
        const items = this.getInputData();
        const output = [];
        for (let index = 0; index < items.length; index++) {
            const operation = this.getNodeParameter("operation", index, "submit");
            const origin = this.getNodeParameter("origin", index, "").trim();
            const args = origin ? { origin } : {};
            let result;
            if (operation === "submit") {
                const workflow = objectParameter(this.getNodeParameter("workflow", index));
                if (!Object.keys(workflow).length) throw new Error("Enter a ComfyUI workflow exported in API format.");
                result = await callTool("comfyui_submit", { ...args, workflow });
            } else if (operation === "job") {
                const id = this.getNodeParameter("promptId", index, "").trim();
                if (!id) throw new Error("Enter the prompt ID returned by Queue Render.");
                args.id = id;
                const input = items[index].json;
                if (!origin && input.promptId === id && typeof input.origin === "string" && input.origin.trim()) {
                    args.origin = input.origin.trim();
                }
                result = await callTool("comfyui_job", args);
            } else {
                throw new Error("Unknown ComfyUI operation.");
            }
            const response = result.content?.find((entry) => entry.type === "text");
            if (!response) throw new Error(result.error || "KronOS did not return a ComfyUI render.");
            const { jobs, origin: renderOrigin } = objectParameter(response.text);
            const [job] = Array.isArray(jobs) ? jobs : [];
            if (jobs?.length !== 1 || typeof job?.id !== "string" || !job.id || (args.id && args.id !== job.id)) {
                throw new Error("KronOS did not return the expected ComfyUI render.");
            }
            output.push({
                json: {
                    promptId: job.id,
                    origin: renderOrigin,
                    status: job.status,
                    images: job.images,
                    ...(job.error ? { error: job.error } : {}),
                },
                pairedItem: { item: index },
            });
        }
        return [output];
    }
}

exports.ComfyUiWorkflow = ComfyUiWorkflow;
