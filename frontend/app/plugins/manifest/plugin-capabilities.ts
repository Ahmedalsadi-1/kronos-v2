// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Adapted from stablyai/orca src/shared/plugins/plugin-capabilities.ts
// (MIT, Copyright (c) 2026 Lovecast Inc.). See THIRD_PARTY_NOTICES.md.

import { z } from "zod";

/**
 * Risk tiers follow the Milestone A spec: low/medium may be granted at install, high is never pre-granted, never part
 * of an "allow all", and always prompts at first use.
 */
type PluginCapabilityRisk = "low" | "medium" | "high";

const UnscopedCapabilityKinds = [
    "workspace:read",
    "workspace:widget",
    "workspace:focus",
    "notifications:attention",
    "settings:own",
    "storage",
    "git:read",
    "files:read:selected",
    "files:read",
    "files:watch",
    "terminal:read",
    "browser:read",
    "agents:tools",
    "agents:evidence",
    "terminal:create",
    "terminal:send",
    "files:write",
    "files:write:outside",
    "git:write",
    "git:destructive",
    "git:push",
    "network:any",
    "secrets",
    "native:accessibility",
    "native:screencapture",
    "agents:kronoscode",
    "runtime:background",
    "runtime:remote",
] as const;

const ScopedCapabilityKinds = ["network:connect", "process:exec"] as const;

const PluginCapabilityKinds = [...UnscopedCapabilityKinds, ...ScopedCapabilityKinds] as const;

type PluginCapabilityKind = (typeof PluginCapabilityKinds)[number];

// Strict objects (not a bare enum) so scoped fields can be added per kind without changing the manifest shape.
const unscopedCapabilitySchema = z.strictObject({ kind: z.enum(UnscopedCapabilityKinds) });

const networkConnectCapabilitySchema = z.strictObject({
    kind: z.literal("network:connect"),
    // No bare "*": unrestricted egress must be requested explicitly as the high-risk network:any.
    hosts: z
        .array(
            z
                .string()
                .trim()
                .min(1)
                .max(253)
                .regex(/^(?:\*\.)?[A-Za-z0-9.-]+(?::\d{1,5})?$/, "must be a host, *.suffix, or host:port")
        )
        .min(1)
        .max(32),
});

const processExecCapabilitySchema = z.strictObject({
    kind: z.literal("process:exec"),
    executables: z
        .array(
            z
                .string()
                .trim()
                .min(1)
                .max(128)
                .regex(/^[A-Za-z0-9._+-]+$/, "must be a bare executable name")
        )
        .min(1)
        .max(32),
});

const pluginCapabilitySchema = z.discriminatedUnion("kind", [
    unscopedCapabilitySchema,
    networkConnectCapabilitySchema,
    processExecCapabilitySchema,
]);

type PluginCapability = z.infer<typeof pluginCapabilitySchema>;

const PluginCapabilityRiskByKind: Record<PluginCapabilityKind, PluginCapabilityRisk> = {
    "workspace:read": "low",
    "workspace:widget": "low",
    "workspace:focus": "low",
    "notifications:attention": "low",
    "settings:own": "low",
    storage: "low",
    "git:read": "low",
    "files:read:selected": "low",
    "files:read": "medium",
    "files:watch": "medium",
    "terminal:read": "medium",
    "browser:read": "medium",
    "agents:tools": "medium",
    "agents:evidence": "medium",
    "network:connect": "medium",
    "terminal:create": "high",
    "terminal:send": "high",
    "process:exec": "high",
    "files:write": "high",
    "files:write:outside": "high",
    "git:write": "high",
    "git:destructive": "high",
    "git:push": "high",
    "network:any": "high",
    secrets: "high",
    "native:accessibility": "high",
    "native:screencapture": "high",
    "agents:kronoscode": "high",
    "runtime:background": "high",
    "runtime:remote": "high",
};

/** Shown verbatim in install previews and prompts; each line must stay honest about what KronTerm enforces. */
const PluginCapabilityDescriptions: Record<PluginCapabilityKind, string> = {
    "workspace:read": "See the focused workspace, its widgets, and their titles",
    "workspace:widget": "Open its own widgets in your workspace",
    "workspace:focus": "Ask KronOS to focus one of its widgets",
    "notifications:attention": "Add items to the attention shelf, labeled with the plugin name",
    "settings:own": "Read and change the plugin's own settings",
    storage: "Store data in the plugin's own data folder",
    "git:read": "Read Git status, branches, worktrees, and diffs",
    "files:read:selected": "Read files you explicitly select or share with it",
    "files:read": "Read files inside the active workspace",
    "files:watch": "Watch files inside the active workspace for changes",
    "terminal:read": "Read recent output from terminals in the active workspace",
    "browser:read": "Read the page content of browser widgets in the active workspace",
    "agents:tools": "Offer tools that Hermes can call, labeled with the plugin name",
    "agents:evidence": "Attach evidence and results to agent runs",
    "network:connect": "Connect only to the network hosts listed by the plugin",
    "terminal:create": "Open new terminals",
    "terminal:send": "Type into a specific terminal",
    "process:exec": "Run only the executable names listed by the plugin",
    "files:write": "Create and change files inside the active workspace",
    "files:write:outside": "Create and change files outside the active workspace",
    "git:write": "Stage, commit, create branches, and create worktrees",
    "git:destructive": "Force-push, delete branches, reset, or remove worktrees with uncommitted changes",
    "git:push": "Push to remote repositories",
    "network:any": "Connect to any network host",
    secrets: "Read the values of secrets you name for it",
    "native:accessibility": "Control other applications through macOS Accessibility",
    "native:screencapture": "Capture your screen",
    "agents:kronoscode": "Start KronosCode coding runs",
    "runtime:background": "Keep running in the background when none of its widgets are open",
    "runtime:remote": "Run commands on remote hosts or sandboxes",
};

/**
 * Order- and duplicate-insensitive, key-sorted encoding so consent stays stable across manifest reformatting and a
 * scoped field can never produce two encodings of the same grant.
 */
function canonicalizeCapabilitySet(capabilities: readonly PluginCapability[]): string {
    const encoded = capabilities.map((capability) => {
        const normalized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(capability).sort(([a], [b]) => a.localeCompare(b))) {
            normalized[key] = Array.isArray(value) ? [...new Set(value)].sort() : value;
        }
        return JSON.stringify(normalized);
    });
    return JSON.stringify([...new Set(encoded)].sort());
}

function capabilityKinds(capabilities: readonly PluginCapability[]): PluginCapabilityKind[] {
    return [...new Set(capabilities.map((capability) => capability.kind))];
}

function highRiskCapabilities(capabilities: readonly PluginCapability[]): PluginCapability[] {
    return capabilities.filter((capability) => PluginCapabilityRiskByKind[capability.kind] === "high");
}

export {
    canonicalizeCapabilitySet,
    capabilityKinds,
    highRiskCapabilities,
    PluginCapabilityDescriptions,
    PluginCapabilityKinds,
    PluginCapabilityRiskByKind,
    pluginCapabilitySchema,
    type PluginCapability,
    type PluginCapabilityKind,
    type PluginCapabilityRisk,
};
