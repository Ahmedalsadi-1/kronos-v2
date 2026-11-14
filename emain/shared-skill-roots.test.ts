// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { SharedSkillCatalog } from "../mcp-kron-term/src/shared-skills";
import { ensureKronosSkillDirectory, resolveKronosHome, resolveKronTermSharedSkillDirs } from "./shared-skill-roots";

const TemporaryRoots: string[] = [];
afterEach(() => {
    for (const root of TemporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
});

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-cli-skills-"));
    TemporaryRoots.push(root);
    const options = {
        cwd: path.join(root, "project"),
        homeDir: path.join(root, "home"),
        resourcesPath: path.join(root, "resources"),
        configured: "",
        kronosHome: path.join(root, "kronos"),
        hermesHome: path.join(root, "hermes"),
        codexHome: path.join(root, "codex"),
        configHome: path.join(root, "config"),
    };
    return { root, options };
}

test("discovers first CLI installs, updates and removals without restarting the catalog", () => {
    const { options } = fixture();
    const catalog = new SharedSkillCatalog(resolveKronTermSharedSkillDirs(options).join(path.delimiter));
    const directory = path.join(options.cwd, ".agents", "skills", "cli-fixture");
    expect(catalog.list("cli-fixture")).toEqual([]);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "SKILL.md"), "---\nname: cli-fixture\n---\nFirst version");
    fs.mkdirSync(path.join(options.cwd, ".hermes", "skills"), { recursive: true });
    fs.symlinkSync(directory, path.join(options.cwd, ".hermes", "skills", "cli-fixture"), "junction");
    const skills = catalog.list("cli-fixture");
    expect(skills).toHaveLength(1);
    expect(catalog.read(skills[0].id).content).toContain("First version");
    fs.writeFileSync(path.join(directory, "SKILL.md"), "---\nname: cli-fixture\n---\nUpdated version");
    expect(catalog.read(skills[0].id).content).toContain("Updated version");
    fs.rmSync(directory, { recursive: true });
    expect(catalog.list("cli-fixture")).toEqual([]);
    expect(() => catalog.read(skills[0].id)).toThrow("Unknown shared skill");
});

test("supports KronOS and compatibility copy installs and global CLI destinations", () => {
    const { options } = fixture();
    const roots = resolveKronTermSharedSkillDirs(options);
    const destinations = [
        path.join(options.cwd, ".kronos", "skills"),
        path.join(options.kronosHome, "skills"),
        path.join(options.cwd, ".hermes", "skills"),
        path.join(options.homeDir, ".agents", "skills"),
        path.join(options.hermesHome, "skills"),
        path.join(options.configHome, "agents", "skills"),
    ];
    const catalog = new SharedSkillCatalog(roots.join(path.delimiter));
    for (const [index, destination] of destinations.entries()) {
        expect(roots).toContain(destination);
        const directory = path.join(destination, `cli-fixture-${index}`);
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(path.join(directory, "SKILL.md"), `---\nname: cli-fixture-${index}\n---\nInstalled`);
    }
    expect(catalog.list("cli-fixture")).toHaveLength(destinations.length);
});

test("honors CLI home overrides and deduplicates configured roots", () => {
    const { root, options } = fixture();
    vi.stubEnv("KRONOS_HOME", path.join(root, "custom-kronos"));
    vi.stubEnv("HERMES_HOME", path.join(root, "custom-hermes"));
    vi.stubEnv("CODEX_HOME", path.join(root, "custom-codex"));
    vi.stubEnv("XDG_CONFIG_HOME", path.join(root, "custom-config"));
    const roots = resolveKronTermSharedSkillDirs({
        ...options,
        kronosHome: undefined,
        hermesHome: undefined,
        codexHome: undefined,
        configHome: undefined,
        configured: [path.join(options.cwd, ".agents", "skills"), path.join(options.cwd, ".agents", "skills")].join(
            path.delimiter
        ),
    });
    expect(roots).toContain(path.join(root, "custom-kronos", "skills"));
    expect(roots).toContain(path.join(root, "custom-hermes", "skills"));
    expect(roots).toContain(path.join(root, "custom-codex", "skills"));
    expect(roots).toContain(path.join(root, "custom-config", "agents", "skills"));
    expect(new Set(roots).size).toBe(roots.length);
});

test("initializes a discoverable KronOS home and preserves existing installed skills", () => {
    const { options } = fixture();
    const directory = ensureKronosSkillDirectory(options);
    const installed = path.join(directory, "keep-me");
    fs.mkdirSync(installed);
    fs.writeFileSync(path.join(installed, "SKILL.md"), "Existing skill");
    expect(ensureKronosSkillDirectory(options)).toBe(directory);
    expect(fs.readFileSync(path.join(installed, "SKILL.md"), "utf8")).toBe("Existing skill");
    expect(resolveKronTermSharedSkillDirs(options)).toContain(directory);
});

test("uses the standard KronOS home when its override is blank", () => {
    const { options } = fixture();
    vi.stubEnv("KRONOS_HOME", "  ");
    expect(resolveKronosHome({ homeDir: options.homeDir })).toBe(path.join(options.homeDir, ".kronos"));
});
