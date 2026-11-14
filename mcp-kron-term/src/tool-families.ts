export const KronTermToolFamilies = {
    workspace: {
        label: "Workspace & OS",
        description: "Discover owners and operate canonical blocks, layouts and typed OS actions.",
    },
    hud: { label: "HUD islands", description: "Manage HUD presentation and live widget islands." },
    widget: {
        label: "Widget interaction",
        description: "Observe content, resolve current references, interact and verify outcomes.",
    },
    browser: { label: "Browser", description: "Open, reuse, configure and navigate in-app browser surfaces." },
    terminal: {
        label: "Terminal",
        description: "Open terminals, send input, execute commands and inspect scrollback.",
    },
    sandbox: {
        label: "Linux VM & devices (Labs)",
        description:
            "Discover supported hosts and devices; require assignment, readiness and current generations before input.",
    },
    desktop: {
        label: "Native apps",
        description: "Resolve exact applications and observe before using host-supported native input.",
    },
    file: { label: "Files", description: "Read, inspect and open scoped files and directories." },
    canvas: { label: "Canvas", description: "Inspect, edit and launch canvas nodes and assets; verify changes." },
    lsp: {
        label: "Code intelligence",
        description:
            "Query diagnostics, symbols, hover, definitions and references when a language server is available.",
    },
    memory: {
        label: "Memory & sessions",
        description: "Manage scoped memories, conversations, sessions and action items.",
    },
    skills: {
        label: "Shared skills",
        description: "Discover compact metadata, then read the exact allowlisted skill ID.",
    },
    agents: {
        label: "Agents & delegation",
        description:
            "Discover enabled specialists, swarms and scoped delegation. Harness delegation is available only when supplied by the current runtime.",
    },
    workflow: {
        label: "Workflows",
        description:
            "Build n8n workflows, render ComfyUI workflows and inspect their executions.",
    },
    productivity: {
        label: "Productivity",
        description: "Query and update available productivity integrations within existing grants.",
    },
    discovery: {
        label: "Tool discovery",
        description: "Search authorized tool schemas and inspect diagnostics; discovery grants no authority.",
    },
} as const;

export type KronTermToolFamilyId = keyof typeof KronTermToolFamilies;

export function kronTermToolFamily(name: string): KronTermToolFamilyId | null {
    if (name.startsWith("workspace_canvas_") || name.startsWith("canvas_")) return "canvas";
    if (name === "block_run_command" || name.startsWith("terminal_")) return "terminal";
    if (/^(linux_desktop_|sandbox_task_|sandbox_vm_|device_)/.test(name)) return "sandbox";
    if (name.startsWith("kron_computer_")) return "desktop";
    if (name.startsWith("shared_skill_")) return "skills";
    if (name.startsWith("acp_") || name.startsWith("swarm_") || name === "delegation_status") return "agents";
    if (name.startsWith("lsp_")) return "lsp";
    if (name.startsWith("hud_")) return "hud";
    if (name.startsWith("browser_")) return "browser";
    if (name.startsWith("file_")) return "file";
    if (name.startsWith("widget_") || ["trigger_widget", "list_widgets", "get_block_content"].includes(name))
        return "widget";
    if (/^(workflow_|n8n_|comfyui_)/.test(name)) return "workflow";
    if (name.startsWith("productivity_")) return "productivity";
    if (name.startsWith("tool_") || name === "app_workflow") return "discovery";
    if (
        /^(developer_|get_memor|search_memor|create_memory$|edit_memory$|delete_memory$|promote_memory$|.*workspace_session|.*conversation|.*action_item|ingest_workspace_event$)/.test(
            name
        )
    )
        return "memory";
    if (
        /^(workspace_|tab_|connection_|secret_|block_)/.test(name) ||
        [
            "surface_status",
            "get_workspace_info",
            "list_blocks",
            "get_block_info",
            "get_layout_tree",
            "create_block",
            "close_block",
            "focus_block",
            "set_block_meta",
            "set_config",
            "notify",
            "ai_append",
        ].includes(name)
    )
        return "workspace";
    return null;
}

export function groupKronTermTools(names: readonly string[]) {
    const groups = Object.fromEntries(Object.keys(KronTermToolFamilies).map((id) => [id, [] as string[]])) as Record<
        KronTermToolFamilyId,
        string[]
    >;
    for (const name of new Set(names)) {
        const family = kronTermToolFamily(name);
        if (family) groups[family].push(name);
    }
    for (const names of Object.values(groups)) names.sort();
    return groups;
}
