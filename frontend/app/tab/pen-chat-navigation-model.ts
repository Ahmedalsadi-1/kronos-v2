// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

export type PenChatNavigationId =
    "recents" | "search" | "projects" | "library" | "scheduled" | "plugins" | "skills" | "settings";

export type PenChatSettingsTarget =
    | { kind: "hermes-settings"; section?: "plugins" | "providers" | "connections" | "computers" | "sessions" }
    | { kind: "workspace-settings"; section: "visual" | "canvas" };

export type PenChatNavigationTarget =
    | { kind: "hermes-sidebar"; section: "recents" | "search" | "projects" }
    | { kind: "history-tool"; tool: "artifacts" | "cron" | "skills" }
    | PenChatSettingsTarget;

export type PenChatNavigationItem = {
    id: PenChatNavigationId;
    label: string;
    target: PenChatNavigationTarget;
    featureIds: readonly string[];
    integration: "existing-pen-host" | "needs-pen-adapter";
    scope: string;
};

// These describe existing owners for the preview; they do not dispatch events or create another session store.
export const PenChatNavigationItems: readonly PenChatNavigationItem[] = [
    {
        id: "recents",
        label: "Recents",
        target: { kind: "hermes-sidebar", section: "recents" },
        featureIds: ["N03", "N04"],
        integration: "needs-pen-adapter",
        scope: "Reuse Hermes session pins, grouping and ordering; retain the active conversation.",
    },
    {
        id: "search",
        label: "Search",
        target: { kind: "hermes-sidebar", section: "search" },
        featureIds: ["N06", "N08"],
        integration: "needs-pen-adapter",
        scope: "Session search exists. Cross-content indexing and filters require a separate contract.",
    },
    {
        id: "projects",
        label: "Projects",
        target: { kind: "hermes-sidebar", section: "projects" },
        featureIds: ["N05", "P01"],
        integration: "needs-pen-adapter",
        scope: "Use the current gateway's projects.tree and project scope; handle unsupported backends explicitly.",
    },
    {
        id: "library",
        label: "Library",
        target: { kind: "history-tool", tool: "artifacts" },
        featureIds: ["N13", "L05", "L06"],
        integration: "existing-pen-host",
        scope: "Existing artifact browser only. Shared spaces, editable pages and access controls are separate work.",
    },
    {
        id: "scheduled",
        label: "Scheduled",
        target: { kind: "history-tool", tool: "cron" },
        featureIds: ["N12"],
        integration: "existing-pen-host",
        scope: "Reuse scheduled jobs and their existing session-opening and job-focus handlers.",
    },
    {
        id: "plugins",
        label: "Plugins",
        target: { kind: "hermes-settings", section: "plugins" },
        featureIds: ["N10", "S05", "X01", "X03", "X10"],
        integration: "needs-pen-adapter",
        scope: "Installed frontend and agent plugin controls. This does not imply marketplace or account authorization parity.",
    },
    {
        id: "skills",
        label: "Skills",
        target: { kind: "history-tool", tool: "skills" },
        featureIds: ["N11", "K01", "K03", "K05"],
        integration: "existing-pen-host",
        scope: "Reuse Capabilities, skill editing and hub installation in the active profile.",
    },
    {
        id: "settings",
        label: "Settings",
        target: { kind: "hermes-settings" },
        featureIds: ["R01"],
        integration: "needs-pen-adapter",
        scope: "Reuse the existing embedded settings host while preserving native Hermes section identifiers.",
    },
];

export function getPenChatNavigationItem(id: unknown): PenChatNavigationItem | undefined {
    if (typeof id !== "string") return undefined;
    return PenChatNavigationItems.find((item) => item.id === id);
}

export function penChatSettingsRoute(target: PenChatSettingsTarget): string {
    const section = target.kind === "workspace-settings" ? `kronterm:${target.section}` : target.section;
    return section ? `/settings?tab=${encodeURIComponent(section)}` : "/settings";
}
