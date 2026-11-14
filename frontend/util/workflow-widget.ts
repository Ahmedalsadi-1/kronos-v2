// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

export type WorkflowWidget = { blockId: string; label: string; view: string };
export type WorkflowWidgetConfiguration = {
    operation: string;
    urls?: string;
    text?: string;
    keys?: string;
    computerId?: string;
};
export function workflowWidgetParameters(view: string, config?: WorkflowWidgetConfiguration) {
    const operation = config?.operation ?? "widget_get_state";
    const common = ["widget_get_state", "widget_snapshot", "widget_type", "widget_press"];
    const sandbox = ["sandbox_exec", "sandbox_open_links", "sandbox_run_task"];
    if (
        !common.includes(operation) &&
        !(view === "web" && operation === "browser_open_links") &&
        !(view === "sandbox" && sandbox.includes(operation))
    )
        throw new Error("Choose an action supported by this widget.");
    if (view === "sandbox" && ["widget_type", "widget_press"].includes(operation))
        throw new Error("Use sandbox actions to control the VM.");
    const parameters: Record<string, string> = { operation, arguments: "{}" };
    if (["browser_open_links", "sandbox_open_links"].includes(operation)) {
        const urls = String(config.urls || "")
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (!urls.length || urls.length > 20) throw new Error("Enter between 1 and 20 links, one per line.");
        for (const value of urls) {
            let url: URL;
            try {
                url = new URL(value);
            } catch {
                throw new Error("Each link must be a complete HTTP or HTTPS URL.");
            }
            if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || value.length > 2048)
                throw new Error("Use HTTP or HTTPS links without embedded login details.");
        }
        parameters.urls = urls.join("\n");
    }
    if (["widget_type", "sandbox_exec", "sandbox_run_task"].includes(operation)) {
        if (typeof config.text !== "string" || !config.text.trim() || config.text.length > 20000)
            throw new Error("Enter text between 1 and 20000 characters.");
        if (operation === "sandbox_exec" && config.text.length > 4096)
            throw new Error("VM commands must be at most 4096 characters.");
        parameters.text = config.text;
        if (operation === "widget_type") parameters.arguments = JSON.stringify({ text: config.text });
    }
    if (operation === "widget_press") {
        const keys = String(config.keys || "")
            .split("+")
            .map((key) => key.trim())
            .filter(Boolean);
        if (!keys.length || keys.length > 8 || keys.some((key) => key.length > 40))
            throw new Error("Enter keys such as Enter or Control+c.");
        parameters.arguments = JSON.stringify({ keys });
    }
    if (sandbox.includes(operation)) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(config.computerId || ""))
            throw new Error("Choose a sandbox VM.");
        parameters.computerId = config.computerId;
    }
    return parameters;
}
