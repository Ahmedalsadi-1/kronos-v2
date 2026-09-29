// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
// Boundary cases adapted from stablyai/orca plugin-manifest.test.ts and plugin-path-safety.test.ts
// (MIT, Copyright (c) 2026 Lovecast Inc.). See THIRD_PARTY_NOTICES.md.

import { describe, expect, it } from "vitest";
import { canonicalizeCapabilitySet, highRiskCapabilities } from "./plugin-capabilities";
import { canonicalizePluginConsent } from "./plugin-consent";
import {
    isQualifiedPluginKey,
    parsePluginManifest,
    parsePluginManifestText,
    PluginContributionLimits,
    PluginManifestMaxBytes,
    pluginWidgetViewName,
    satisfiesEngineRange,
} from "./plugin-manifest";
import { isSafePluginRelativePath } from "./plugin-path-safety";

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        manifestVersion: 1,
        id: "git-review",
        publisher: "acme",
        name: "Git Review",
        version: "1.0.0",
        license: "MIT",
        engines: { kronterm: ">=0.14.0" },
        pluginApi: 1,
        ...overrides,
    };
}

function messages(raw: Record<string, unknown>): string[] {
    const result = parsePluginManifest(raw);
    return result.ok ? [] : result.issues.map((issue) => issue.message);
}

const FullManifest = manifest({
    main: "service/index.js",
    activation: ["onCommand:open-review", "onWorktreeSelected"],
    contributes: {
        widgets: [
            {
                id: "review",
                title: "Review",
                renderer: "renderer/review.html",
                defaultSize: { width: 560, height: 420 },
                minSize: { width: 320, height: 220 },
                singleton: "per-worktree",
                activation: ["onWidget:review", "onArtifact:text/x-diff"],
            },
        ],
        applications: [{ id: "review-app", title: "Review", widget: "review", aliases: ["pr"] }],
        commands: [
            { id: "open-review", title: "Open Review", openWidget: "review" },
            { id: "refresh", title: "Refresh", context: "worktree" },
        ],
        settings: [
            { key: "compact", title: "Compact rows", type: "boolean", default: true },
            {
                key: "sort",
                title: "Sort",
                type: "enum",
                default: "recent",
                options: [
                    { value: "recent", label: "Recent" },
                    { value: "name", label: "Name" },
                ],
            },
            { key: "token", title: "Token", type: "secretRef" },
        ],
        skills: [{ path: "skills/review/" }],
        hermesTools: [
            {
                name: "summarize_diff",
                title: "Summarize diff",
                description: "Summarize the current worktree diff",
                effects: ["git:read"],
            },
        ],
        mcpServers: [{ id: "review-mcp", title: "Review MCP", command: "node", args: ["mcp/index.js"] }],
        artifactRenderers: [{ id: "diff", title: "Diff", mimeTypes: ["text/x-diff"], renderer: "renderer/diff.html" }],
        worktreeProviders: [{ id: "worktrees", title: "Worktrees" }],
        attentionSources: [{ id: "review-requests", title: "Review requests" }],
    },
    capabilities: [
        { kind: "workspace:widget" },
        { kind: "agents:tools" },
        { kind: "git:read" },
        { kind: "notifications:attention" },
        { kind: "process:exec", executables: ["node"] },
        { kind: "network:connect", hosts: ["api.github.com", "*.gitlab.com"] },
    ],
});

describe("parsePluginManifest", () => {
    it("accepts a minimal declarative manifest and fills defaults", () => {
        const result = parsePluginManifest(manifest());
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.manifest.contributes.widgets).toEqual([]);
            expect(result.manifest.capabilities).toEqual([]);
        }
    });

    it("accepts a manifest exercising every v1 contribution type", () => {
        const result = parsePluginManifest(FullManifest);
        expect(result).toMatchObject({ ok: true });
        if (result.ok) {
            expect(result.manifest.contributes.skills[0].path).toBe("skills/review");
            expect(result.manifest.contributes.widgets[0].preferredPresentations).toEqual([
                "widgets",
                "tabs",
                "canvas",
                "os",
            ]);
        }
    });

    it("rejects unknown top-level and contribution fields", () => {
        expect(parsePluginManifest(manifest({ permissions: [] })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ contributes: { backgroundServices: [] } })).ok).toBe(false);
        expect(
            parsePluginManifest(
                manifest({
                    contributes: {
                        widgets: [{ id: "w", title: "W", renderer: "w.html", nodeIntegration: true }],
                    },
                    capabilities: [{ kind: "workspace:widget" }],
                })
            ).ok
        ).toBe(false);
    });

    it("rejects invalid identities, versions, and engine ranges", () => {
        expect(parsePluginManifest(manifest({ id: "Git_Review" })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ id: "__proto__" })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ version: "01.0.0" })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ version: "1.0" })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ version: "1.0.0-alpha.1+build.5" })).ok).toBe(true);
        expect(parsePluginManifest(manifest({ engines: { kronterm: "^0.14.0" } })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ homepage: "http://example.com" })).ok).toBe(false);
    });

    it("reserves built-in publishers for built-in packages", () => {
        expect(parsePluginManifest(manifest({ publisher: "kronterm" }))).toMatchObject({
            ok: false,
            error: "publisher: reserved publisher: kronterm",
        });
        expect(parsePluginManifest(manifest({ publisher: "kronterm" }), { builtin: true }).ok).toBe(true);
    });

    it("rejects duplicate contribution identities and capabilities", () => {
        expect(
            messages(
                manifest({
                    main: "main.js",
                    contributes: {
                        commands: [
                            { id: "run", title: "One" },
                            { id: "run", title: "Two" },
                        ],
                        settings: [
                            { key: "a", title: "A", type: "string" },
                            { key: "a", title: "B", type: "string" },
                        ],
                    },
                    capabilities: [{ kind: "git:read" }, { kind: "git:read" }],
                })
            )
        ).toEqual(
            expect.arrayContaining([
                "duplicate commands id: run",
                "duplicate settings key: a",
                "duplicate capability kind: git:read",
            ])
        );
    });

    it("caps contribution arrays before they reach registries", () => {
        const commands = Array.from({ length: PluginContributionLimits.commands + 1 }, (_, i) => ({
            id: `command-${i}`,
            title: `Command ${i}`,
        }));
        expect(parsePluginManifest(manifest({ main: "main.js", contributes: { commands } })).ok).toBe(false);
    });

    it("rejects dangling references between contributions", () => {
        expect(
            messages(
                manifest({
                    activation: ["onCommand:missing"],
                    contributes: {
                        widgets: [{ id: "w", title: "W", renderer: "w.html", activation: ["onWidget:nope"] }],
                        applications: [{ id: "app", title: "App", widget: "gone" }],
                        commands: [{ id: "open", title: "Open", openWidget: "gone" }],
                    },
                    capabilities: [{ kind: "workspace:widget" }],
                })
            )
        ).toEqual(
            expect.arrayContaining([
                "unknown contributed command: missing",
                "unknown contributed widget: nope",
                "unknown contributed widget: gone",
            ])
        );
    });

    it("rejects unsupported activation events", () => {
        expect(parsePluginManifest(manifest({ activation: ["*"] })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ activation: ["onStartup"] })).ok).toBe(false);
    });
});

describe("capability requirements", () => {
    it("requires workspace:widget for widgets and artifact renderers", () => {
        expect(
            messages(manifest({ contributes: { widgets: [{ id: "w", title: "W", renderer: "w.html" }] } }))
        ).toContain("workspace:widget capability required when contributes.widgets is non-empty");
    });

    it("requires a service entry for service commands, tools, providers, and attention sources", () => {
        const result = messages(
            manifest({
                contributes: {
                    commands: [{ id: "run", title: "Run" }],
                    hermesTools: [{ name: "t", title: "T", description: "d" }],
                    worktreeProviders: [{ id: "p", title: "P" }],
                    attentionSources: [{ id: "a", title: "A" }],
                },
                capabilities: [{ kind: "agents:tools" }, { kind: "git:read" }, { kind: "notifications:attention" }],
            })
        );
        expect(result.filter((m) => m.startsWith("required when"))).toHaveLength(4);
    });

    it("rejects Hermes tool effects that are unknown or undeclared", () => {
        expect(
            messages(
                manifest({
                    main: "main.js",
                    contributes: {
                        hermesTools: [
                            { name: "push", title: "Push", description: "Push", effects: ["git:push", "root:shell"] },
                        ],
                    },
                    capabilities: [{ kind: "agents:tools" }],
                })
            )
        ).toEqual(
            expect.arrayContaining([
                "effect git:push is not declared in capabilities",
                "unknown capability: root:shell",
            ])
        );
    });

    it("requires MCP and agent commands to be allowlisted executables", () => {
        expect(
            messages(
                manifest({
                    contributes: { mcpServers: [{ id: "m", title: "M", command: "python3" }] },
                    capabilities: [{ kind: "process:exec", executables: ["node"] }],
                })
            )
        ).toContain('executable "python3" must be listed in a process:exec capability');
    });

    it("rejects wildcard network access and redundant network grants", () => {
        expect(parsePluginManifest(manifest({ capabilities: [{ kind: "network:connect", hosts: ["*"] }] })).ok).toBe(
            false
        );
        expect(
            parsePluginManifest(manifest({ capabilities: [{ kind: "process:exec", executables: ["../bin/sh"] }] })).ok
        ).toBe(false);
        expect(
            messages(
                manifest({
                    capabilities: [{ kind: "network:any" }, { kind: "network:connect", hosts: ["example.com"] }],
                })
            )
        ).toContain("network:any already covers network:connect; declare only one");
    });

    it("classifies high-risk capabilities so they are never pre-granted", () => {
        const result = parsePluginManifest(FullManifest);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(highRiskCapabilities(result.manifest.capabilities).map((c) => c.kind)).toEqual(["process:exec"]);
        }
    });
});

describe("settings", () => {
    const setting = (s: Record<string, unknown>) =>
        manifest({ contributes: { settings: [{ key: "s", title: "S", ...s }] } });

    it("type-checks defaults against the declared setting type", () => {
        expect(messages(setting({ type: "boolean", default: "yes" }))).toContain(
            "default must be a boolean for boolean settings"
        );
        expect(messages(setting({ type: "integer", default: 1.5 }))).toContain("default must be an integer");
        expect(parsePluginManifest(setting({ type: "number", default: 1.5 })).ok).toBe(true);
    });

    it("requires enum options and matching defaults", () => {
        expect(messages(setting({ type: "enum" }))).toContain("enum settings require options");
        expect(messages(setting({ type: "enum", default: "c", options: [{ value: "a", label: "A" }] }))).toContain(
            "enum default must be one of its options"
        );
    });

    it("forbids shipping secret values in a package", () => {
        expect(messages(setting({ type: "secretRef", default: "ghp_x" }))).toContain(
            "secretRef settings cannot have a default"
        );
    });
});

describe("plugin path portability", () => {
    it.each([
        "CON",
        "assets/aux.txt",
        "dist/panel.html.",
        "dist/panel.html ",
        "dist/panel.html:payload",
        "dist\\LPT1.js",
        "../worker.js",
        "dist//panel.html",
        "/etc/passwd",
        "\\\\server\\share",
    ])("rejects %s on every host platform", (path) => {
        expect(isSafePluginRelativePath(path)).toBe(false);
    });

    it.each(["dist/panel.html", "assets/.icon.svg", "nested\\worker.js"])("accepts %s", (path) => {
        expect(isSafePluginRelativePath(path)).toBe(true);
    });

    it("applies path validation to every declared artifact", () => {
        expect(parsePluginManifest(manifest({ icon: "assets/NUL.svg" })).ok).toBe(false);
        expect(parsePluginManifest(manifest({ main: "dist/worker.js." })).ok).toBe(false);
        expect(
            parsePluginManifest(
                manifest({
                    contributes: { widgets: [{ id: "w", title: "W", renderer: "../escape.html" }] },
                    capabilities: [{ kind: "workspace:widget" }],
                })
            ).ok
        ).toBe(false);
        expect(parsePluginManifest(manifest({ contributes: { skills: [{ path: "../../.ssh" }] } })).ok).toBe(false);
    });
});

describe("parsePluginManifestText", () => {
    it("rejects oversized manifests before parsing and reports invalid JSON", () => {
        expect(parsePluginManifestText(" ".repeat(PluginManifestMaxBytes + 1)).ok).toBe(false);
        expect(parsePluginManifestText("{").ok).toBe(false);
        expect(parsePluginManifestText(JSON.stringify(manifest())).ok).toBe(true);
    });
});

describe("identity helpers", () => {
    it("builds qualified keys and reserved widget view names", () => {
        expect(isQualifiedPluginKey("acme.git-review")).toBe(true);
        expect(isQualifiedPluginKey("acme.git.review")).toBe(false);
        expect(isQualifiedPluginKey(".git-review")).toBe(false);
        expect(pluginWidgetViewName({ publisher: "acme", id: "git-review" }, "review")).toBe(
            "plugin:acme.git-review/review"
        );
    });

    it("gates engines with a >= comparison that ignores prerelease suffixes", () => {
        expect(satisfiesEngineRange("0.14.3", ">=0.14.0")).toBe(true);
        expect(satisfiesEngineRange("0.14.3-beta.1", ">=0.14.3")).toBe(true);
        expect(satisfiesEngineRange("0.13.9", ">=0.14.0")).toBe(false);
        expect(satisfiesEngineRange("1.0.0", ">=0.99.99")).toBe(true);
    });
});

describe("consent canonicalization", () => {
    it("is stable across capability order, duplicates, and scoped list order", () => {
        const a = canonicalizeCapabilitySet([
            { kind: "git:read" },
            { kind: "network:connect", hosts: ["b.com", "a.com"] },
        ]);
        const b = canonicalizeCapabilitySet([
            { kind: "network:connect", hosts: ["a.com", "b.com", "a.com"] },
            { kind: "git:read" },
            { kind: "git:read" },
        ]);
        expect(a).toBe(b);
    });

    it("changes when a service entry or executable content is added", () => {
        const base = { capabilities: [{ kind: "git:read" as const }] };
        expect(canonicalizePluginConsent(base)).not.toBe(canonicalizePluginConsent({ ...base, main: "main.js" }));
        const withSkills = { ...base, contributes: { skills: [{ path: "skills/a" }] } };
        expect(canonicalizePluginConsent(withSkills, "sha256-one")).not.toBe(
            canonicalizePluginConsent(withSkills, "sha256-two")
        );
        expect(canonicalizePluginConsent(base, "sha256-one")).toBe(canonicalizePluginConsent(base, "sha256-two"));
    });
});
