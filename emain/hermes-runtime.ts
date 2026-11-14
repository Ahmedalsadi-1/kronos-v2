// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveAgentWsh } from "./agent-runtime-paths";
import { DelegationWallTimeoutSeconds } from "./delegation-policy";
import { installHermesWorkflowPack } from "./hermes-workflow-packs";
import { KronTermSurfaceSystemPrompt } from "./kronterm-surface-prompt";
import {
    kronTermToolManifest,
    revokeKronTermToolCaller,
    startKronTermToolServer,
    type KronTermToolServerDescriptor,
} from "./kronterm-tool-server";
import { prepareWorkflowProfile, runHermesWorkflowWorker } from "./n8n-hermes-worker";
import { N8nRuntime } from "./n8n-runtime";
import type { N8nWorkspace, N8nWorkspaceCommand } from "./n8n-workspace";
import { resolveKronTermSharedSkillDirs } from "./shared-skill-roots";
export { resolveKronTermSharedSkillDirs } from "./shared-skill-roots";
import type { SwarmTarget } from "./swarm-target-scope";
export { resolveAgentWsh as resolveHermesWsh } from "./agent-runtime-paths";

const StartupTimeoutMs = 90_000;
const HealthTimeoutMs = 10_000;
const RestartDelaysMs = [1_000, 3_000, 10_000];
const StableRuntimeMs = 60_000;
const ApiTimeoutMs = 15_000;
const SurfaceTokenTimeoutMs = 10_000;
const SurfaceRefreshLeadMs = 10 * 60 * 1000;
const ExecFile = promisify(execFile);
const PluginPreparations = new Map<string, Promise<string>>();



export type HermesSurfaceContext = {
    agentWorkspace?: string;
    chatId?: string;
    n8nWorkerId?: string;
    n8nEditorId?: number;
    n8nWorkflowId?: string;
    sandboxComputerId?: string;
    sandboxComputerGeneration?: number;
    sandboxComputerMode?: "sandbox" | "hybrid";
    agentRuntime?: "hermes";
    delegationScope?: "sandbox" | "widgets" | "inherit";
    toolSessionId?: string;
    nativeCallerId?: string;
    workflowRunId?: string;
    swarmRunId?: string;
    swarmAttemptId?: string;
    swarmSessionId?: string;
    swarmPlanning?: boolean;
    swarmTarget?: SwarmTarget;
    tabId?: string;
    blockId?: string;
    workspaceId?: string;
    hostMode?: "kronterm" | "web-fullscreen";
    capabilities?: HermesWebCapabilities;
};

export type HermesWebCapabilities = {
    browser: boolean;
    terminal: boolean;
    files: boolean;
    sandbox: boolean;
    computerControl: boolean;
    customTools?: Record<string, boolean>;
};

export type HermesConnectionDescriptor = {
    baseUrl: string;
    wsUrl: string;
    token: string;
    pid: number;
};

export type HermesApiRequest = {
    path: string;
    method?: string;
    body?: unknown;
    upload?: { filename: string; contentType?: string; bytes: ArrayBuffer };
    timeoutMs?: number;
    profile?: string | null;
};

export function makeHermesApiUrl(baseUrl: string, requestPath: string, profile?: string | null): URL {
    if (!requestPath.startsWith("/") || requestPath.startsWith("//")) {
        throw new Error("Hermes API paths must be absolute backend paths.");
    }
    const url = new URL(requestPath, `${baseUrl}/`);
    if (profile?.trim()) {
        url.searchParams.set("profile", profile.trim());
    }
    return url;
}

function resolveApiTimeoutMs(timeoutMs: number | undefined): number {
    if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        return timeoutMs;
    }
    return ApiTimeoutMs;
}

function existingExecutable(candidate: string | undefined): string | undefined {
    if (!candidate) {
        return undefined;
    }
    try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
    } catch {
        return undefined;
    }
}

export function parseHermesReadyPort(output: string): number | undefined {
    const match = /(?:^|\n)HERMES_(?:BACKEND|DASHBOARD)_READY port=(\d+)(?:\r?$|\s)/m.exec(output);
    if (!match) {
        return undefined;
    }
    const port = Number(match[1]);
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : undefined;
}

async function resolveManagedHermesLauncher(binary: string): Promise<string> {
    const python = ["python", "python3", "python.exe"]
        .map((name) => path.join(path.dirname(binary), name))
        .find(existingExecutable);
    if (!python) return binary;
    const probe = await ExecFile(
        python,
        [
            "-c",
            'import hermes_cli.main; from pm.environments import project_python; from pm.paths import repo_root; print(project_python(repo_root()).parent / "hermes")',
        ],
        {
            encoding: "utf8",
            timeout: 15_000,
            windowsHide: true,
            env: { ...process.env, HERMES_DISABLE_LAZY_INSTALLS: "1" },
        }
    ).catch(() => null);
    const candidate = probe?.stdout.trim().split(/\r?\n/).slice(-1)[0];
    return existingExecutable(candidate) ?? binary;
}

async function resolveHermesBinary(): Promise<string> {
    const homeDir = os.homedir();
    const executable = process.platform === "win32" ? "hermes.exe" : "hermes";
    const preparedRoot = path.join(homeDir, ".kronterm", "runtimes", "hermes-0.22.5");
    const preparedBinary = fs.existsSync(path.join(preparedRoot, "ready.json"))
        ? path.join(preparedRoot, "source", ".venv", process.platform === "win32" ? "Scripts" : "bin", executable)
        : undefined;
    const candidates = [
        process.env.KRONTERM_HERMES_BIN,
        preparedBinary,
        process.env.HERMES_BIN,
        path.join(
            homeDir,
            ".hermes",
            "venvs",
            "kronterm-hermes",
            process.platform === "win32" ? "Scripts" : "bin",
            executable
        ),
        path.join(homeDir, ".hermes", "bin", executable),
        path.join(homeDir, ".local", "bin", executable),
        process.platform === "darwin" ? `/opt/homebrew/bin/${executable}` : undefined,
        process.platform === "darwin" ? `/usr/local/bin/${executable}` : undefined,
    ];
    for (const candidate of candidates) {
        const resolved = existingExecutable(candidate);
        if (resolved) {
            return resolved === preparedBinary ? resolved : resolveManagedHermesLauncher(resolved);
        }
    }

    const lookup = await ExecFile(process.platform === "win32" ? "where" : "which", [executable], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5_000,
    }).catch(() => null);
    const fromPath = lookup?.stdout.trim().split(/\r?\n/, 1)[0];
    const resolved = existingExecutable(fromPath);
    if (resolved) {
        return resolveManagedHermesLauncher(resolved);
    }

    throw new Error(
        "KronOS Agent runtime is not installed. Reinstall KronOS or set KRONTERM_HERMES_BIN to the compatible runtime executable."
    );
}

function makeHermesPath(binary: string, toolEnvironment?: Record<string, string>): string {
    const wshPath = toolEnvironment?.KRONTERM_WSH;
    const entries = [
        path.dirname(binary),
        wshPath && path.isAbsolute(wshPath) ? path.dirname(wshPath) : undefined,
        path.join(os.homedir(), ".bun", "bin"),
        process.platform === "darwin" ? "/opt/homebrew/bin" : undefined,
        process.platform === "darwin" ? "/usr/local/bin" : undefined,
        process.env.PATH,
    ]
        .filter(Boolean)
        .flatMap((entry) => entry.split(path.delimiter));
    return Array.from(new Set(entries)).join(path.delimiter);
}

export function prepareHermesBundledPlugins(
    binary: string,
    target: string,
    adapterSource: string,
    assertCurrent: () => void = () => {}
): Promise<string> {
    const key = path.resolve(target);
    const previous = PluginPreparations.get(key) ?? Promise.resolve();
    const preparation = previous
        .catch(() => undefined)
        .then(() => stageHermesBundledPlugins(binary, key, adapterSource, assertCurrent));
    PluginPreparations.set(key, preparation);
    return preparation.finally(() => {
        if (PluginPreparations.get(key) === preparation) PluginPreparations.delete(key);
    });
}

async function stageHermesBundledPlugins(
    binary: string,
    target: string,
    adapterSource: string,
    assertCurrent: () => void
): Promise<string> {
    assertCurrent();
    let bundledRoot = process.env.HERMES_BUNDLED_PLUGINS;
    if (!bundledRoot) {
        const python = ["python", "python3", "python.exe"]
            .map((name) => path.join(path.dirname(binary), name))
            .find(existingExecutable);
        if (python) {
            const probe = await ExecFile(
                python,
                [
                    "-c",
                    "import importlib.util, pathlib; spec = importlib.util.find_spec('hermes_cli'); print(pathlib.Path(next(iter(spec.submodule_search_locations))).parent / 'plugins')",
                ],
                {
                    encoding: "utf8",
                    timeout: 5_000,
                    windowsHide: true,
                }
            ).catch(() => null);
            if (probe) {
                bundledRoot = probe.stdout.trim();
            }
        }
    }
    assertCurrent();
    await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const staging = await fs.promises.mkdtemp(path.join(path.dirname(target), ".plugins-"));
    const backup = `${staging}.previous`;
    let hasBackup = false;
    let published = false;
    let completed = false;
    try {
        const existing = await fs.promises.lstat(target).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "ENOENT") throw error;
            return null;
        });
        if (existing) {
            await fs.promises.cp(target, staging, { recursive: true, force: true, verbatimSymlinks: true });
        }
        // Hermes must never scan an adapter while it is still being copied.
        if (bundledRoot && fs.existsSync(bundledRoot)) {
            for (const name of await fs.promises.readdir(bundledRoot)) {
                if (name === "kronterm-tools") continue;
                const destination = path.join(staging, name);
                const source = path.resolve(bundledRoot, name);
                await fs.promises.rm(destination, { recursive: true, force: true });
                if ((await fs.promises.stat(source)).isDirectory()) {
                    await fs.promises.symlink(source, destination, "junction");
                } else {
                    await fs.promises.copyFile(source, destination);
                }
            }
        }
        await fs.promises.rm(path.join(staging, "kronterm-tools"), { recursive: true, force: true });
        const adapterTarget = path.join(staging, "kronterm-tools");
        await fs.promises.cp(adapterSource, adapterTarget, { recursive: true, force: true });
        const harnessFilename =
            process.platform === "darwin"
                ? "libkronos_agent_harness.dylib"
                : process.platform === "win32"
                  ? "kronos_agent_harness.dll"
                  : "libkronos_agent_harness.so";
        const developmentHarness = path.resolve(adapterSource, "../../harness/target/release", harnessFilename);
        if (fs.existsSync(developmentHarness)) {
            await fs.promises.copyFile(developmentHarness, path.join(adapterTarget, harnessFilename));
        }
        for (const name of ["orgo-computer", "advanced-delegation"]) {
            const source = path.join(path.dirname(adapterSource), name);
            if (!fs.existsSync(source)) continue;
            await fs.promises.rm(path.join(staging, name), { recursive: true, force: true });
            await fs.promises.cp(source, path.join(staging, name), { recursive: true, force: true });
        }
        assertCurrent();
        try {
            await fs.promises.rename(target, backup);
            hasBackup = true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        assertCurrent();
        await fs.promises.rename(staging, target);
        published = true;
        assertCurrent();
        completed = true;
        return target;
    } catch (error) {
        if (published) await fs.promises.rm(target, { recursive: true, force: true });
        if (hasBackup) await fs.promises.rename(backup, target);
        throw error;
    } finally {
        await fs.promises.rm(staging, { recursive: true, force: true });
        if (completed) await fs.promises.rm(backup, { recursive: true, force: true });
    }
}


function resolveHermesToolAdapterRoot(): string {
    const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
    const candidates = [
        process.env.KRONTERM_HERMES_PLUGINS,
        path.join(process.cwd(), "agents", "hermes", "plugins"),
        path.resolve(import.meta.dirname, "..", "agents", "hermes", "plugins"),
        resourcesPath ? path.join(resourcesPath, "hermes-plugins") : undefined,
    ];
    const resolved = candidates.find(
        (candidate): candidate is string =>
            Boolean(candidate) && fs.existsSync(candidate!) && fs.statSync(candidate!).isDirectory()
    );
    if (!resolved) {
        throw new Error("KronOS's built-in Agent tool adapter is missing. Rebuild or reinstall KronOS.");
    }
    return resolved;
}

export function makeKronTermToolEnvironment(
    capabilityFile: string,
    wshPath: string,
    workspace: string,
    sharedSkillDirs: string[]
): Record<string, string> {
    return {
        ELECTRON_RUN_AS_NODE: "1",
        KRONTERM_SURFACE_CAPABILITY_FILE: capabilityFile,
        KRONTERM_WSH: wshPath,
        WAVETERM_WSH: wshPath,
        KRONTERM_WORKSPACE: workspace,
        ...(sharedSkillDirs.length > 0 ? { KRONTERM_SHARED_SKILL_DIRS: sharedSkillDirs.join(path.delimiter) } : {}),
    };
}

export function makeHermesManagedConfig(toolServer?: KronTermToolServerDescriptor): Record<string, unknown> {
    return {
        delegation: {
            backend: "kronterm_smart",
            max_concurrent_children: 2,
            max_spawn_depth: 1,
            max_iterations: 20,
            child_timeout_seconds: 180,
            kronos_wall_timeout_seconds: DelegationWallTimeoutSeconds,
        },
        agent: {
            system_prompt: KronTermSurfaceSystemPrompt,
            reasoning_effort: "medium",
            environment_probe: false,
            stall_guards: true,
            task_completion_guidance: true,
            parallel_tool_call_guidance: true,
            max_turns: 45,
        },
        display: {
            personality: "",
        },
        tools: {
            tool_search: {
                enabled: "off",
            },
        },
    };
}

export function makeHermesRuntimeEnvironment(
    binary: string,
    token: string,
    options: {
        managedDir?: string;
        toolEnvironment?: Record<string, string>;
        enableKronTermTools?: boolean;
        toolServer?: KronTermToolServerDescriptor;
    } = {}
): NodeJS.ProcessEnv {
    return {
        ...process.env,
        HERMES_DASHBOARD_SESSION_TOKEN: token,
        HERMES_DESKTOP: "1",
        HERMES_DISABLE_LAZY_INSTALLS: "1",
        HERMES_PARENT_PID: String(process.pid),
        HERMES_EPHEMERAL_SYSTEM_PROMPT: KronTermSurfaceSystemPrompt,
        ...(options.managedDir
            ? {
                  HERMES_MANAGED_DIR: options.managedDir,
                  HERMES_BUNDLED_PLUGINS: path.join(options.managedDir, "plugins"),
                  KRONTERM_TOOL_MANIFEST_FILE: path.join(options.managedDir, "tool-manifest.json"),
              }
            : {}),
        ...(options.toolServer
            ? {
                  HERMES_KRONTERM_NATIVE_TOOL_URL: options.toolServer.nativeUrl,
                  KRONTERM_NATIVE_TOOL_TOKEN: options.toolServer.token,
              }
            : {}),
        ...(options.enableKronTermTools ? { HERMES_TUI_TOOLSETS: "kronterm,delegation,terminal,file" } : {}),
        ...options.toolEnvironment,
        PATH: makeHermesPath(binary, options.toolEnvironment),
    };
}

class ManagedHermesRuntime extends EventEmitter {
    private child: ChildProcessWithoutNullStreams | null = null;
    private n8n = new N8nRuntime();
    private workflowWidgets: N8nWorkspace;
    private workflowWorkers = new AbortController();
    private connection: HermesConnectionDescriptor | null = null;
    private startPromise: Promise<HermesConnectionDescriptor> | null = null;
    private restartTimer: NodeJS.Timeout | null = null;
    private stopping = false;
    private restartAttempt = 0;
    private readyAt = 0;
    private surfaceContext: HermesSurfaceContext | null = null;
    private surfaceRefreshTimer: NodeJS.Timeout | null = null;
    private surfaceCapabilityReady = false;
    private surfaceGeneration = 0;
    private startupGeneration = 0;

    ensure(): Promise<HermesConnectionDescriptor> {
        return this.ensureRuntime(false);
    }

    private ensureRuntime(automaticRestart: boolean): Promise<HermesConnectionDescriptor> {
        if (this.connection && this.child && this.child.exitCode == null) {
            return Promise.resolve(this.connection);
        }
        if (this.startPromise) {
            return this.startPromise;
        }
        if (!automaticRestart) {
            this.restartAttempt = 0;
            if (this.restartTimer) {
                clearTimeout(this.restartTimer);
                this.restartTimer = null;
            }
        }
        this.stopping = false;
        const generation = ++this.startupGeneration;
        const startPromise = this.start(generation)
            .catch((error) => {
                if (generation === this.startupGeneration) {
                    revokeKronTermToolCaller("hermes");
                    this.scheduleRestart();
                }
                throw error;
            })
            .finally(() => {
                if (this.startPromise === startPromise) {
                    this.startPromise = null;
                }
            });
        this.startPromise = startPromise;
        return this.startPromise;
    }

    async ensureSurface(context: HermesSurfaceContext = {}): Promise<HermesConnectionDescriptor> {
        const previousContext = this.surfaceContext;
        if (context.tabId) {
            this.surfaceContext = { ...context };
        }
        const connection = await this.ensure();
        if (context.tabId) {
            if (
                this.surfaceCapabilityReady &&
                previousContext?.tabId === context.tabId &&
                previousContext.workspaceId === context.workspaceId &&
                previousContext.blockId === context.blockId &&
                previousContext.hostMode === context.hostMode &&
                JSON.stringify(previousContext.capabilities) === JSON.stringify(context.capabilities)
            ) {
                return connection;
            }
            const generation = ++this.surfaceGeneration;
            await this.refreshSurfaceCapability(generation);
        }
        return connection;
    }

    private capabilityFilePath(): string {
        return path.join(os.tmpdir(), `kronterm-${process.pid}`, "hermes-surface-capability.json");
    }

    private managedConfigDir(): string {
        return path.join(os.tmpdir(), `kronterm-${process.pid}`, "hermes-managed");
    }

    private async refreshSurfaceCapability(generation: number): Promise<void> {
        const context = this.surfaceContext;
        if (!context?.tabId) {
            return;
        }
        const [{ RpcApi }, { ElectronWshClient }] = await Promise.all([
            import("../frontend/app/store/wshclientapi"),
            import("./emain-wsh"),
        ]);
        let token: CommandCreateSurfaceTokenRtnData;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                token = await RpcApi.CreateSurfaceTokenCommand(
                    ElectronWshClient,
                    {
                        tabid: context.tabId,
                        blockid: context.blockId ?? "",
                    },
                    { timeout: SurfaceTokenTimeoutMs }
                );
                break;
            } catch (error) {
                if (
                    generation !== this.surfaceGeneration ||
                    attempt > 0 ||
                    !/EC-TIME|timeout|disconnected|no route/i.test(String(error))
                )
                    throw error;
                console.log("[hermes] surface capability transport interrupted; retrying");
            }
        }
        if (generation !== this.surfaceGeneration) {
            return;
        }
        const capabilityFile = this.capabilityFilePath();
        fs.mkdirSync(path.dirname(capabilityFile), { recursive: true, mode: 0o700 });
        fs.writeFileSync(
            capabilityFile,
            JSON.stringify({
                token: token.token,
                tabId: token.tabid,
                blockId: token.blockid ?? "",
                workspaceId: context.workspaceId ?? "",
                hostMode: context.hostMode ?? "kronterm",
                capabilities: context.capabilities,
            }),
            { encoding: "utf8", mode: 0o600 }
        );
        fs.chmodSync(capabilityFile, 0o600);
        this.surfaceCapabilityReady = true;
        if (this.surfaceRefreshTimer) {
            clearTimeout(this.surfaceRefreshTimer);
        }
        const delay = Math.max(30_000, token.expiresat - Date.now() - SurfaceRefreshLeadMs);
        this.surfaceRefreshTimer = setTimeout(() => {
            this.surfaceRefreshTimer = null;
            void this.refreshSurfaceCapability(generation).catch((error) =>
                console.log("Hermes surface capability refresh failed", error)
            );
        }, delay);
        this.surfaceRefreshTimer.unref();
    }

    private scheduleRestart(): void {
        if (this.stopping || this.restartTimer) {
            return;
        }
        if (this.restartAttempt >= RestartDelaysMs.length) {
            this.emit("runtime-failure", {
                message: "Hermes stopped after three recovery attempts. Retry to restart.",
            });
            return;
        }
        const delay = RestartDelaysMs[this.restartAttempt++];
        this.restartTimer = setTimeout(() => {
            this.restartTimer = null;
            void this.ensureRuntime(true).catch((error) => console.log("Hermes automatic restart failed", error));
        }, delay);
        this.restartTimer.unref();
    }

    async n8nCommand(
        input: N8nWorkspaceCommand,
        context: HermesSurfaceContext,
        signal?: AbortSignal
    ): Promise<unknown> {
        if (!["state", "runtime-status", "hide-desktop", "editor-cancel"].includes(input.operation)) await this.ensure();
        if (!this.workflowWidgets) {
            const { N8nWorkspace } = await import("./n8n-workspace");
            this.workflowWidgets ??= new N8nWorkspace(
                this.n8n,
                async (task, scope, abort) => {
                    this.n8n.assertScope(scope);
                    await prepareWorkflowProfile(<T>(request: HermesApiRequest) => this.api<T>(request));
                    const connection = await this.ensure();
                    return runHermesWorkflowWorker(connection, task, scope, abort);
                },
                undefined,
                () => {
                    this.workflowWorkers.abort();
                    this.workflowWorkers = new AbortController();
                }
            );
        }
        const abort = signal ? AbortSignal.any([signal, this.workflowWorkers.signal]) : this.workflowWorkers.signal;
        return this.workflowWidgets.command(input, context, abort);
    }

    async api<T = unknown>(request: HermesApiRequest, callerContext?: HermesSurfaceContext): Promise<T> {
        if (request.body != null && request.upload != null) {
            throw new Error("Hermes API requests cannot contain both JSON and an upload.");
        }
        if (request.path === "/api/kronterm/n8n/command") {
            if (
                request.method !== "POST" ||
                request.upload != null ||
                !request.body ||
                typeof request.body !== "object"
            )
                throw new Error("Workflow commands require a JSON POST.");
            return this.n8nCommand(
                request.body as N8nWorkspaceCommand,
                callerContext ?? this.surfaceContext
            ) as Promise<T>;
        }
        if (request.path === "/api/kronterm/n8n") {
            if (request.upload != null || request.body != null)
                throw new Error("n8n runtime requests do not accept a body.");
            if (request.method === "POST") {
                const context = callerContext
                    ? {
                          ...(callerContext.tabId === this.surfaceContext?.tabId ? this.surfaceContext : {}),
                          ...callerContext,
                      }
                    : this.surfaceContext;
                return (await this.n8nCommand({ operation: "open", surface: "canvas" }, context)) as T;
            }
            if (request.method === "DELETE") {
                this.workflowWorkers.abort();
                this.workflowWorkers = new AbortController();
                return this.n8n.stop() as T;
            }
            if (request.method == null || request.method === "GET") return this.n8n.status() as T;
            throw new Error("Unsupported n8n runtime request.");
        }
        if (request.path === "/api/kronterm/workflow-packs/install") {
            if (request.method !== "POST" || request.upload != null) {
                throw new Error("Workflow pack installation requires a JSON POST request.");
            }
            const status = await this.api<{ hermes_home: string }>({ path: "/api/status", profile: request.profile });
            return (await installHermesWorkflowPack(request.body, status.hermes_home)) as T;
        }
        const connection = await this.ensure();
        const url = makeHermesApiUrl(connection.baseUrl, request.path, request.profile);
        const timeoutMs = resolveApiTimeoutMs(request.timeoutMs);
        let body: BodyInit | undefined;
        const headers: Record<string, string> = { "X-Hermes-Session-Token": connection.token };

        if (request.upload) {
            const form = new FormData();
            const filename = String(request.upload.filename || "file").replace(/["\r\n]/g, "_");
            form.append(
                "file",
                new Blob([request.upload.bytes], {
                    type: request.upload.contentType || "application/octet-stream",
                }),
                filename
            );
            body = form;
        } else if (request.body !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(request.body);
        }

        let response: Response;
        try {
            response = await fetch(url, {
                method: request.method || "GET",
                headers,
                body,
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === "TimeoutError") {
                throw new Error(`Timed out connecting to the KronOS Agent after ${timeoutMs}ms`);
            }
            throw error;
        }

        const text = await response.text();
        if (!response.ok) {
            throw new Error(`${response.status}: ${text || response.statusText}`);
        }
        if (!text) {
            return null as T;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (/^\s*<(?:!doctype|html)/i.test(text) || contentType.includes("text/html")) {
            throw new Error(
                `Expected JSON from ${url.toString()} but got HTML (status ${response.status}). ` +
                    "The endpoint is likely missing on the Kronos backend."
            );
        }
        try {
            return JSON.parse(text) as T;
        } catch {
            throw new Error(`Invalid JSON from ${url.toString()} (status ${response.status}): ${text.slice(0, 200)}`);
        }
    }

    private async start(generation: number): Promise<HermesConnectionDescriptor> {
        const assertCurrent = () => {
            if (generation !== this.startupGeneration) throw new Error("Hermes startup was cancelled.");
        };
        const binary = await resolveHermesBinary();
        assertCurrent();
        const token = randomBytes(32).toString("base64url");
        const capabilityFile = this.capabilityFilePath();
        const managedDir = this.managedConfigDir();
        const toolServer = await startKronTermToolServer(
            () => ({ ...this.surfaceContext, agentRuntime: "hermes" }),
            "hermes"
        );
        if (generation !== this.startupGeneration) {
            throw new Error("Hermes startup was cancelled.");
        }
        const wshPath = resolveAgentWsh();
        fs.mkdirSync(managedDir, { recursive: true, mode: 0o700 });
        await prepareHermesBundledPlugins(
            binary,
            path.join(managedDir, "plugins"),
            path.join(resolveHermesToolAdapterRoot(), "kronterm-tools"),
            assertCurrent
        );
        assertCurrent();
        fs.writeFileSync(
            path.join(managedDir, "tool-manifest.json"),
            JSON.stringify({ tools: kronTermToolManifest() }),
            { encoding: "utf8", mode: 0o600 }
        );
        fs.writeFileSync(
            path.join(managedDir, "config.yaml"),
            JSON.stringify(makeHermesManagedConfig(toolServer), null, 2),
            {
                encoding: "utf8",
                mode: 0o600,
            }
        );
        const child = spawn(binary, ["serve", "--host", "127.0.0.1", "--port", "0"], {
            env: makeHermesRuntimeEnvironment(binary, token, {
                managedDir,
                enableKronTermTools: true,
                toolServer,
                toolEnvironment: makeKronTermToolEnvironment(
                    capabilityFile,
                    wshPath,
                    process.cwd(),
                    resolveKronTermSharedSkillDirs()
                ),
            }),
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });
        this.child = child;
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk: string) => {
            stderr = `${stderr}${chunk}`.slice(-8_000);
            console.log(`[hermes] ${chunk.trimEnd()}`);
        });

        const port = await new Promise<number>((resolve, reject) => {
            let settled = false;
            const finish = (error?: Error, readyPort?: number) => {
                if (settled) {
                    return;
                }
                settled = true;
                clearTimeout(timer);
                child.removeListener("error", onError);
                child.removeListener("exit", onEarlyExit);
                if (error) {
                    reject(error);
                    return;
                }
                resolve(readyPort!);
            };
            const onError = (error: Error) => finish(error);
            const onEarlyExit = (code: number | null, signal: NodeJS.Signals | null) =>
                finish(
                    new Error(
                        `Hermes exited before becoming ready (code ${String(code)}, signal ${String(signal)}). ${stderr.trim()}`
                    )
                );
            const timer = setTimeout(() => {
                this.stopChild(child);
                finish(
                    new Error(`Hermes did not become ready within ${StartupTimeoutMs / 1000} seconds. ${stderr.trim()}`)
                );
            }, StartupTimeoutMs);

            child.on("error", onError);
            child.on("exit", onEarlyExit);
            child.stdout.on("data", (chunk: string) => {
                stdout = `${stdout}${chunk}`.slice(-8_000);
                console.log(`[hermes] ${chunk.trimEnd()}`);
                const readyPort = parseHermesReadyPort(stdout);
                if (readyPort) {
                    finish(undefined, readyPort);
                }
            });
        }).catch((error) => {
            this.stopChild(child);
            if (this.child === child) {
                this.child = null;
            }
            throw error;
        });

        const baseUrl = `http://127.0.0.1:${port}`;
        try {
            const response = await fetch(`${baseUrl}/api/status`, {
                headers: { "X-Hermes-Session-Token": token },
                signal: AbortSignal.timeout(HealthTimeoutMs),
            });
            if (!response.ok) {
                throw new Error(`Hermes health check failed with HTTP ${response.status}.`);
            }
        } catch (error) {
            this.stopChild(child);
            if (this.child === child) {
                this.child = null;
            }
            throw error;
        }

        const descriptor: HermesConnectionDescriptor = {
            baseUrl,
            wsUrl: `ws://127.0.0.1:${port}/api/ws?token=${encodeURIComponent(token)}`,
            token,
            pid: child.pid!,
        };
        if (generation !== this.startupGeneration) {
            this.stopChild(child);
            throw new Error("Hermes startup was cancelled.");
        }
        this.connection = descriptor;
        this.readyAt = Date.now();
        this.surfaceCapabilityReady = fs.existsSync(capabilityFile);
        this.emit("connection", descriptor);
        child.once("exit", (code, signal) => {
            if (this.child !== child) {
                return;
            }
            this.child = null;
            this.connection = null;
            revokeKronTermToolCaller("hermes");
            if (!this.stopping) {
                if (Date.now() - this.readyAt >= StableRuntimeMs) {
                    this.restartAttempt = 0;
                }
                console.log(`[hermes] backend exited (code ${String(code)}, signal ${String(signal)})`);
                this.scheduleRestart();
            }
        });
        if (this.surfaceContext?.tabId) {
            const generation = ++this.surfaceGeneration;
            await this.refreshSurfaceCapability(generation).catch((error) =>
                console.log("Hermes surface capability restore failed", error)
            );
        }
        console.log(`[hermes] managed backend ready at ${baseUrl} (pid ${descriptor.pid})`);
        return descriptor;
    }

    private stopChild(child: ChildProcessWithoutNullStreams): void {
        if (child.exitCode != null || child.signalCode != null) {
            return;
        }
        const signalChild = (signal: NodeJS.Signals) => {
            if (process.platform !== "win32" && child.pid) {
                try {
                    process.kill(-child.pid, signal);
                    return;
                } catch {
                    // The process may have exited between the check and signal.
                }
            }
            child.kill(signal);
        };
        signalChild("SIGTERM");
        setTimeout(() => {
            if (child.exitCode == null && child.signalCode == null) {
                signalChild("SIGKILL");
            }
        }, 3_000).unref();
    }

    stop(): void {
        this.workflowWorkers.abort();
        this.workflowWorkers = new AbortController();
        this.n8n.stop();
        this.stopping = true;
        this.startupGeneration += 1;
        revokeKronTermToolCaller("hermes");
        this.connection = null;
        this.startPromise = null;
        this.surfaceContext = null;
        this.surfaceGeneration += 1;
        this.surfaceCapabilityReady = false;
        if (this.surfaceRefreshTimer) {
            clearTimeout(this.surfaceRefreshTimer);
            this.surfaceRefreshTimer = null;
        }
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        const capabilityFile = this.capabilityFilePath();
        try {
            if (fs.existsSync(capabilityFile)) {
                fs.unlinkSync(capabilityFile);
            }
        } catch (error) {
            console.log("Hermes surface capability cleanup failed", error);
        }
        try {
            const managedConfig = path.join(this.managedConfigDir(), "config.yaml");
            if (fs.existsSync(managedConfig)) {
                fs.unlinkSync(managedConfig);
            }
            // The managed directory can already be gone when a renderer or the
            // runtime exits concurrently. `rm(..., force)` makes shutdown
            // idempotent without masking failures for other cleanup steps.
            fs.rmSync(this.managedConfigDir(), { recursive: true, force: true });
        } catch (error) {
            console.log("Hermes managed overlay cleanup failed", error);
        }
        const child = this.child;
        this.child = null;
        if (!child || child.exitCode != null) {
            return;
        }
        this.stopChild(child);
    }
}

export const HermesRuntime = new ManagedHermesRuntime();
