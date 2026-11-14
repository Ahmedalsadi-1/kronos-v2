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
                    { name: "Open Browser Links", value: "browser_open_links" },
                    { name: "Run Command in VM", value: "sandbox_exec" },
                    { name: "Open URLs in VM", value: "sandbox_open_links" },
                    { name: "Run AI Task in VM", value: "sandbox_run_task" },
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
                            "browser_open_links",
                            "sandbox_exec",
                            "sandbox_open_links",
                            "sandbox_run_task",
                            "widget_get_state",
                            "widget_snapshot",
                            "widget_click",
                            "widget_type",
                            "widget_press",
                        ],
                    },
                },
            },
            {
                displayName: "Links (One per Line)",
                name: "urls",
                type: "string",
                typeOptions: { rows: 4 },
                default: "",
                displayOptions: { show: { operation: ["browser_open_links", "sandbox_open_links"] } },
            },
            {
                displayName: "Command or AI Task",
                name: "text",
                type: "string",
                typeOptions: { rows: 4 },
                default: "",
                displayOptions: { show: { operation: ["sandbox_exec", "sandbox_run_task"] } },
            },
            {
                displayName: "Sandbox VM ID",
                name: "computerId",
                type: "string",
                default: "",
                displayOptions: { show: { operation: ["sandbox_exec", "sandbox_open_links", "sandbox_run_task"] } },
            },
            {
                displayName: "Sandbox Reservation",
                name: "assignedAgentId",
                type: "string",
                default: "",
                displayOptions: { show: { operation: ["sandbox_exec", "sandbox_open_links", "sandbox_run_task"] } },
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
            let result;
            if (["browser_open_links", "sandbox_open_links"].includes(operation)) {
                const urls = String(this.getNodeParameter("urls", index, ""))
                    .split(/\r?\n/)
                    .map((url) => url.trim())
                    .filter(Boolean);
                if (!urls.length || urls.length > 20) throw new Error("Provide 1 to 20 HTTP or HTTPS links.");
                for (const value of urls) {
                    const url = new URL(value);
                    if (
                        !["http:", "https:"].includes(url.protocol) ||
                        url.username ||
                        url.password ||
                        value.length > 2048
                    )
                        throw new Error("Use HTTP or HTTPS links without embedded login details.");
                }
                if (operation === "browser_open_links") {
                    if (!blockId) throw new Error("Choose an existing browser widget.");
                    const results = [];
                    for (let i = 0; i < urls.length; i++)
                        results.push(
                            await callTool(
                                i === 0 ? "browser_navigate" : "browser_open",
                                i === 0 ? { blockId, url: urls[i] } : { url: urls[i], newSurface: true }
                            )
                        );
                    result = { content: [{ type: "text", text: JSON.stringify({ blockId, urls, results }) }] };
                } else {
                    const target = await assignedSandbox(this, index);
                    for (const url of urls) result = await callTool("linux_desktop_open_url", { ...target, url });
                }
            } else if (["sandbox_exec", "sandbox_run_task"].includes(operation)) {
                const target = await assignedSandbox(this, index);
                const text = this.getNodeParameter("text", index, "");
                if (typeof text !== "string" || !text.trim() || text.length > 20000)
                    throw new Error("Provide a command or task of 1 to 20000 characters.");
                if (operation === "sandbox_exec" && text.length > 4096)
                    throw new Error("VM commands must be at most 4096 characters.");
                result =
                    operation === "sandbox_exec"
                        ? await callTool("linux_desktop_exec", { ...target, command: text })
                        : await callTool("n8n_run_agent", {
                              task: text,
                              computerId: target.desktopId,
                              computerGeneration: target.expectedGeneration,
                              workflowId: this.getWorkflow().id,
                              executionId: this.getExecutionId(),
                              input: this.getInputData()[index].json,
                              timeoutSeconds: 180,
                          });
            } else result = await callTool(operation, args);
            output.push({ json: { ...toolOutput(result), result }, pairedItem: { item: index } });
        }
        return [output];
    }
}

async function assignedSandbox(node, index) {
    const desktopId = node.getNodeParameter("computerId", index, "");
    const assignedAgentId = node.getNodeParameter("assignedAgentId", index, "");
    if (!desktopId || !assignedAgentId) throw new Error("Choose a sandbox VM with an assigned reservation.");
    const result = await callTool("linux_desktop_list", {});
    const value = JSON.parse(
        result.content
            .filter((entry) => entry.type === "text")
            .map((entry) => entry.text)
            .join("\n")
    );
    const desktops = Array.isArray(value) ? value : value.desktops;
    const desktop = desktops?.find((entry) => entry.id === desktopId);
    if (
        !desktop?.ready ||
        desktop.controlOwner !== "agent" ||
        desktop.assignedAgentId !== assignedAgentId ||
        !Number.isSafeInteger(desktop.controlGeneration)
    )
        throw new Error(
            "The selected VM is not ready or its control grant changed. Enable Computer control for this workspace."
        );
    return { desktopId, assignedAgentId, expectedGeneration: desktop.controlGeneration };
}
exports.KronTermWidget = KronTermWidget;
