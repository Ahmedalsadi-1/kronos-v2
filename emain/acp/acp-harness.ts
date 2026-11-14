// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "crypto";
import path from "path";
import { groupKronTermTools, KronTermToolFamilies } from "../../mcp-kron-term/src/tool-families";
import type { AcpAgentCapabilities } from "./acp-types";

export type AcpHarnessTaskClass =
    "architecture" | "automation" | "coding" | "debugging" | "research" | "review" | "workspace-control";

export type AcpHarnessPattern = {
    id: string;
    label: string;
    description: string;
};

export type AcpHarnessProfile = {
    backend: string;
    summary: string;
    specialties: AcpHarnessTaskClass[];
    patterns: AcpHarnessPattern[];
    source: "builtin" | "reference";
};

export type KronTermToolsetId =
    | "workspace"
    | "hud"
    | "widget"
    | "browser"
    | "terminal"
    | "sandbox"
    | "desktop"
    | "file"
    | "canvas"
    | "lsp"
    | "memory"
    | "skills"
    | "agents";

export type KronTermToolset = {
    id: KronTermToolsetId;
    label: string;
    description: string;
    tools: string[];
};

export type AcpCapabilityLease = {
    id: string;
    backend: string;
    issuedAt: number;
    expiresAt: number;
    taskClass: AcpHarnessTaskClass;
    reason: string;
    workspace: string;
    toolsets: KronTermToolsetId[];
    capabilities: string[];
    constraints: {
        filesystem: "workspace";
        writes: "approval-required";
        destructiveActions: "approval-required";
        externalSideEffects: "approval-required";
        credentialAccess: "brokered-only";
        surface: "none" | "tab";
    };
    protocol: {
        loadSession: boolean;
        embeddedContext: boolean;
        mcp: Array<"http" | "sse" | "stdio">;
        session: Array<"close" | "fork" | "list" | "resume">;
    };
};

const CommonPatterns: AcpHarnessPattern[] = [
    {
        id: "scoped-tools",
        label: "Scoped tools",
        description: "Expose only the capabilities needed for the current task and workspace.",
    },
    {
        id: "durable-session",
        label: "Durable session",
        description: "Keep task state resumable and report lifecycle changes to KronOS.",
    },
];

export const KronTermToolsets: Record<KronTermToolsetId, KronTermToolset> = {
    workspace: {
        id: "workspace",
        label: "Workspace & block layout",
        description:
            "Inspect and rearrange the KronOS workspace: tabs, blocks, layout, badges, notifications, connections, secrets.",
        tools: [
            "surface_status",
            "workspace_inventory",
            "workspace_snapshot",
            "workspace_screenshot",
            "workspace_set_presentation",
            "workspace_focus_widget",
            "workspace_move_widget",
            "workspace_resize_widget",
            "workspace_swap_widgets",
            "workspace_toggle_magnify",
            "workspace_navigate",
            "workspace_canvas_view",
            "workspace_canvas_add_note",
            "workspace_canvas_update_object",
            "workspace_canvas_delete_object",
            "workspace_canvas_connect",
            "get_workspace_info",
            "list_blocks",
            "get_block_info",
            "get_layout_tree",
            "create_block",
            "close_block",
            "focus_block",
            "set_block_meta",
            "tab_set_badge",
            "tab_clear_badge",
            "notify",
            "connection_list",
            "connection_connect",
            "connection_disconnect",
            "secret_list",
            "secret_get",
            "secret_set",
            "secret_delete",
            "ai_append",
        ],
    },
    hud: {
        id: "hud",
        label: "Native HUD islands",
        description: "Inspect, open, focus, move, resize, arrange, and close live native HUD widget islands.",
        tools: [
            "hud_list_islands",
            "hud_open_island",
            "hud_focus_island",
            "hud_move_island",
            "hud_resize_island",
            "hud_arrange_islands",
            "hud_close_island",
        ],
    },
    widget: {
        id: "widget",
        label: "Block content interaction",
        description:
            "Inspect and interact with content inside a KronOS block (snapshot, refs, click, type, press, scroll, drag, values).",
        tools: [
            "widget_snapshot",
            "widget_find",
            "widget_inspect",
            "widget_element_at",
            "widget_screenshot",
            "widget_screenshot_annotated",
            "widget_click",
            "widget_hover",
            "widget_mouse_move",
            "widget_type",
            "widget_press",
            "widget_sequence",
            "widget_scroll_to",
            "widget_drag",
            "widget_long_press",
            "widget_get_value",
            "widget_set_value",
            "widget_clear",
            "widget_select",
        ],
    },
    browser: {
        id: "browser",
        label: "In-app browser",
        description: "Reuse, tab, navigate, and read the KronOS browser surface.",
        tools: ["browser_open", "browser_open_tab", "browser_navigate", "browser_get_html", "browser_configure"],
    },
    terminal: {
        id: "terminal",
        label: "Terminals & command execution",
        description: "Open terminals, read scrollback, and run one-shot commands in new blocks.",
        tools: ["terminal_open", "terminal_scrollback", "block_run_command"],
    },
    sandbox: {
        id: "sandbox",
        label: "Isolated Linux sandbox desktop",
        description:
            "Start/stop the managed Linux desktop after user assignment and control it with generation-fenced screenshot, input, and guest command tools.",
        tools: [
            "sandbox_task_start",
            "sandbox_task_finish",
            "device_list",
            "device_assign",
            "device_release",
            "device_assignments",
            "device_identity",
            "device_batch_boot",
            "device_batch_start",
            "device_batch_status",
            "device_batch_cancel",
            "device_observe",
            "device_step",
            "device_boot",
            "device_shutdown",
            "device_open",
            "device_screenshot",
            "device_tap",
            "device_type",
            "device_back",
            "device_home",
            "device_swipe",
            "device_rotate",
            "linux_desktop_list",
            "linux_desktop_start",
            "linux_desktop_stop",
            "linux_desktop_screenshot",
            "linux_desktop_click",
            "linux_desktop_type",
            "linux_desktop_key",
            "linux_desktop_scroll",
            "linux_desktop_exec",
            "linux_desktop_apps",
            "linux_desktop_launch_app",
        ],
    },
    desktop: {
        id: "desktop",
        label: "Native macOS desktop apps",
        description:
            "Control native desktop applications via the kron-computer-use accessibility runtime. Only for apps outside KronOS.",
        tools: [
            "kron_computer_status",
            "kron_computer_background_workspace_start",
            "kron_computer_background_workspace_list",
            "kron_computer_background_workspace_launch",
            "kron_computer_background_workspace_open_file",
            "kron_computer_background_workspace_observe",
            "kron_computer_background_workspace_action",
            "kron_computer_background_workspace_reveal",
            "kron_computer_background_workspace_resume",
            "kron_computer_background_workspace_finish",
            "kron_computer_list_apps",
            "kron_computer_get_app_state",
            "kron_computer_click",
            "kron_computer_type_text",
            "kron_computer_press_key",
            "kron_computer_scroll",
            "kron_computer_drag",
            "kron_computer_set_value",
            "kron_computer_secondary_action",
            "kron_computer_turn_ended",
        ],
    },
    file: {
        id: "file",
        label: "Files & directories",
        description: "Open, list, read, and inspect files and directories through KronOS file access.",
        tools: ["file_open", "file_list", "file_read", "file_info"],
    },
    canvas: {
        id: "canvas",
        ...KronTermToolFamilies.canvas,
        tools: [
            "canvas_load",
            "canvas_snapshot",
            "canvas_create_node",
            "canvas_save",
            "canvas_update_node",
            "canvas_delete_node",
            "canvas_connect_nodes",
            "canvas_launch_node",
            "canvas_upload_asset",
        ],
    },
    lsp: {
        id: "lsp",
        ...KronTermToolFamilies.lsp,
        tools: ["lsp_diagnostics", "lsp_symbols", "lsp_hover", "lsp_definition", "lsp_references"],
    },
    memory: {
        id: "memory",
        label: "Developer memory & workspace sessions",
        description: "Persistent agent memory, workspace sessions, and action items.",
        tools: [
            "get_memories",
            "search_memories",
            "create_memory",
            "edit_memory",
            "delete_memory",
            "promote_memory",
            "get_workspace_sessions",
            "create_workspace_session",
            "append_workspace_session_event",
            "complete_workspace_session",
            "get_action_items",
            "create_action_item",
            "ingest_workspace_event",
        ],
    },
    skills: {
        id: "skills",
        label: "Shared project skills",
        description: "Discover and load allowlisted project skills shared with KronOS ACP agents.",
        tools: ["shared_skill_list", "shared_skill_read"],
    },
    agents: {
        id: "agents",
        label: "ACP specialists",
        description:
            "Discover installed ACP specialists and run one bounded task with the active tab's scoped KronOS tools.",
        tools: ["acp_list_agents", "acp_run_agent"],
    },
};

const TaskClassToolsets: Record<AcpHarnessTaskClass, KronTermToolsetId[]> = {
    "workspace-control": ["workspace", "hud", "widget", "sandbox", "desktop"],
    automation: ["sandbox", "desktop", "widget", "terminal"],
    coding: ["file", "terminal", "lsp", "widget", "workspace"],
    debugging: ["terminal", "widget", "file", "workspace"],
    research: ["browser", "file", "workspace"],
    review: ["file", "widget", "workspace"],
    architecture: ["file", "workspace", "widget"],
};

const Profiles: Record<string, Omit<AcpHarnessProfile, "backend">> = {
    kronoscode: {
        summary: "Native KronOS orchestrator for coding, workspace surfaces, and specialist delegation.",
        specialties: ["coding", "debugging", "workspace-control", "automation"],
        patterns: [
            ...CommonPatterns,
            {
                id: "workspace-native",
                label: "Workspace-native execution",
                description: "Use KronOS blocks, browser, terminal, files, sandbox, and live surface evidence.",
            },
            {
                id: "capability-router",
                label: "Capability routing",
                description: "Route by task fit and live connector health while KronosCode remains in control.",
            },
        ],
        source: "builtin",
    },
    hermes: {
        summary: "Persistent multi-provider specialist with strong tools, skills, memory, and automation patterns.",
        specialties: ["automation", "research", "coding"],
        patterns: [
            ...CommonPatterns,
            {
                id: "prompt-tiers",
                label: "Prompt tiers",
                description: "Separate stable, contextual, and volatile prompt material for cache-friendly runs.",
            },
            {
                id: "progressive-skills",
                label: "Progressive skills",
                description: "Discover compact skill metadata first and load full instructions only when needed.",
            },
            {
                id: "toolsets",
                label: "Toolsets",
                description: "Group tools into task-specific sets instead of advertising a flat catalog.",
            },
        ],
        source: "reference",
    },
    codex: {
        summary: "Tool-efficient coding specialist for implementation, repository investigation, and verification.",
        specialties: ["coding", "debugging", "review"],
        patterns: [
            ...CommonPatterns,
            {
                id: "lean-context",
                label: "Lean context",
                description: "Keep prompts and visible tools small, explicit, and stable across turns.",
            },
            {
                id: "bounded-workflows",
                label: "Bounded workflows",
                description:
                    "Use deterministic tool-heavy stages when every intermediate result needs no model decision.",
            },
            {
                id: "measured-parallelism",
                label: "Measured parallelism",
                description: "Parallelize independent work and validate quality, latency, token, and retry changes.",
            },
        ],
        source: "reference",
    },
    claude: {
        summary: "Large-context reasoning specialist for architecture, debugging, review, and isolated subagent work.",
        specialties: ["architecture", "debugging", "review", "coding"],
        patterns: [
            ...CommonPatterns,
            {
                id: "lifecycle-hooks",
                label: "Lifecycle hooks",
                description: "Observe and gate tool, permission, session, and subagent transitions with typed hooks.",
            },
            {
                id: "isolated-specialists",
                label: "Isolated specialists",
                description: "Give subagents explicit tools, skills, memory, model, turn, and isolation limits.",
            },
            {
                id: "permission-modes",
                label: "Permission modes",
                description: "Make planning, edits, automatic review, and approval behavior visually distinct.",
            },
        ],
        source: "reference",
    },
    opencode: {
        summary: "Open-source coding specialist with broad provider support and ACP-native sessions.",
        specialties: ["coding", "debugging"],
        patterns: [...CommonPatterns],
        source: "reference",
    },
    "kronterm-agent": {
        summary:
            "KronOS's OpenCode-compatible ACP specialist for bounded implementation and repository investigation with tab-scoped tools.",
        specialties: ["coding", "debugging", "review", "workspace-control"],
        patterns: [
            ...CommonPatterns,
            {
                id: "native-surface-tools",
                label: "Native surface tools",
                description: "Use the same scoped KronOS MCP surface as the invoking Hermes session.",
            },
        ],
        source: "builtin",
    },
    goose: {
        summary: "Open-source task specialist for extensible development and automation workflows.",
        specialties: ["coding", "automation"],
        patterns: [...CommonPatterns],
        source: "reference",
    },
};

export function getAcpHarnessProfile(backend: string): AcpHarnessProfile {
    const normalized = backend.trim().toLowerCase();
    const profile = Profiles[normalized] ?? {
        summary: "ACP-compatible specialist with capabilities discovered from its live protocol handshake.",
        specialties: ["coding"] as AcpHarnessTaskClass[],
        patterns: CommonPatterns,
        source: "reference" as const,
    };
    return { backend: normalized || backend, ...profile };
}

export function classifyHarnessTask(content: string): { taskClass: AcpHarnessTaskClass; reason: string } {
    const text = content.toLowerCase();
    const candidates: Array<{ taskClass: AcpHarnessTaskClass; pattern: RegExp; reason: string }> = [
        {
            taskClass: "workspace-control",
            pattern:
                /\b(kronterm|workspace|widget|block|canvas|desktop|browser tab|sandbox|vm|emulator|simulator|phone|iphone|android)\b/,
            reason: "The request targets a live KronOS or desktop workspace surface.",
        },
        {
            taskClass: "debugging",
            pattern: /\b(debug|bug|broken|failure|failing|crash|hang|regression|root cause)\b/,
            reason: "The request asks for diagnosis or failure recovery.",
        },
        {
            taskClass: "review",
            pattern: /\b(review|audit|critique|security|pull request|\bpr\b)\b/,
            reason: "The request asks for independent review or risk analysis.",
        },
        {
            taskClass: "architecture",
            pattern: /\b(architecture|design|roadmap|system design|refactor plan)\b/,
            reason: "The request needs architectural reasoning before execution.",
        },
        {
            taskClass: "research",
            pattern: /\b(research|compare|sources|documentation|look up|web search)\b/,
            reason: "The request depends on research or source comparison.",
        },
        {
            taskClass: "automation",
            pattern: /\b(automate|automation|scheduled|cron|recurring|workflow|pipeline)\b/,
            reason: "The request describes an automated or repeatable workflow.",
        },
    ];
    return (
        candidates.find((candidate) => candidate.pattern.test(text)) ?? {
            taskClass: "coding",
            reason: "The request is best handled as a repository coding task.",
        }
    );
}

function protocolCapabilities(capabilities: AcpAgentCapabilities | null): AcpCapabilityLease["protocol"] {
    const mcp = (["stdio", "http", "sse"] as const).filter((type) =>
        type === "stdio" ? capabilities?.mcpCapabilities?.stdio !== false : capabilities?.mcpCapabilities?.[type]
    );
    const session = (["fork", "resume", "list", "close"] as const).filter(
        (type) => capabilities?.sessionCapabilities?.[type]
    );
    return {
        loadSession: Boolean(capabilities?.loadSession),
        embeddedContext: Boolean(capabilities?.promptCapabilities?.embeddedContext),
        mcp,
        session,
    };
}

export function makeAcpCapabilityLease(input: {
    backend: string;
    capabilities: AcpAgentCapabilities | null;
    content: string;
    surfaceAvailable: boolean;
    workspace: string;
    ttlMs?: number;
}): AcpCapabilityLease {
    const now = Date.now();
    const classification = classifyHarnessTask(input.content);
    const profile = getAcpHarnessProfile(input.backend);
    const toolsets: KronTermToolsetId[] = [...TaskClassToolsets[classification.taskClass], "skills"];
    if (input.backend === "hermes" || input.backend === "kronoscode") {
        toolsets.push("agents");
    }
    const capabilities = [
        `task:${classification.taskClass}`,
        "filesystem:workspace",
        "skills:shared-read",
        ...(input.surfaceAvailable ? ["kronterm:surface"] : []),
        ...protocolCapabilities(input.capabilities).mcp.map((type) => `mcp:${type}`),
    ];
    const workspace = path.resolve(input.workspace);
    const digest = createHash("sha256")
        .update(`${input.backend}\0${workspace}\0${classification.taskClass}\0${now}`)
        .digest("hex")
        .slice(0, 12);
    return {
        id: `${randomUUID()}:${digest}`,
        backend: input.backend,
        issuedAt: now,
        expiresAt: now + (input.ttlMs ?? 30 * 60 * 1000),
        taskClass: classification.taskClass,
        reason: `${classification.reason} ${profile.summary}`,
        workspace,
        toolsets,
        capabilities,
        constraints: {
            filesystem: "workspace",
            writes: "approval-required",
            destructiveActions: "approval-required",
            externalSideEffects: "approval-required",
            credentialAccess: "brokered-only",
            surface: input.surfaceAvailable ? "tab" : "none",
        },
        protocol: protocolCapabilities(input.capabilities),
    };
}

export function formatAcpCapabilityLease(lease: AcpCapabilityLease, availableTools?: string[]): string {
    const groups = groupKronTermTools(
        availableTools ?? Object.values(KronTermToolsets).flatMap((toolset) => toolset.tools)
    );
    const toolsetLines = lease.toolsets
        .map((id) => {
            const toolset = KronTermToolFamilies[id];
            return groups[id].length
                ? `- ${toolset.label}: ${toolset.description} Tools: ${groups[id].join(", ")}`
                : "";
        })
        .filter(Boolean)
        .join("\n");
    const otherFamilies = Object.entries(groups)
        .filter(
            ([id, names]) =>
                names.length &&
                !lease.toolsets.includes(id as KronTermToolsetId) &&
                (id !== "agents" || lease.toolsets.includes("agents"))
        )
        .map(([id, names]) => `- ${KronTermToolFamilies[id].label}: ${names.join(", ")}`)
        .join("\n");
    return `[KronOS Specialist Capability Lease]
Lease: ${lease.id}
Backend: ${lease.backend}
Task class: ${lease.taskClass}
Workspace: ${lease.workspace}
Granted capabilities: ${lease.capabilities.join(", ")}
Recommended toolsets (surface tool groups for this task class):
${toolsetLines}
Other discoverable authorized tool families:
${otherFamilies || "None available in this session."}
Tool discovery: use tool_search for current descriptions and input schemas before using an unfamiliar tool. Recommendations do not grant permissions. Registration and advertisement do not prove runtime readiness: inspect host/device/server status first. Labs capabilities require supported hosts and current assignments. An unavailable runtime must report its missing prerequisite; never substitute an unrelated target or replay an uncertain mutation.
Constraints: filesystem=${lease.constraints.filesystem}; writes=${lease.constraints.writes}; destructive=${lease.constraints.destructiveActions}; external-side-effects=${lease.constraints.externalSideEffects}; credentials=${lease.constraints.credentialAccess}; surface=${lease.constraints.surface}
Expires: ${new Date(lease.expiresAt).toISOString()}

For workspace control: discover with workspace_inventory, resolve exact owners, inspect workspace_snapshot, act, then verify. Distinguish the caller's workspace from the user's visible workspace. Preserve user focus and readable content; use rendered bounds and visualassessment, then screenshots to assess appearance. Inspect state before repeating any action with an uncertain outcome.

Stay inside this task and workspace. Treat the lease as an upper bound, not a requirement to use every capability. Request explicit approval through ACP before writes, destructive actions, credential access, or external side effects. Return concise evidence, verification, and any fallback reason to KronosCode.`;
}
