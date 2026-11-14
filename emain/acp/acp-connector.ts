// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChildProcess, execFile, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { createSpawnConfig, prepareCleanEnv } from "./acp-env";
import { ACP_BACKENDS_ALL } from "./acp-types";

export interface AcpSpawnResult {
    child: ChildProcess;
    isDetached: boolean;
}

export async function spawnAcpAgent(
    backend: string,
    cliPath: string,
    workingDir: string,
    customArgs?: string[],
    customEnv?: Record<string, string>,
    signal?: AbortSignal
): Promise<AcpSpawnResult> {
    const config = ACP_BACKENDS_ALL[backend];
    const acpArgs = customArgs ?? config?.acpArgs;
    const runtimeEnv = {
        ...(config?.env ?? {}),
        ...customEnv,
    };
    if (backend === "kronoscode") {
        runtimeEnv.KRONOSCODE_CLIENT ??= "acp";
        runtimeEnv.KRONOSCODE_DISABLE_AUTOUPDATE ??= "1";
        runtimeEnv.KRONOSCODE_DISABLE_EXTERNAL_SKILLS ??= "1";
    }
    if (backend === "hermes") {
        runtimeEnv.HERMES_ACP_SKIP_CONFIGURED_MCP ??= "1";
    }
    if (backend === "kronterm-agent") {
        const dataDir = path.join(os.homedir(), ".kronterm", "agents", "kronterm-agent");
        fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
        runtimeEnv.OPENCODE_DB ??= path.join(dataDir, "opencode.db");
        runtimeEnv.OPENCODE_DISABLE_AUTOUPDATE ??= "1";
        runtimeEnv.OPENCODE_CLIENT ??= "kronterm-agent";
    }
    const bunBinary = path.join(process.env.HOME || "", ".bun", "bin", "bun");
    if (!runtimeEnv.BUN_BINARY && !process.env.BUN_BINARY && isExecutablePath(bunBinary)) {
        runtimeEnv.BUN_BINARY = bunBinary;
    }

    const cleanEnv = await prepareCleanEnv(runtimeEnv);
    let executable = cliPath;
    if (backend === "kronoscode" && cliPath === "kronoscode") {
        executable = detectKronosCodeCli(config?.defaultCliPath) ?? (await detectCommand("kronoscode"));
        if (!executable) {
            throw new Error(
                "KronosCode executable is unavailable. Repair the managed runtime or set KRONTERM_KRONOSCODE_BIN to its executable path."
            );
        }
    }
    signal?.throwIfAborted();
    const spawnConfig = createSpawnConfig(executable, workingDir, acpArgs, cleanEnv as Record<string, string>);

    const detached = process.platform !== "win32";
    const child = spawn(spawnConfig.command, spawnConfig.args, {
        ...spawnConfig.options,
        detached,
    });

    if (detached) {
        child.unref();
    }

    return { child, isDetached: detached };
}

function isExecutablePath(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

function detectKronosCodeCli(defaultCliPath?: string): string | null {
    const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
    const candidates = [
        process.env.KRONOSCODE_BIN,
        process.env.KRONTERM_KRONOSCODE_BIN,
        resourcesPath ? path.join(resourcesPath, "agents", "kronoscode", "bin", "kronoscode") : null,
        path.join(process.cwd(), "agents", "kronoscode", "bin", "kronoscode"),
        path.resolve(import.meta.dirname, "..", "agents", "kronoscode", "bin", "kronoscode"),
        path.resolve(import.meta.dirname, "..", "..", "agents", "kronoscode", "bin", "kronoscode"),
        path.join(process.cwd(), "kronoscoder", "packages", "kronoscode", "bin", "kronoscode"),
        path.join(process.cwd(), "kronoscode", "bin", "kronoscode"),
        process.env.HOME ? path.join(process.env.HOME, ".kronoscode", "bin", "kronoscode") : null,
        process.env.HOME ? path.join(process.env.HOME, "bin", "kronoscode") : null,
        defaultCliPath,
    ].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.find((candidate) => isExecutablePath(candidate)) ?? null;
}

function detectHermesCli(defaultCliPath?: string): string | null {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const executableName = process.platform === "win32" ? "hermes.exe" : "hermes";
    const venvBinDir = process.platform === "win32" ? "Scripts" : "bin";
    const candidates = [
        process.env.HERMES_BIN,
        process.env.KRONTERM_HERMES_BIN,
        homeDir ? path.join(homeDir, ".hermes", "venvs", "kronterm-hermes", venvBinDir, executableName) : null,
        homeDir ? path.join(homeDir, ".hermes", "bin", executableName) : null,
        homeDir ? path.join(homeDir, ".local", "bin", executableName) : null,
        defaultCliPath,
    ].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.find((candidate) => isExecutablePath(candidate)) ?? null;
}

function detectCommand(command: string): Promise<string | null> {
    const whichCmd = process.platform === "win32" ? "where" : "which";
    return new Promise((resolve) => {
        execFile(whichCmd, [command], { timeout: 5000, encoding: "utf8" }, (error, stdout) => {
            resolve(error ? null : stdout.trim().split(/\r?\n/)[0] || null);
        });
    });
}

export async function detectOpenCodeCli(defaultCliPath?: string): Promise<string | null> {
    const candidates = [
        process.env.KRONTERM_OPENCODE_BIN,
        process.env.OPENCODE_BIN,
        defaultCliPath,
        path.join(os.homedir(), ".opencode", "bin", process.platform === "win32" ? "opencode.exe" : "opencode"),
    ].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.find((candidate) => isExecutablePath(candidate)) ?? (await detectCommand("opencode"));
}

async function detectKronTermAgentCli(defaultCliPath?: string): Promise<string | null> {
    const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
    const candidates = [
        process.env.KRONTERM_AGENT_BIN,
        resourcesPath ? path.join(resourcesPath, "agents", "kronterm-agent", "bin", "kronterm-agent") : null,
        path.resolve(import.meta.dirname, "..", "..", "agents", "kronterm-agent", "bin", "kronterm-agent"),
        defaultCliPath,
    ].filter((candidate): candidate is string => Boolean(candidate));
    return (
        candidates.find((candidate) => isExecutablePath(candidate)) ??
        (await detectCommand("kronterm-agent")) ??
        (await detectOpenCodeCli())
    );
}

export async function detectInstalledAgents(backend?: string): Promise<
    Array<{
        backend: string;
        name: string;
        cliPath: string;
        available: boolean;
        avatar?: string;
        description?: string;
        authRequired?: boolean;
        supportsStreaming?: boolean;
        acpArgs?: string[];
        skillsDirs?: string[];
    }>
> {
    const results: Array<{
        backend: string;
        name: string;
        cliPath: string;
        available: boolean;
        avatar?: string;
        description?: string;
        authRequired?: boolean;
        supportsStreaming?: boolean;
        acpArgs?: string[];
        skillsDirs?: string[];
    }> = [];

    const discovered = await Promise.all(
        Object.entries(ACP_BACKENDS_ALL).map(async ([id, config]) => {
            if ((backend != null && id !== backend) || id === "custom" || !config.enabled) return;

            const cliCommand = config.cliCommand;
            if (!cliCommand) {
                return {
                    backend: id,
                    name: config.name,
                    cliPath: config.defaultCliPath || "",
                    available: false,
                    avatar: config.avatar,
                    description: config.description,
                    authRequired: config.authRequired,
                    supportsStreaming: config.supportsStreaming,
                    acpArgs: config.acpArgs,
                    skillsDirs: config.skillsDirs,
                };
            }

            let available = false;
            let cliPath = config.defaultCliPath || cliCommand;

            if (id === "kronoscode") {
                const detectedCliPath = detectKronosCodeCli(config.defaultCliPath);
                if (detectedCliPath) {
                    available = true;
                    cliPath = detectedCliPath;
                }
            }

            if (id === "hermes") {
                const detectedCliPath = detectHermesCli(config.defaultCliPath);
                if (detectedCliPath) {
                    available = true;
                    cliPath = detectedCliPath;
                }
            }

            if (id === "kronterm-agent") {
                const detectedCliPath = await detectKronTermAgentCli(config.defaultCliPath);
                if (detectedCliPath) {
                    available = true;
                    cliPath = detectedCliPath;
                }
            }

            if (id === "opencode") {
                const detectedCliPath = await detectOpenCodeCli(config.defaultCliPath);
                if (detectedCliPath) {
                    available = true;
                    cliPath = detectedCliPath;
                }
            }

            if (config.defaultCliPath && isExecutablePath(config.defaultCliPath)) {
                if (!available) {
                    available = true;
                    cliPath = config.defaultCliPath;
                }
            }

            if (!available) {
                try {
                    const detected = await detectCommand(cliCommand);
                    available = detected != null;
                    if (detected) {
                        cliPath = detected;
                    }
                } catch {
                    available = false;
                }
            }

            if (!available && config.defaultCliPath) {
                const parts = config.defaultCliPath.split(/\s+/);
                const defaultCommand = parts[0];
                if (defaultCommand && !defaultCommand.includes("/") && defaultCommand !== cliCommand) {
                    try {
                        available = (await detectCommand(defaultCommand)) != null;
                    } catch {
                        available = false;
                    }
                }
                cliPath = config.defaultCliPath;
            }

            if (available && config.preferDefaultCliPath && config.defaultCliPath) {
                cliPath = config.defaultCliPath;
            }

            return {
                backend: id,
                name: config.name,
                cliPath,
                available,
                avatar: config.avatar,
                description: config.description,
                authRequired: config.authRequired,
                supportsStreaming: config.supportsStreaming,
                acpArgs: config.acpArgs,
                skillsDirs: config.skillsDirs,
            };
        })
    );
    for (const agent of discovered) {
        if (agent) results.push(agent);
    }

    return results;
}
