// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Structure adapted from stablyai/orca src/shared/plugins/plugin-manifest.ts and plugin-manifest-fields.ts
// (MIT, Copyright (c) 2026 Lovecast Inc.); contribution types are KronTerm's. See THIRD_PARTY_NOTICES.md.

import { z } from "zod";
import { pluginCapabilitySchema } from "./plugin-capabilities";
import { validatePluginManifestContributions, type ValidationManifest } from "./plugin-manifest-validation";
import { isReservedPublisher, isSafePluginId, isSafePluginRelativePath } from "./plugin-path-safety";

const PluginManifestDir = ".kronterm-plugin";
const PluginManifestFilename = "plugin.json";
const PluginManifestMaxBytes = 256 * 1024;

const SemverRe =
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const PluginContributionLimits = {
    widgets: 32,
    applications: 32,
    commands: 256,
    settings: 128,
    skills: 64,
    hermesTools: 64,
    agents: 16,
    mcpServers: 16,
    artifactRenderers: 32,
    worktreeProviders: 4,
    sourceControlProviders: 4,
    attentionSources: 16,
} as const;

const PluginPresentations = ["widgets", "tabs", "canvas", "os"] as const;
const PluginWidgetSingletonScopes = ["none", "global", "per-workspace", "per-worktree", "per-related-block"] as const;

const pluginIdSchema = z
    .string()
    .refine(isSafePluginId, "must be kebab-case (a-z, 0-9, dashes) and not a reserved name");

// Every declared artifact stays inside the immutable plugin root; realpath containment separately rejects symlink
// escapes when the artifact is read.
const pluginRelativePathSchema = z
    .string()
    .min(1)
    .max(1024)
    .refine(isSafePluginRelativePath, "must be a portable relative path inside the plugin directory");

const pluginRelativeDirectorySchema = z
    .string()
    .min(1)
    .max(1024)
    .transform((value) => value.replace(/[\\/]+$/, ""))
    .refine(isSafePluginRelativePath, "must be a portable relative path inside the plugin directory");

const pluginContributionIdSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/, "must be a portable contribution id");

const pluginTitleSchema = z.string().trim().min(1).max(128);

// A closed ">=x.y.z" grammar keeps the engine gate predictable; richer ranges can be added without breaking old
// manifests.
const engineRangeSchema = z
    .string()
    .max(64)
    .regex(/^>=\d+\.\d+\.\d+$/, 'must be a ">=x.y.z" version range');

const executableSchema = z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._+-]+$/, "must be a bare executable name");

const argsSchema = z.array(z.string().max(1024)).max(64).default([]);

const activationEventSchema = z
    .string()
    .max(160)
    .regex(
        /^(?:onCommand:[A-Za-z0-9._-]+|onWidget:[A-Za-z0-9._-]+|onFileType:[a-z0-9]{1,16}|onArtifact:[a-z0-9.+-]+\/[a-z0-9.+*-]+|onUri:[a-z][a-z0-9+.-]{0,31}|onWorktreeSelected|onHermesRun|onApprovalPending)$/,
        "must be a supported activation event"
    );

const sizeSchema = z.strictObject({
    width: z.number().int().min(120).max(4096),
    height: z.number().int().min(80).max(4096),
});

const widgetContributionSchema = z.strictObject({
    id: pluginContributionIdSchema,
    title: pluginTitleSchema,
    icon: z.string().min(1).max(64).optional(),
    /** HTML entry rendered in a sandboxed per-plugin webview. */
    renderer: pluginRelativePathSchema,
    defaultSize: sizeSchema.optional(),
    minSize: sizeSchema.optional(),
    preferredPresentations: z
        .array(z.enum(PluginPresentations))
        .max(4)
        .default([...PluginPresentations]),
    singleton: z.enum(PluginWidgetSingletonScopes).default("none"),
    activation: z.array(activationEventSchema).max(16).default([]),
});

const applicationContributionSchema = z.strictObject({
    id: pluginContributionIdSchema,
    title: pluginTitleSchema,
    widget: pluginContributionIdSchema,
    category: z.string().trim().min(1).max(64).optional(),
    aliases: z.array(z.string().trim().min(1).max(64)).max(16).default([]),
});

const commandContributionSchema = z.strictObject({
    id: pluginContributionIdSchema,
    title: pluginTitleSchema,
    context: z.enum(["global", "workspace", "worktree"]).default("global"),
    /** Declarative commands open a contributed widget without starting the plugin service. */
    openWidget: pluginContributionIdSchema.optional(),
});

const SettingTypes = [
    "boolean",
    "string",
    "number",
    "integer",
    "enum",
    "path",
    "url",
    "color",
    "duration",
    "keybinding",
    "secretRef",
] as const;

const settingContributionSchema = z.strictObject({
    key: pluginContributionIdSchema,
    title: pluginTitleSchema,
    description: z.string().max(1024).optional(),
    type: z.enum(SettingTypes),
    default: z.union([z.string().max(4096), z.number(), z.boolean()]).optional(),
    options: z
        .array(z.strictObject({ value: z.string().min(1).max(128), label: pluginTitleSchema }))
        .max(64)
        .optional(),
    scope: z.enum(["user", "workspace", "repository"]).default("user"),
    restartRequired: z.boolean().default(false),
    searchTerms: z.array(z.string().max(64)).max(16).default([]),
});

const skillContributionSchema = z.strictObject({ path: pluginRelativeDirectorySchema });

const hermesToolContributionSchema = z.strictObject({
    name: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z][a-z0-9_]*$/, "must be snake_case"),
    title: pluginTitleSchema,
    description: z.string().trim().min(1).max(1024),
    inputSchema: z.record(z.string(), z.unknown()).default({ type: "object", properties: {} }),
    /** Capabilities the tool exercises; each must also be declared in `capabilities`. */
    effects: z.array(z.string().min(1).max(64)).max(16).default([]),
});

const agentContributionSchema = z.strictObject({
    id: pluginContributionIdSchema,
    title: pluginTitleSchema,
    protocol: z.literal("acp"),
    command: executableSchema,
    args: argsSchema,
});

const mcpServerContributionSchema = z.strictObject({
    id: pluginContributionIdSchema,
    title: pluginTitleSchema,
    command: executableSchema,
    args: argsSchema,
    /** Names only; values come from grants, never from the manifest. */
    env: z
        .array(z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "must be an environment variable name"))
        .max(32)
        .default([]),
});

const artifactRendererContributionSchema = z.strictObject({
    id: pluginContributionIdSchema,
    title: pluginTitleSchema,
    mimeTypes: z
        .array(z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+*-]+$/, "must be a MIME type"))
        .min(1)
        .max(16),
    renderer: pluginRelativePathSchema,
});

const providerContributionSchema = z.strictObject({
    id: pluginContributionIdSchema,
    title: pluginTitleSchema,
});

const contributionsSchema = z.strictObject({
    widgets: z.array(widgetContributionSchema).max(PluginContributionLimits.widgets).default([]),
    applications: z.array(applicationContributionSchema).max(PluginContributionLimits.applications).default([]),
    commands: z.array(commandContributionSchema).max(PluginContributionLimits.commands).default([]),
    settings: z.array(settingContributionSchema).max(PluginContributionLimits.settings).default([]),
    skills: z.array(skillContributionSchema).max(PluginContributionLimits.skills).default([]),
    hermesTools: z.array(hermesToolContributionSchema).max(PluginContributionLimits.hermesTools).default([]),
    agents: z.array(agentContributionSchema).max(PluginContributionLimits.agents).default([]),
    mcpServers: z.array(mcpServerContributionSchema).max(PluginContributionLimits.mcpServers).default([]),
    artifactRenderers: z
        .array(artifactRendererContributionSchema)
        .max(PluginContributionLimits.artifactRenderers)
        .default([]),
    worktreeProviders: z.array(providerContributionSchema).max(PluginContributionLimits.worktreeProviders).default([]),
    sourceControlProviders: z
        .array(providerContributionSchema)
        .max(PluginContributionLimits.sourceControlProviders)
        .default([]),
    attentionSources: z.array(providerContributionSchema).max(PluginContributionLimits.attentionSources).default([]),
});

const pluginManifestSchema = z
    .strictObject({
        manifestVersion: z.literal(1),
        id: pluginIdSchema,
        /** Canonical identity is `<publisher>.<id>`; bare-id uniqueness is unverifiable without a registry. */
        publisher: pluginIdSchema,
        name: z.string().trim().min(1).max(48),
        version: z.string().regex(SemverRe, "must be semver"),
        description: z.string().max(200).optional(),
        license: z.string().trim().min(1).max(128),
        homepage: z
            .string()
            .url()
            .max(2048)
            .refine((value) => value.startsWith("https://"), "must use https")
            .optional(),
        icon: pluginRelativePathSchema.optional(),
        engines: z.strictObject({ kronterm: engineRangeSchema }),
        pluginApi: z.literal(1),
        /** Service entry run in an isolated utility process; gated by trust tier at install. */
        main: pluginRelativePathSchema.optional(),
        activation: z.array(activationEventSchema).max(32).default([]),
        contributes: contributionsSchema.default(() => contributionsSchema.parse({})),
        capabilities: z.array(pluginCapabilitySchema).max(32).default([]),
        metadata: z
            .record(z.string().max(64), z.string().max(1024))
            .refine((value) => Object.keys(value).length <= 32, "at most 32 metadata keys")
            .optional(),
    })
    // KronTerm compiles without strictNullChecks, which makes zod infer every field optional; parsed values are complete.
    .superRefine((parsed, ctx) => validatePluginManifestContributions(parsed as ValidationManifest, ctx));

type PluginManifest = z.infer<typeof pluginManifestSchema>;
type PluginManifestInput = z.input<typeof pluginManifestSchema>;
type PluginWidgetContribution = z.infer<typeof widgetContributionSchema>;
type PluginCommandContribution = z.infer<typeof commandContributionSchema>;
type PluginSettingContribution = z.infer<typeof settingContributionSchema>;
type PluginHermesToolContribution = z.infer<typeof hermesToolContributionSchema>;

type PluginManifestIssue = { path: string; message: string };

// A flat shape because discriminated-union narrowing on `ok` is unavailable without strictNullChecks.
type PluginManifestParseResult = {
    ok: boolean;
    manifest?: PluginManifest;
    error?: string;
    issues?: PluginManifestIssue[];
};

type PluginManifestParseOptions = {
    /** Built-in packages may use reserved publishers; nothing else can. */
    builtin?: boolean;
};

function parsePluginManifest(raw: unknown, opts?: PluginManifestParseOptions): PluginManifestParseResult {
    const parsed = pluginManifestSchema.safeParse(raw);
    if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({
            path: issue.path.join(".") || "(root)",
            message: issue.message,
        }));
        return { ok: false, error: `${issues[0].path}: ${issues[0].message}`, issues };
    }
    if (!opts?.builtin && isReservedPublisher(parsed.data.publisher)) {
        const issue = { path: "publisher", message: `reserved publisher: ${parsed.data.publisher}` };
        return { ok: false, error: `${issue.path}: ${issue.message}`, issues: [issue] };
    }
    return { ok: true, manifest: parsed.data };
}

/** Parses manifest text with a size cap applied before JSON parsing so oversized files never allocate. */
function parsePluginManifestText(text: string, opts?: PluginManifestParseOptions): PluginManifestParseResult {
    if (new TextEncoder().encode(text).length > PluginManifestMaxBytes) {
        const issue = { path: "(root)", message: `manifest exceeds ${PluginManifestMaxBytes} bytes` };
        return { ok: false, error: `${issue.path}: ${issue.message}`, issues: [issue] };
    }
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        const issue = { path: "(root)", message: `invalid JSON: ${(e as Error).message}` };
        return { ok: false, error: `${issue.path}: ${issue.message}`, issues: [issue] };
    }
    return parsePluginManifest(raw, opts);
}

function qualifiedPluginKey(manifest: Pick<PluginManifest, "publisher" | "id">): string {
    return `${manifest.publisher}.${manifest.id}`;
}

function isQualifiedPluginKey(value: string): boolean {
    const dot = value.indexOf(".");
    if (dot <= 0 || dot !== value.lastIndexOf(".")) {
        return false;
    }
    return isSafePluginId(value.slice(0, dot)) && isSafePluginId(value.slice(dot + 1));
}

/** Block view name for a contributed widget; the `plugin:` prefix is reserved for the plugin host. */
function pluginWidgetViewName(manifest: Pick<PluginManifest, "publisher" | "id">, widgetId: string): string {
    return `plugin:${qualifiedPluginKey(manifest)}/${widgetId}`;
}

/** Prerelease and build suffixes on the host version are ignored for ordering. */
function satisfiesEngineRange(hostVersion: string, range: string): boolean {
    const parse = (value: string): number[] =>
        value
            .split(/[-+]/)[0]
            .split(".")
            .map((part) => Number.parseInt(part, 10) || 0);
    const host = parse(hostVersion);
    const min = parse(range.slice(2));
    for (let i = 0; i < 3; i++) {
        const a = host[i] ?? 0;
        const b = min[i] ?? 0;
        if (a !== b) {
            return a > b;
        }
    }
    return true;
}

export {
    isQualifiedPluginKey,
    parsePluginManifest,
    parsePluginManifestText,
    PluginContributionLimits,
    PluginManifestDir,
    PluginManifestFilename,
    PluginManifestMaxBytes,
    pluginManifestSchema,
    PluginPresentations,
    pluginWidgetViewName,
    qualifiedPluginKey,
    satisfiesEngineRange,
    type PluginCommandContribution,
    type PluginHermesToolContribution,
    type PluginManifest,
    type PluginManifestInput,
    type PluginManifestIssue,
    type PluginManifestParseResult,
    type PluginSettingContribution,
    type PluginWidgetContribution,
};
