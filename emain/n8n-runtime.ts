// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { revokeManagedRuntimeRequests } from "./authkey";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { revokeKronTermToolCaller, startKronTermToolServer } from "./kronterm-tool-server";
import type { N8nWorkflowDraft } from "./n8n-builder";
import { validateN8nDraft } from "./n8n-builder";
import { releaseN8nRequests } from "./n8n-client";
import { writeN8nWidgetNodes } from "./n8n-widget-nodes";
import { n8nScopeKey } from "./n8n-workspace-store";
import { registerWorkflowSession, releaseWorkflowSession, workflowAccount } from "./workflow-account";

const StartupTimeoutMs = 90_000;

export type N8nRuntimeStatus = { running: boolean; url?: string; occupiedGeneration?: number };

export function resolveN8nPaths(): { root: string; bin: string; extensions: string } {
    const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    const roots = [
        resources && path.join(resources, "n8n"),
        path.resolve(import.meta.dirname, "../integrations/n8n"),
        path.resolve(import.meta.dirname, "../../integrations/n8n"),
    ].filter(Boolean);
    for (const root of roots) {
        for (const bin of [
            path.join(root, "runtime/bin/n8n"),
            path.join(root, "upstream/packages/cli/bin/n8n"),
            path.join(root, "upstream/compiled/bin/n8n"),
        ]) {
            if (fs.existsSync(bin) && fs.existsSync(path.resolve(bin, "../../dist/command-registry.js"))) {
                return { root, bin, extensions: path.join(root, "nodes") };
            }
        }
    }
    throw new Error("n8n is not built. Run node integrations/n8n/prepare.mjs with Node.js 24 or newer.");
}

async function freePort(): Promise<number> {
    const server = createServer();
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = address && typeof address !== "string" ? address.port : 0;
            server.close((error) => (error ? reject(error) : resolve(port)));
        });
    });
}

export async function n8nCatalogReady(data: string): Promise<boolean> {
    const folder = path.join(data, ".cache/n8n/public/types");
    try {
        // n8n writes the catalog after its health endpoint becomes ready.
        const [credentialsJson, nodesJson] = await Promise.all([
            fs.promises.readFile(path.join(folder, "credentials.json"), "utf8"),
            fs.promises.readFile(path.join(folder, "nodes.json"), "utf8"),
        ]);
        JSON.parse(credentialsJson);
        const nodes = JSON.parse(nodesJson);
        return ["CUSTOM.kronTermTool", "CUSTOM.kronTermHarness", "CUSTOM.kronTermWidget", "CUSTOM.hermesAgent"].every(
            (name) => nodes.some((node: { name: string }) => node.name === name)
        );
    } catch {
        return false;
    }
}

export class N8nRuntime {
    private child: ChildProcess;
    private owner: string;
    private ownerContext: HermesSurfaceContext;
    private url: string;
    private ready = false;
    private dataDirectory: string;
    private nodeCatalog: { modified: number; size: number; inode: number; nodes: Promise<any[]> };
    private generation = 0;
    private startPromise: Promise<N8nRuntimeStatus>;

    status(context?: HermesSurfaceContext): N8nRuntimeStatus {
        if (context && this.owner && !this.owns(context)) {
            return { running: false, occupiedGeneration: this.generation };
        }
        return { running: this.ready, ...(this.ready ? { url: this.url } : {}) };
    }

    private owns(context: HermesSurfaceContext): boolean {
        return Boolean(context?.workspaceId && context.tabId && this.owner?.startsWith(`n8n:${n8nScopeKey(context)}:`));
    }

    handoffOwner(context: HermesSurfaceContext, generation: number): HermesSurfaceContext {
        if (
            !context?.workspaceId ||
            !context.tabId ||
            !Number.isSafeInteger(generation) ||
            this.status(context).occupiedGeneration !== generation
        )
            throw new Error("The workflow attachment changed. Refresh the workflow panel and try again.");
        return this.ownerContext;
    }

    start(context: HermesSurfaceContext, widgets?: Record<string, unknown>): Promise<N8nRuntimeStatus> {
        if (!context?.workspaceId || !context.tabId) return Promise.reject(new Error("Open a workspace tab first."));
        const key = n8nScopeKey(context);
        if (this.owner && !this.owner.startsWith(`n8n:${key}:`)) {
            return Promise.reject(new Error("Stop n8n before attaching it to another workspace tab."));
        }
        if (this.startPromise) return this.startPromise;
        if (this.ready) return Promise.resolve(this.status());
        const owner = `n8n:${key}:${randomUUID()}`;
        this.owner = owner;
        this.ownerContext = { workspaceId: context.workspaceId, tabId: context.tabId };
        const generation = ++this.generation;
        const pending = this.launch(structuredClone(context), key, owner, generation, widgets).catch((error) => {
            if (generation === this.generation) this.stop();
            throw error;
        });
        this.startPromise = pending;
        void pending
            .finally(() => {
                if (this.startPromise === pending) this.startPromise = null;
            })
            .catch(() => {});
        return pending;
    }

    private async launch(
        context: HermesSurfaceContext,
        key: string,
        owner: string,
        generation: number,
        widgets?: Record<string, unknown>
    ): Promise<N8nRuntimeStatus> {
        const paths = resolveN8nPaths();
        let startupError: Error;
        const assertCurrent = () => {
            if (startupError) throw startupError;
            if (generation !== this.generation) throw new Error("n8n startup was cancelled.");
        };
        const bridge = await startKronTermToolServer(() => context, owner);
        if (generation !== this.generation) {
            revokeKronTermToolCaller(owner);
            assertCurrent();
        }
        const port = await freePort();
        const brokerPort = await freePort();
        assertCurrent();
        const data = path.join(os.homedir(), ".kronterm", "runtimes", "n8n", key);
        fs.mkdirSync(data, { recursive: true, mode: 0o700 });
        this.dataDirectory = data;
        const generated = path.join(data, "widget-nodes");
        if (widgets) {
            writeN8nWidgetNodes(generated, path.join(generated, "bridge.js"), widgets);
            // n8n keys custom-directory loaders by the same package name, so separate directories replace each other.
            for (const filename of fs.readdirSync(paths.extensions)) {
                if (filename.endsWith(".node.js") || filename === "bridge.js")
                    fs.copyFileSync(path.join(paths.extensions, filename), path.join(generated, filename));
            }
        }
        this.url = `http://127.0.0.1:${port}`;
        const sessionToken = randomBytes(32).toString("hex");
        registerWorkflowSession(this.url, sessionToken);
        const nodeExecutable =
            process.env.KRONTERM_N8N_NODE ||
            [
                process.env.NVM_BIN && path.join(process.env.NVM_BIN, "node"),
                "/opt/homebrew/bin/node",
                "/usr/local/bin/node",
            ].find((candidate) => candidate && fs.existsSync(candidate)) ||
            "node";
        const child = spawn(nodeExecutable, [paths.bin, "start"], {
            cwd: path.dirname(path.dirname(paths.bin)),
            detached: process.platform !== "win32",
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                NODE_ENV: "production",
                PATH: [path.isAbsolute(nodeExecutable) ? path.dirname(nodeExecutable) : undefined, process.env.PATH]
                    .filter(Boolean)
                    .join(path.delimiter),
                N8N_LISTEN_ADDRESS: "127.0.0.1",
                N8N_HOST: "127.0.0.1",
                N8N_PORT: String(port),
                N8N_RUNNERS_MODE: "internal",
                N8N_RUNNERS_BROKER_PORT: String(brokerPort),
                N8N_RUNNERS_BROKER_LISTEN_ADDRESS: "127.0.0.1",
                N8N_PROTOCOL: "http",
                N8N_EDITOR_BASE_URL: this.url,
                N8N_USER_FOLDER: data,
                N8N_CUSTOM_EXTENSIONS: widgets ? generated : paths.extensions,
                N8N_CANVAS_ONLY: "true",
                N8N_TEMPLATES_ENABLED: "false",
                N8N_DIAGNOSTICS_ENABLED: "false",
                N8N_VERSION_NOTIFICATIONS_ENABLED: "false",
                N8N_PERSONALIZATION_ENABLED: "false",
                N8N_SECURE_COOKIE: "false",
                EXTERNAL_HOOK_FILES: path.join(paths.root, "session-hook.cjs"),
                EXTERNAL_HOOK_FILES_SEPARATOR: path.delimiter,
                KRONTERM_N8N_BIN: paths.bin,
                KRONTERM_N8N_SESSION_TOKEN: sessionToken,
                KRONTERM_N8N_TOOL_URL: bridge.nativeUrl,
                KRONTERM_N8N_TOOL_TOKEN: bridge.token,
            },
        });
        this.child = child;
        let failure = "";
        const captureFailure = (chunk: Buffer) => {
            failure = (failure + chunk.toString()).slice(-4096);
        };
        child.stdout.on("data", captureFailure);
        child.stderr.on("data", captureFailure);
        child.once("error", (error) => {
            failure = error.message;
            if (this.child === child) {
                startupError = new Error(`n8n stopped during startup. ${failure}`);
                this.stop();
            }
        });
        child.once("exit", (code, signal) => {
            if (this.child === child) {
                startupError = new Error(`n8n stopped during startup (exit ${code ?? signal}). ${failure}`);
                this.stop();
            }
        });
        let readinessFailure = "";
        const deadline = Date.now() + StartupTimeoutMs;
        while (Date.now() < deadline) {
            assertCurrent();
            if (this.child !== child || child.exitCode != null || child.signalCode != null) {
                throw new Error(`n8n stopped during startup. ${failure}`);
            }
            assertCurrent();
            try {
                const health = await fetch(`${this.url}/healthz/readiness`, { signal: AbortSignal.timeout(1000) });
                assertCurrent();
                if (health.ok) {
                    const [catalogReady] = await Promise.all([n8nCatalogReady(data), workflowAccount(this.url)]);
                    assertCurrent();
                    if (this.child !== child) throw new Error("n8n stopped during startup.");
                    if (catalogReady) {
                        this.ready = true;
                        return this.status();
                    }
                }
            } catch (error) {
                assertCurrent();
                if ([401, 403].includes(error?.status)) throw error;
                readinessFailure = error instanceof Error ? error.message : String(error);
            }
            await delay(300);
        }
        throw new Error(`n8n did not become ready within 90 seconds. ${readinessFailure} ${failure}`);
    }

    stop(): N8nRuntimeStatus {
        this.generation++;
        this.ready = false;
        this.startPromise = null;
        this.nodeCatalog = null;
        const child = this.child;
        this.child = null;
        if (this.owner) revokeKronTermToolCaller(this.owner);
        this.owner = null;
        this.ownerContext = null;
        if (this.url) {
            releaseN8nRequests(this.url);
            revokeManagedRuntimeRequests(new URL(this.url).origin);
            revokeManagedRuntimeRequests(new URL(this.url).origin.replace(/^http/, "ws"));
            releaseWorkflowSession(this.url);
        }
        this.url = null;
        if (child?.pid && child.exitCode == null && child.signalCode == null) {
            const signal = (value: NodeJS.Signals) => {
                try {
                    if (process.platform === "win32") child.kill(value);
                    else process.kill(-child.pid, value);
                } catch {
                    return;
                }
            };
            signal("SIGTERM");
            setTimeout(() => {
                if (child.exitCode == null && child.signalCode == null) signal("SIGKILL");
            }, 3000).unref();
        }
        return this.status();
    }

    assertScope(context: HermesSurfaceContext): void {
        if (this.owner && !this.owns(context)) {
            throw new Error("Workflows are connected to another tab. Switch the connection from the Workflows panel.");
        }
        if (!this.ready) {
            throw new Error("Start the workflow canvas in this workspace first.");
        }
    }

    async nodes(context: HermesSurfaceContext): Promise<any[]> {
        this.assertScope(context);
        const generation = this.generation;
        const file = path.join(this.dataDirectory, ".cache/n8n/public/types/nodes.json");
        const { mtimeMs, size, ino } = await fs.promises.stat(file);
        if (generation !== this.generation) throw new Error("The workflow runtime changed. Retry in the current workspace.");
        const cached = this.nodeCatalog;
        if (cached?.modified !== mtimeMs || cached.size !== size || cached.inode !== ino) {
            const nodes = fs.promises.readFile(file, "utf8").then((json) => JSON.parse(json));
            this.nodeCatalog = { modified: mtimeMs, size, inode: ino, nodes };
        }
        const catalog = this.nodeCatalog;
        try {
            const nodes = await catalog.nodes;
            if (generation !== this.generation)
                throw new Error("The workflow runtime changed. Retry in the current workspace.");
            return nodes;
        } catch (error) {
            if (this.nodeCatalog === catalog) this.nodeCatalog = null;
            throw error;
        }
    }

    async nodePorts(context: HermesSurfaceContext, graph: N8nWorkflowDraft): Promise<Record<string, unknown>> {
        const catalog = await this.nodes(context);
        const { Workflow, NodeHelpers } = createRequire(resolveN8nPaths().bin)("n8n-workflow");
        const workflow = new Workflow({
            ...structuredClone(graph),
            active: false,
            nodeTypes: {
                getByNameAndVersion: (name: string, version: number) => {
                    const description = catalog.find(
                        (type) =>
                            type.name === name &&
                            (Array.isArray(type.version) ? type.version.includes(version) : type.version === version)
                    );
                    return description ? { description } : undefined;
                },
            },
        });
        return Object.fromEntries(
            graph.nodes.map((node) => {
                const description = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion)?.description;
                return [
                    node.id,
                    {
                        inputs: NodeHelpers.getNodeInputs(workflow, workflow.nodes[node.name] ?? node, description),
                        outputs: NodeHelpers.getNodeOutputs(workflow, workflow.nodes[node.name] ?? node, description),
                    },
                ];
            })
        );
    }

    decodeExecutionData(data: unknown): unknown {
        if (typeof data !== "string") return data;
        return createRequire(resolveN8nPaths().bin)("flatted").parse(data);
    }

    async validateDraft(
        context: HermesSurfaceContext,
        workflow: N8nWorkflowDraft
    ): Promise<{ valid: boolean; errors: string[] }> {
        const errors = validateN8nDraft(workflow);
        if (errors.length) return { valid: false, errors };
        const nodes = await this.nodes(context);
        const { NodeHelpers } = createRequire(resolveN8nPaths().bin)("n8n-workflow");
        for (const node of workflow.nodes) {
            const type = nodes.find(
                (entry) =>
                    entry.name === node.type &&
                    (Array.isArray(entry.version)
                        ? entry.version.includes(node.typeVersion)
                        : entry.version === node.typeVersion)
            );
            if (!type) {
                errors.push(`Unknown node type or version: ${node.type} ${node.typeVersion}`);
                continue;
            }
            const issues = NodeHelpers.getNodeParametersIssues(type.properties ?? [], node, type);
            if (issues)
                errors.push(
                    ...NodeHelpers.nodeIssuesToString(issues, node).map((issue: string) => `${node.name}: ${issue}`)
                );
        }
        return { valid: errors.length === 0, errors };
    }
}
