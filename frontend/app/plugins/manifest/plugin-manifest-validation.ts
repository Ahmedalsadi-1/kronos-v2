// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Pattern adapted from stablyai/orca src/shared/plugins/plugin-manifest-contribution-validation.ts
// (MIT, Copyright (c) 2026 Lovecast Inc.). See THIRD_PARTY_NOTICES.md.

import type { RefinementCtx } from "zod";
import { PluginCapabilityKinds, type PluginCapability, type PluginCapabilityKind } from "./plugin-capabilities";

type Identified = { id: string };

// Structural rather than importing PluginManifest, which would make the schema module circular.
type ValidationManifest = {
    main?: string;
    activation: string[];
    contributes: {
        widgets: (Identified & { activation: string[]; defaultSize?: Size; minSize?: Size })[];
        applications: (Identified & { widget: string })[];
        commands: (Identified & { openWidget?: string })[];
        settings: {
            key: string;
            type: string;
            default?: string | number | boolean;
            options?: { value: string }[];
        }[];
        skills: { path: string }[];
        hermesTools: { name: string; effects: string[] }[];
        agents: (Identified & { command: string })[];
        mcpServers: (Identified & { command: string })[];
        artifactRenderers: Identified[];
        worktreeProviders: Identified[];
        sourceControlProviders: Identified[];
        attentionSources: Identified[];
    };
    capabilities: PluginCapability[];
};

type Size = { width: number; height: number };

const KnownCapabilityKinds = new Set<string>(PluginCapabilityKinds);

function issue(ctx: RefinementCtx, path: (string | number)[], message: string): void {
    ctx.addIssue({ code: "custom", path, message });
}

function rejectDuplicates<T>(
    ctx: RefinementCtx,
    entries: readonly T[],
    keyOf: (entry: T) => string,
    path: string,
    label: string
): void {
    const seen = new Set<string>();
    for (const [index, entry] of entries.entries()) {
        const key = keyOf(entry);
        if (seen.has(key)) {
            issue(ctx, ["contributes", path, index], `duplicate ${label}: ${key}`);
        }
        seen.add(key);
    }
}

function requireCapability(
    ctx: RefinementCtx,
    declared: ReadonlySet<PluginCapabilityKind>,
    kind: PluginCapabilityKind,
    contribution: string
): void {
    if (!declared.has(kind)) {
        issue(ctx, ["capabilities"], `${kind} capability required when contributes.${contribution} is non-empty`);
    }
}

function requireMain(ctx: RefinementCtx, manifest: ValidationManifest, reason: string): void {
    if (!manifest.main) {
        issue(ctx, ["main"], `required when ${reason}`);
    }
}

function requireExecutable(
    ctx: RefinementCtx,
    executables: ReadonlySet<string>,
    command: string,
    path: (string | number)[]
): void {
    if (!executables.has(command)) {
        issue(ctx, path, `executable "${command}" must be listed in a process:exec capability`);
    }
}

function validateSettingDefault(
    ctx: RefinementCtx,
    setting: ValidationManifest["contributes"]["settings"][number],
    index: number
): void {
    const path = ["contributes", "settings", index];
    if (setting.type === "enum") {
        if (setting.options == null || setting.options.length === 0) {
            issue(ctx, [...path, "options"], "enum settings require options");
            return;
        }
        if (setting.default != null && !setting.options.some((option) => option.value === setting.default)) {
            issue(ctx, [...path, "default"], "enum default must be one of its options");
        }
        return;
    }
    if (setting.options != null) {
        issue(ctx, [...path, "options"], "options are only valid for enum settings");
    }
    if (setting.type === "secretRef" && setting.default != null) {
        // Secret values must never ship inside a package.
        issue(ctx, [...path, "default"], "secretRef settings cannot have a default");
        return;
    }
    if (setting.default == null) {
        return;
    }
    const expected =
        setting.type === "boolean"
            ? "boolean"
            : setting.type === "number" || setting.type === "integer"
              ? "number"
              : "string";
    if (typeof setting.default !== expected) {
        issue(ctx, [...path, "default"], `default must be a ${expected} for ${setting.type} settings`);
        return;
    }
    if (setting.type === "integer" && !Number.isInteger(setting.default)) {
        issue(ctx, [...path, "default"], "default must be an integer");
    }
}

function validateActivationTargets(
    ctx: RefinementCtx,
    events: readonly string[],
    path: (string | number)[],
    commandIds: ReadonlySet<string>,
    widgetIds: ReadonlySet<string>
): void {
    for (const [index, event] of events.entries()) {
        if (event.startsWith("onCommand:") && !commandIds.has(event.slice("onCommand:".length))) {
            issue(ctx, [...path, index], `unknown contributed command: ${event.slice("onCommand:".length)}`);
        }
        if (event.startsWith("onWidget:") && !widgetIds.has(event.slice("onWidget:".length))) {
            issue(ctx, [...path, index], `unknown contributed widget: ${event.slice("onWidget:".length)}`);
        }
    }
}

function validatePluginManifestContributions(manifest: ValidationManifest, ctx: RefinementCtx): void {
    const c = manifest.contributes;
    for (const key of [
        "widgets",
        "applications",
        "commands",
        "agents",
        "mcpServers",
        "artifactRenderers",
        "worktreeProviders",
        "sourceControlProviders",
        "attentionSources",
    ] as const) {
        rejectDuplicates(ctx, c[key] as Identified[], (entry) => entry.id, key, `${key} id`);
    }
    rejectDuplicates(ctx, c.settings, (entry) => entry.key, "settings", "settings key");
    rejectDuplicates(ctx, c.skills, (entry) => entry.path, "skills", "skills path");
    rejectDuplicates(ctx, c.hermesTools, (entry) => entry.name, "hermesTools", "hermesTools name");
    rejectDuplicates(ctx, manifest.capabilities, (entry) => entry.kind, "capabilities", "capability kind");

    const declared = new Set(manifest.capabilities.map((capability) => capability.kind));
    const executables = new Set(
        manifest.capabilities.flatMap((capability) =>
            capability.kind === "process:exec" ? capability.executables : []
        )
    );
    const widgetIds = new Set(c.widgets.map((widget) => widget.id));
    const commandIds = new Set(c.commands.map((command) => command.id));

    if (c.widgets.length > 0 || c.artifactRenderers.length > 0) {
        requireCapability(ctx, declared, "workspace:widget", c.widgets.length > 0 ? "widgets" : "artifactRenderers");
    }
    for (const [index, widget] of c.widgets.entries()) {
        validateActivationTargets(
            ctx,
            widget.activation,
            ["contributes", "widgets", index, "activation"],
            commandIds,
            widgetIds
        );
        if (
            widget.defaultSize != null &&
            widget.minSize != null &&
            (widget.defaultSize.width < widget.minSize.width || widget.defaultSize.height < widget.minSize.height)
        ) {
            issue(ctx, ["contributes", "widgets", index, "defaultSize"], "defaultSize must be at least minSize");
        }
    }
    validateActivationTargets(ctx, manifest.activation, ["activation"], commandIds, widgetIds);

    for (const [index, app] of c.applications.entries()) {
        if (!widgetIds.has(app.widget)) {
            issue(ctx, ["contributes", "applications", index, "widget"], `unknown contributed widget: ${app.widget}`);
        }
    }
    for (const [index, command] of c.commands.entries()) {
        if (command.openWidget != null && !widgetIds.has(command.openWidget)) {
            issue(
                ctx,
                ["contributes", "commands", index, "openWidget"],
                `unknown contributed widget: ${command.openWidget}`
            );
        }
    }
    if (c.commands.some((command) => command.openWidget == null)) {
        requireMain(ctx, manifest, "contributes.commands contains a service command");
    }
    for (const [index, setting] of c.settings.entries()) {
        validateSettingDefault(ctx, setting, index);
    }

    if (c.hermesTools.length > 0) {
        requireMain(ctx, manifest, "contributes.hermesTools is non-empty");
        requireCapability(ctx, declared, "agents:tools", "hermesTools");
    }
    for (const [index, tool] of c.hermesTools.entries()) {
        for (const [effectIndex, effect] of tool.effects.entries()) {
            const path = ["contributes", "hermesTools", index, "effects", effectIndex];
            if (!KnownCapabilityKinds.has(effect)) {
                issue(ctx, path, `unknown capability: ${effect}`);
            } else if (!declared.has(effect as PluginCapabilityKind)) {
                issue(ctx, path, `effect ${effect} is not declared in capabilities`);
            }
        }
    }

    for (const [index, agent] of c.agents.entries()) {
        requireExecutable(ctx, executables, agent.command, ["contributes", "agents", index, "command"]);
    }
    for (const [index, server] of c.mcpServers.entries()) {
        requireExecutable(ctx, executables, server.command, ["contributes", "mcpServers", index, "command"]);
    }
    for (const key of ["worktreeProviders", "sourceControlProviders"] as const) {
        if (c[key].length > 0) {
            requireMain(ctx, manifest, `contributes.${key} is non-empty`);
            requireCapability(ctx, declared, "git:read", key);
        }
    }
    if (c.attentionSources.length > 0) {
        requireMain(ctx, manifest, "contributes.attentionSources is non-empty");
        requireCapability(ctx, declared, "notifications:attention", "attentionSources");
    }
    if (declared.has("network:any") && declared.has("network:connect")) {
        issue(ctx, ["capabilities"], "network:any already covers network:connect; declare only one");
    }
}

export { validatePluginManifestContributions, type ValidationManifest };
