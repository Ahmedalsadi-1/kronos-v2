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
import { installHermesWorkflowPack } from "./hermes-workflow-packs";
import { getKronosCodeBinaryCandidates, KronosCodeRuntime, withKronosCodeAttachArgs } from "./kronoscode-runtime";
import { KronTermSurfaceSystemPrompt } from "./kronterm-surface-prompt";
import { startKronTermToolServer, type KronTermToolServerDescriptor } from "./kronterm-tool-server";
export { resolveAgentWsh as resolveHermesWsh } from "./agent-runtime-paths";

const StartupTimeoutMs = 90_000;
const HealthTimeoutMs = 10_000;
const RestartDelaysMs = [1_000, 3_000, 10_000];
const StableRuntimeMs = 60_000;
const ApiTimeoutMs = 15_000;
const SurfaceRefreshLeadMs = 10 * 60 * 1000;
const ExecFile = promisify(execFile);
const PluginPreparations = new Map<string, Promise<string>>();

type KronTermSkillRootOptions = {
    cwd?: string;
    homeDir?: string;
    resourcesPath?: string;
    configured?: string;
};

export type HermesSurfaceContext = {
    nativeCallerId?: string;
    workflowRunId?: string;
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
    const candidates = [
        process.env.KRONTERM_HERMES_BIN,
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
            return resolveManagedHermesLauncher(resolved);
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
        "Kronos agent runtime is not installed. Reinstall KronTerm or set KRONTERM_HERMES_BIN to the compatible runtime executable."
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
        await fs.promises.cp(adapterSource, path.join(staging, "kronterm-tools"), { recursive: true, force: true });
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
        path.join(cwd, ".agents", "skills"),
        path.resolve(import.meta.dirname, "..", ".agents", "skills"),
        resourcesPath ? path.join(resourcesPath, "kronterm-skills") : undefined,
        path.join(homeDir, ".agents", "skills"),
        path.join(homeDir, ".codex", "skills"),
        path.join(homeDir, ".hermes", "skills"),
    ];
    return Array.from(
        new Set(
            candidates
                .filter((candidate): candidate is string => Boolean(candidate))
                .map((candidate) => path.resolve(candidate))
                .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory())
        )
    );
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
        throw new Error("KronTerm's built-in Agent tool adapter is missing. Rebuild or reinstall KronTerm.");
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
            provider: "copilot-acp",
            model: "copilot-acp",
        },
        agent: {
            system_prompt: KronTermSurfaceSystemPrompt,
            reasoning_effort: "minimal",
            environment_probe: false,
            task_completion_guidance: false,
            max_turns: 30,
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

export function resolveKronosCodeDelegationBinary(): string | undefined {
    return getKronosCodeBinaryCandidates().find(existingExecutable);
}

export function makeHermesRuntimeEnvironment(
    binary: string,
    token: string,
    options: {
        managedDir?: string;
        kronosCodeBinary?: string;
        kronosCodeConnection?: { baseUrl: string; username: string; password?: string };
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
              }
            : {}),
        ...(options.toolServer
            ? {
                  HERMES_KRONTERM_NATIVE_TOOL_URL: options.toolServer.nativeUrl,
                  KRONTERM_NATIVE_TOOL_TOKEN: options.toolServer.token,
              }
            : {}),
        ...(options.enableKronTermTools ? { HERMES_TUI_TOOLSETS: "kronterm,hermes-cli,desktop_ui" } : {}),
        ...options.toolEnvironment,
        ...(options.kronosCodeBinary
            ? {
                  HERMES_COPILOT_ACP_COMMAND: options.kronosCodeBinary,
                  HERMES_COPILOT_ACP_ARGS: options.kronosCodeConnection
                      ? withKronosCodeAttachArgs(["acp"], options.kronosCodeConnection.baseUrl)
                            .map((argument) => `'${argument.replace(/'/g, `'"'"'`)}'`)
                            .join(" ")
                      : "acp",
              }
            : {}),
        ...(options.kronosCodeConnection
            ? {
                  KRONOSCODE_SERVER_USERNAME: options.kronosCodeConnection.username,
                  OPENCODE_SERVER_USERNAME: options.kronosCodeConnection.username,
                  KRONOSCODE_SERVER_PASSWORD: options.kronosCodeConnection.password ?? "",
                  OPENCODE_SERVER_PASSWORD: options.kronosCodeConnection.password ?? "",
              }
            : {}),
        PATH: makeHermesPath(binary, options.toolEnvironment),
    };
}

class ManagedHermesRuntime extends EventEmitter {
    private child: ChildProcessWithoutNullStreams | null = null;
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
    private delegationConnection: ReturnType<typeof KronosCodeRuntime.getInternalConnection> = null;

    constructor() {
        super();
        KronosCodeRuntime.on("connection", () => {
            const previous = this.delegationConnection;
            const next = KronosCodeRuntime.getInternalConnection();
            if (!previous || !next || this.stopping) {
                return;
            }
            if (
                previous.descriptor.baseUrl === next.descriptor.baseUrl &&
                previous.descriptor.serverInstanceId === next.descriptor.serverInstanceId &&
                previous.username === next.username &&
                previous.password === next.password
            ) {
                return;
            }
            this.startupGeneration += 1;
            this.startPromise = null;
            this.connection = null;
            this.delegationConnection = null;
            const child = this.child;
            this.child = null;
            if (child) {
                this.stopChild(child);
            }
            this.scheduleRestart();
        });
    }

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
        const token = await RpcApi.CreateSurfaceTokenCommand(ElectronWshClient, {
            tabid: context.tabId,
            blockid: context.blockId ?? "",
        });
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

    async api<T = unknown>(request: HermesApiRequest): Promise<T> {
        if (request.body != null && request.upload != null) {
            throw new Error("Hermes API requests cannot contain both JSON and an upload.");
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
                throw new Error(`Timed out connecting to the KronTerm Agent after ${timeoutMs}ms`);
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
        const kronosCodeBinary = resolveKronosCodeDelegationBinary();
        if (!kronosCodeBinary) {
            throw new Error("KronosCode executable not found for Hermes delegation.");
        }
        await KronosCodeRuntime.ensure();
        if (generation !== this.startupGeneration) {
            throw new Error("Hermes startup was cancelled.");
        }
        const kronosCodeConnection = KronosCodeRuntime.getInternalConnection();
        if (!kronosCodeConnection) {
            throw new Error("KronosCode disconnected before Hermes delegation could attach.");
        }
        const token = randomBytes(32).toString("base64url");
        const capabilityFile = this.capabilityFilePath();
        const managedDir = this.managedConfigDir();
        const toolServer = await startKronTermToolServer(() => this.surfaceContext, "hermes");
        if (generation !== this.startupGeneration) {
            throw new Error("Hermes startup was cancelled.");
        }
        this.delegationConnection = kronosCodeConnection;
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
                kronosCodeBinary,
                kronosCodeConnection: {
                    baseUrl: kronosCodeConnection.descriptor.baseUrl,
                    username: kronosCodeConnection.username,
                    password: kronosCodeConnection.password,
                },
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
        this.stopping = true;
        this.startupGeneration += 1;
        this.delegationConnection = null;
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
