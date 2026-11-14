// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type KronTermSkillRootOptions = {
    cwd?: string;
    homeDir?: string;
    resourcesPath?: string;
    configured?: string;
    kronosHome?: string;
    hermesHome?: string;
    codexHome?: string;
    configHome?: string;
};

export function resolveKronosHome(options: KronTermSkillRootOptions = {}): string {
    return path.resolve(
        options.kronosHome?.trim() ||
            process.env.KRONOS_HOME?.trim() ||
            path.join(options.homeDir ?? os.homedir(), ".kronos")
    );
}

export function ensureKronosSkillDirectory(options: KronTermSkillRootOptions = {}): string {
    const directory = path.join(resolveKronosHome(options), "skills");
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    return directory;
}

export function resolveKronTermSharedSkillDirs(options: KronTermSkillRootOptions = {}): string[] {
    const cwd = options.cwd ?? process.cwd();
    const homeDir = options.homeDir ?? os.homedir();
    const resourcesPath =
        options.resourcesPath ?? (process as typeof process & { resourcesPath?: string }).resourcesPath;
    const configured = options.configured ?? process.env.KRONTERM_SHARED_SKILL_DIRS ?? "";
    const configuredRoots = configured
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean);
    const candidates = [
        ...configuredRoots,
        path.join(cwd, ".kronos", "skills"),
        path.join(cwd, ".agents", "skills"),
        path.join(cwd, ".hermes", "skills"),
        path.join(cwd, ".kronoscode", "skills"),
        path.join(cwd, ".kilocode", "skills"),
        path.resolve(import.meta.dirname, "..", ".agents", "skills"),
        resourcesPath ? path.join(resourcesPath, "kronterm-skills") : undefined,
        path.join(resolveKronosHome(options), "skills"),
        path.join(homeDir, ".agents", "skills"),
        path.join(
            options.configHome ?? process.env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"),
            "agents",
            "skills"
        ),
        path.join(options.codexHome ?? process.env.CODEX_HOME ?? path.join(homeDir, ".codex"), "skills"),
        path.join(options.hermesHome ?? process.env.HERMES_HOME ?? path.join(homeDir, ".hermes"), "skills"),
        path.join(homeDir, ".kronoscode", "skills"),
    ];
    return Array.from(
        new Set(
            candidates
                .filter((candidate): candidate is string => Boolean(candidate))
                // Keep missing roots so a first CLI install is visible without restarting the agent.
                .map((candidate) => path.resolve(candidate))
        )
    );
}
