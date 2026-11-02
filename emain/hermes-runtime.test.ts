// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

// hermes-runtime imports the tool server, whose module chain pulls in Electron main modules
vi.mock("./kronterm-tool-server", () => ({
    kronTermToolManifest: () => [],
    startKronTermToolServer: vi.fn(),
}));
vi.mock("./authkey", () => ({ revokeManagedRuntimeRequests: vi.fn(), refreshManagedRuntimeSocketHeaders: vi.fn() }));
const surfaceTokens = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("../frontend/app/store/wshclientapi", () => ({ RpcApi: { CreateSurfaceTokenCommand: surfaceTokens.issue } }));
vi.mock("./emain-wsh", () => ({ ElectronWshClient: {} }));
const n8nEditor = vi.hoisted(() => ({ open: vi.fn(async () => "block created: n8n-editor") }));
vi.mock("./kronterm-native-tool-bridge", () => ({
    KronTermNativeToolBridge: class {
        openWeb = n8nEditor.open;
    },
}));

import {
    HermesRuntime,
    makeHermesApiUrl,
    makeHermesManagedConfig,
    makeHermesRuntimeEnvironment,
    makeKronTermToolEnvironment,
    parseHermesReadyPort,
    prepareHermesBundledPlugins,
    resolveKronTermSharedSkillDirs,
} from "./hermes-runtime";
import { KronosCodeRuntime } from "./kronoscode-runtime";

describe("Hermes shared backend recovery", () => {
    test("restarts delegation and invalidates pending startup on backend replacement", () => {
        const runtime = HermesRuntime as any;
        const previous = {
            descriptor: { baseUrl: "http://127.0.0.1:9999", serverInstanceId: "old" },
            username: "kronoscode",
            password: "old-secret",
        };
        const kill = vi.fn();
        const restart = vi.spyOn(runtime, "scheduleRestart").mockImplementation(() => {});
        const internal = vi.spyOn(KronosCodeRuntime, "getInternalConnection").mockReturnValue({
            ...previous,
            descriptor: { ...previous.descriptor, serverInstanceId: "new" },
            password: "new-secret",
        } as any);
        const original = {
            stopping: runtime.stopping,
            delegationConnection: runtime.delegationConnection,
            child: runtime.child,
            connection: runtime.connection,
            startupGeneration: runtime.startupGeneration,
            startPromise: runtime.startPromise,
        };
        try {
            runtime.stopping = false;
            runtime.delegationConnection = previous;
            runtime.child = { kill };
            runtime.connection = { baseUrl: "http://127.0.0.1:1111" };
            KronosCodeRuntime.emit("connection");
            expect(kill).toHaveBeenCalledWith("SIGTERM");
            expect(restart).toHaveBeenCalledOnce();
            expect(runtime.child).toBeNull();
            expect(runtime.connection).toBeNull();
            expect(runtime.startupGeneration).toBe(original.startupGeneration + 1);
        } finally {
            Object.assign(runtime, original);
            internal.mockRestore();
            restart.mockRestore();
        }
    });
});

describe("Hermes API routing", () => {
    test("uses the HUD sender's workspace when the Hermes surface has only a tab", async () => {
        const runtime = HermesRuntime as any;
        const original = runtime.surfaceContext;
        const start = vi.spyOn(runtime, "n8nCommand").mockResolvedValue({ running: true });
        runtime.surfaceContext = { tabId: "tab", hostMode: "kronterm" };
        try {
            await HermesRuntime.api(
                { path: "/api/kronterm/n8n", method: "POST" },
                { tabId: "tab", workspaceId: "workspace" }
            );
            expect(start).toHaveBeenCalledWith(
                { operation: "open", surface: "canvas" },
                { tabId: "tab", workspaceId: "workspace", hostMode: "kronterm" }
            );
        } finally {
            runtime.surfaceContext = original;
            start.mockRestore();
        }
    });

    test("handles n8n start, status, and stop in Electron without forwarding to Hermes HTTP", async () => {
        const runtime = HermesRuntime as any;
        const context = { workspaceId: "workspace", tabId: "tab" };
        const original = runtime.surfaceContext;
        const status = { running: true, url: "http://127.0.0.1:5678" };
        const start = vi.spyOn(runtime, "n8nCommand").mockResolvedValue(status);
        const inspect = vi.spyOn(runtime.n8n, "status").mockReturnValue(status);
        const stop = vi.spyOn(runtime.n8n, "stop").mockReturnValue({ running: false });
        const ensure = vi.spyOn(runtime, "ensure").mockRejectedValue(new Error("Must not contact Hermes"));
        runtime.surfaceContext = context;
        try {
            await expect(HermesRuntime.api({ path: "/api/kronterm/n8n", method: "POST" })).resolves.toEqual(status);
            expect(start).toHaveBeenCalledWith({ operation: "open", surface: "canvas" }, context);
            await expect(HermesRuntime.api({ path: "/api/kronterm/n8n" })).resolves.toEqual(status);
            expect(inspect).toHaveBeenCalledOnce();
            await expect(HermesRuntime.api({ path: "/api/kronterm/n8n", method: "DELETE" })).resolves.toEqual({
                running: false,
            });
            expect(stop).toHaveBeenCalledOnce();
            expect(ensure).not.toHaveBeenCalled();
        } finally {
            runtime.surfaceContext = original;
            start.mockRestore();
            inspect.mockRestore();
            stop.mockRestore();
            ensure.mockRestore();
        }
    });

    test("keeps renderer requests on the managed backend and adds profile scope", () => {
        expect(makeHermesApiUrl("http://127.0.0.1:62554", "/api/config?explicit=1", "research").toString()).toBe(
            "http://127.0.0.1:62554/api/config?explicit=1&profile=research"
        );
    });

    test.each(["https://example.com/api/config", "//example.com/api/config", "api/config"])(
        "rejects a request that could escape the managed backend: %s",
        (requestPath) => {
            expect(() => makeHermesApiUrl("http://127.0.0.1:62554", requestPath)).toThrow(
                "Hermes API paths must be absolute backend paths."
            );
        }
    );
});

describe("parseHermesReadyPort", () => {
    test.each([
        ["HERMES_BACKEND_READY port=43127\n", 43127],
        ["booting\nHERMES_DASHBOARD_READY port=9119\r\nready", 9119],
    ])("reads a supported readiness sentinel", (output, expected) => {
        expect(parseHermesReadyPort(output)).toBe(expected);
    });

    test.each(["HERMES_BACKEND_READY port=0", "HERMES_BACKEND_READY port=70000", "ready port=9119"])(
        "rejects an invalid readiness sentinel",
        (output) => {
            expect(parseHermesReadyPort(output)).toBeUndefined();
        }
    );
});

describe("Hermes KronTerm runtime environment", () => {
    test("injects presentation-aware tool guidance without persisting it to the user profile", () => {
        const env = makeHermesRuntimeEnvironment("/opt/hermes/bin/hermes", "session-token", {
            managedDir: "/tmp/kronterm-hermes-managed",
            kronosCodeBinary: "/opt/kronterm/bin/kronoscode",
            enableKronTermTools: true,
            toolServer: {
                url: "http://127.0.0.1:9119/mcp",
                nativeUrl: "http://127.0.0.1:9119/native",
                token: "tool-server-token",
            },
            toolEnvironment: makeKronTermToolEnvironment(
                "/tmp/kronos-capability.json",
                "/opt/kronterm/bin/wsh",
                "/workspace",
                ["/workspace/.agents/skills"]
            ),
        });

        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("workspace_snapshot");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("You are the KronTerm Agent");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("widget_snapshot");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("hud_set_mode");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("hud_show_widget");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("hud_set_widget_background");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("KRONTERM_WSH and PATH");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("canvas_snapshot");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("workspace_canvas_add_note");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("browser_open_tab");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("Background browser widgets remain live");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("never intentionally overlap canvas items");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("kron_computer_get_app_state");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain("persistent Electron TypeScript runtime");
        expect(env.HERMES_EPHEMERAL_SYSTEM_PROMPT).toContain(
            "Use `surface_status` only to diagnose a connection failure or when the user explicitly asks about tool availability"
        );
        expect(env.HERMES_DASHBOARD_SESSION_TOKEN).toBe("session-token");
        expect(env.HERMES_MANAGED_DIR).toBe("/tmp/kronterm-hermes-managed");
        expect(env.HERMES_BUNDLED_PLUGINS).toBe("/tmp/kronterm-hermes-managed/plugins");
        expect(env.PATH.split(path.delimiter)).toContain("/opt/kronterm/bin");
        expect(env.HERMES_COPILOT_ACP_COMMAND).toBe("/opt/kronterm/bin/kronoscode");
        expect(env.HERMES_DISABLE_LAZY_INSTALLS).toBe("1");
        expect(env.HERMES_COPILOT_ACP_ARGS).toBe("acp");
        expect(env.HERMES_KRONTERM_NATIVE_TOOL_URL).toBe("http://127.0.0.1:9119/native");
        expect(env.KRONTERM_NATIVE_TOOL_TOKEN).toBe("tool-server-token");
        expect(env).not.toHaveProperty("HERMES_KRONTERM_TOOL_BRIDGE_COMMAND");
        expect(env.HERMES_TUI_TOOLSETS).toBe("kronterm,delegation");
        expect(env.KRONTERM_SURFACE_CAPABILITY_FILE).toBe("/tmp/kronos-capability.json");
    });

    test("uses scoped delegation while leaving the persistent tool server optional", () => {
        const config = makeHermesManagedConfig() as any;

        expect(config.delegation).toEqual({ backend: "kronterm_smart", max_concurrent_children: 2 });
        expect(config.tools).toEqual({
            tool_search: { enabled: "off" },
        });
        expect(config.agent.reasoning_effort).toBe("minimal");
        expect(config.agent.environment_probe).toBe(false);
        expect(config.agent.task_completion_guidance).toBe(false);
        expect(config.agent.max_turns).toBe(30);
        expect(config.agent.system_prompt).toContain("persistent Electron TypeScript runtime");
        expect(config.display).toEqual({ personality: "" });
        expect(config).not.toHaveProperty("mcp_servers");
    });

    test("does not configure MCP for the built-in TypeScript tool path", () => {
        const config = makeHermesManagedConfig({
            url: "http://127.0.0.1:9119/mcp",
            nativeUrl: "http://127.0.0.1:9119/native",
            token: "tool-server-token",
        }) as any;

        expect(config).not.toHaveProperty("mcp_servers");
    });

    test("exposes packaged, project, and user skill roots to the shared MCP catalog", () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "kronos-skill-roots-"));
        const cwd = path.join(root, "workspace");
        const homeDir = path.join(root, "home");
        const resourcesPath = path.join(root, "resources");
        const configured = path.join(root, "configured");
        const expected = [
            path.join(cwd, ".agents", "skills"),
            path.join(homeDir, ".codex", "skills"),
            path.join(homeDir, ".hermes", "skills"),
            path.join(resourcesPath, "kronterm-skills"),
            configured,
        ];
        for (const directory of expected) {
            fs.mkdirSync(directory, { recursive: true });
        }

        expect(resolveKronTermSharedSkillDirs({ cwd, homeDir, resourcesPath, configured })).toEqual(
            expect.arrayContaining(expected)
        );
    });

    test("gives native TypeScript tools a rotating capability file instead of copying a JWT", () => {
        const env = makeKronTermToolEnvironment("/tmp/kronos-capability.json", "/opt/kronterm/bin/wsh", "/workspace", [
            "/workspace/.agents/skills",
            "/resources/kronterm-skills",
        ]);

        expect(env).toMatchObject({
            KRONTERM_SURFACE_CAPABILITY_FILE: "/tmp/kronos-capability.json",
            KRONTERM_WSH: "/opt/kronterm/bin/wsh",
            WAVETERM_WSH: "/opt/kronterm/bin/wsh",
            KRONTERM_WORKSPACE: "/workspace",
        });
        expect(env.KRONTERM_SHARED_SKILL_DIRS.split(path.delimiter)).toEqual([
            "/workspace/.agents/skills",
            "/resources/kronterm-skills",
        ]);
        expect(env).not.toHaveProperty("KRONTERM_JWT");
        expect(env).not.toHaveProperty("WAVETERM_JWT");
    });
});

describe("Hermes bundled tool discovery", () => {
    test("attaches delegation to the shared backend without exposing credentials in arguments", () => {
        const env = makeHermesRuntimeEnvironment("/opt/hermes", "token", {
            kronosCodeBinary: "/opt/kronoscode",
            kronosCodeConnection: {
                baseUrl: "https://backend.example",
                username: "desktop-user",
                password: "private-backend-secret",
            },
        });
        expect(env.HERMES_COPILOT_ACP_ARGS).toBe("'acp' '--attach' 'https://backend.example'");
        expect(env.HERMES_COPILOT_ACP_ARGS).not.toContain("private-backend-secret");
        expect(env.KRONOSCODE_SERVER_USERNAME).toBe("desktop-user");
        expect(env.KRONOSCODE_SERVER_PASSWORD).toBe("private-backend-secret");
    });

    test("clears inherited passwords for an unauthenticated attached backend", () => {
        vi.stubEnv("KRONOSCODE_SERVER_PASSWORD", "old-secret");
        vi.stubEnv("OPENCODE_SERVER_PASSWORD", "old-fallback");
        try {
            const env = makeHermesRuntimeEnvironment("/opt/hermes", "token", {
                kronosCodeBinary: "/opt/kronoscode",
                kronosCodeConnection: { baseUrl: "http://127.0.0.1:9000", username: "kronoscode" },
            });
            expect(env.KRONOSCODE_SERVER_PASSWORD).toBe("");
            expect(env.OPENCODE_SERVER_PASSWORD).toBe("");
        } finally {
            vi.unstubAllEnvs();
        }
    });

    test("publishes the adapter in a scanned root while preserving bundled plugins", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-overlay-"));
        const base = path.join(root, "base");
        const adapter = path.join(root, "adapter");
        const target = path.join(root, "managed", "plugins");
        fs.mkdirSync(path.join(base, "copilot-provider"), { recursive: true });
        fs.mkdirSync(adapter);
        fs.mkdirSync(path.join(root, "orgo-computer"));
        fs.writeFileSync(path.join(root, "orgo-computer", "plugin.yaml"), "name: orgo-computer");
        fs.writeFileSync(path.join(base, "copilot-provider", "plugin.yaml"), "kind: backend");
        fs.writeFileSync(path.join(adapter, "plugin.yaml"), "name: kronterm-tools\nkind: backend");
        vi.stubEnv("HERMES_BUNDLED_PLUGINS", base);
        try {
            const preparation = prepareHermesBundledPlugins("/missing/hermes", target, adapter);
            expect(fs.existsSync(target)).toBe(false);
            expect(await preparation).toBe(target);
            expect(fs.readFileSync(path.join(target, "copilot-provider", "plugin.yaml"), "utf8")).toBe("kind: backend");
            expect(fs.readFileSync(path.join(target, "kronterm-tools", "plugin.yaml"), "utf8")).toContain(
                "name: kronterm-tools"
            );
            expect(fs.readFileSync(path.join(target, "orgo-computer", "plugin.yaml"), "utf8")).toContain(
                "name: orgo-computer"
            );
            await prepareHermesBundledPlugins("/missing/hermes", target, adapter);
        } finally {
            vi.unstubAllEnvs();
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("keeps the previous plugin tree when an adapter update fails", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-failure-"));
        const target = path.join(root, "plugins");
        fs.mkdirSync(path.join(target, "kronterm-tools"), { recursive: true });
        fs.writeFileSync(path.join(target, "kronterm-tools", "plugin.yaml"), "previous adapter");
        vi.stubEnv("HERMES_BUNDLED_PLUGINS", path.join(root, "missing-base"));
        try {
            await expect(
                prepareHermesBundledPlugins("/missing/hermes", target, path.join(root, "missing-adapter"))
            ).rejects.toThrow();
            expect(fs.readFileSync(path.join(target, "kronterm-tools", "plugin.yaml"), "utf8")).toBe(
                "previous adapter"
            );
            expect(fs.readdirSync(root)).toEqual(["plugins"]);
        } finally {
            vi.unstubAllEnvs();
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test.each([3, 4, 5])(
        "restores the previous adapter when cancelled at publication checkpoint %s",
        async (checkpoint) => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-cancel-"));
            const target = path.join(root, "plugins");
            const adapter = path.join(root, "adapter");
            fs.mkdirSync(path.join(target, "kronterm-tools"), { recursive: true });
            fs.mkdirSync(adapter);
            fs.writeFileSync(path.join(target, "kronterm-tools", "plugin.yaml"), "previous");
            fs.writeFileSync(path.join(adapter, "plugin.yaml"), "replacement");
            vi.stubEnv("HERMES_BUNDLED_PLUGINS", path.join(root, "missing-base"));
            let checks = 0;
            try {
                await expect(
                    prepareHermesBundledPlugins("/missing/hermes", target, adapter, () => {
                        if (++checks === checkpoint) throw new Error("cancelled");
                    })
                ).rejects.toThrow("cancelled");
                expect(fs.readFileSync(path.join(target, "kronterm-tools", "plugin.yaml"), "utf8")).toBe("previous");
                expect(fs.readdirSync(root).sort()).toEqual(["adapter", "plugins"]);
            } finally {
                vi.unstubAllEnvs();
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    );

    test("serializes overlapping preparations and recovers after a failed update", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-overlap-"));
        const target = path.join(root, "plugins");
        const adapter = path.join(root, "adapter");
        fs.mkdirSync(adapter);
        fs.writeFileSync(path.join(adapter, "plugin.yaml"), "complete adapter");
        vi.stubEnv("HERMES_BUNDLED_PLUGINS", path.join(root, "missing-base"));
        try {
            const failed = prepareHermesBundledPlugins("/missing/hermes", target, path.join(root, "missing-adapter"));
            const first = prepareHermesBundledPlugins("/missing/hermes", target, adapter);
            const second = prepareHermesBundledPlugins("/missing/hermes", target, adapter);
            await expect(failed).rejects.toThrow();
            expect(await Promise.all([first, second])).toEqual([target, target]);
            expect(fs.readFileSync(path.join(target, "kronterm-tools", "plugin.yaml"), "utf8")).toBe(
                "complete adapter"
            );
            expect(fs.readdirSync(root).sort()).toEqual(["adapter", "plugins"]);
        } finally {
            vi.unstubAllEnvs();
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test("retains working providers when bundled plugin discovery is unavailable", async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-retain-"));
        const target = path.join(root, "plugins");
        const adapter = path.join(root, "adapter");
        fs.mkdirSync(path.join(target, "provider"), { recursive: true });
        fs.mkdirSync(adapter);
        fs.writeFileSync(path.join(target, "provider", "plugin.yaml"), "working provider");
        fs.writeFileSync(path.join(adapter, "plugin.yaml"), "updated adapter");
        vi.stubEnv("HERMES_BUNDLED_PLUGINS", path.join(root, "missing-base"));
        try {
            await prepareHermesBundledPlugins("/missing/hermes", target, adapter);
            expect(fs.readFileSync(path.join(target, "provider", "plugin.yaml"), "utf8")).toBe("working provider");
            expect(fs.readFileSync(path.join(target, "kronterm-tools", "plugin.yaml"), "utf8")).toBe("updated adapter");
        } finally {
            vi.unstubAllEnvs();
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test.skipIf(process.platform === "win32")(
        "keeps the event loop available during the Python discovery probe",
        async () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-plugin-probe-"));
            const base = path.join(root, "base");
            const adapter = path.join(root, "adapter");
            const target = path.join(root, "plugins");
            fs.mkdirSync(path.join(base, "provider"), { recursive: true });
            fs.mkdirSync(adapter);
            fs.writeFileSync(path.join(base, "provider", "plugin.yaml"), "bundled provider");
            fs.writeFileSync(path.join(adapter, "plugin.yaml"), "adapter");
            fs.writeFileSync(
                path.join(root, "python"),
                `#!${process.execPath}\nsetTimeout(() => process.stdout.write(${JSON.stringify(base)}), 100);\n`,
                { mode: 0o700 }
            );
            vi.stubEnv("HERMES_BUNDLED_PLUGINS", "");
            let pending: Promise<string>;
            try {
                pending = prepareHermesBundledPlugins(path.join(root, "hermes"), target, adapter);
                await new Promise((resolve) => setTimeout(resolve, 10));
                expect(fs.existsSync(target)).toBe(false);
                await pending;
                expect(fs.readFileSync(path.join(target, "provider", "plugin.yaml"), "utf8")).toBe("bundled provider");
            } finally {
                await pending?.catch(() => undefined);
                vi.unstubAllEnvs();
                fs.rmSync(root, { recursive: true, force: true });
            }
        }
    );
});

describe("Hermes bounded recovery", () => {
    test("backs off, stops after three failures, and allows a manual retry", async () => {
        const runtime = HermesRuntime as any;
        const original = {
            stopping: runtime.stopping,
            restartAttempt: runtime.restartAttempt,
            restartTimer: runtime.restartTimer,
            startPromise: runtime.startPromise,
            startupGeneration: runtime.startupGeneration,
            child: runtime.child,
            connection: runtime.connection,
        };
        vi.useFakeTimers();
        const failure = vi.fn();
        runtime.on("runtime-failure", failure);
        const start = vi.spyOn(runtime, "start").mockRejectedValue(new Error("startup failed"));
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        Object.assign(runtime, {
            stopping: false,
            restartAttempt: 0,
            restartTimer: null,
            startPromise: null,
            child: null,
            connection: null,
        });
        try {
            runtime.scheduleRestart();
            await vi.advanceTimersByTimeAsync(999);
            expect(start).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            expect(start).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(2_999);
            expect(start).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);
            expect(start).toHaveBeenCalledTimes(2);
            await vi.advanceTimersByTimeAsync(10_000);
            expect(start).toHaveBeenCalledTimes(3);
            expect(failure).toHaveBeenCalledOnce();
            expect(runtime.restartTimer).toBeNull();
            await vi.advanceTimersByTimeAsync(60_000);
            expect(start).toHaveBeenCalledTimes(3);
            start.mockResolvedValueOnce({ baseUrl: "http://127.0.0.1:9999" });
            await runtime.ensure();
            expect(start).toHaveBeenCalledTimes(4);
            expect(runtime.restartAttempt).toBe(0);
            runtime.stopping = true;
            runtime.scheduleRestart();
            expect(runtime.restartTimer).toBeNull();
        } finally {
            runtime.removeListener("runtime-failure", failure);
            start.mockRestore();
            log.mockRestore();
            vi.clearAllTimers();
            vi.useRealTimers();
            Object.assign(runtime, original);
        }
    });

    test("escalates termination for an unresponsive child but leaves exited children alone", async () => {
        const runtime = HermesRuntime as any;
        vi.useFakeTimers();
        const child = { kill: vi.fn(), exitCode: null, signalCode: null };
        const exitedChild = { kill: vi.fn(), exitCode: null, signalCode: null as string | null };
        try {
            runtime.stopChild(child);
            runtime.stopChild(exitedChild);
            expect(child.kill).toHaveBeenCalledWith("SIGTERM");
            exitedChild.signalCode = "SIGTERM";
            await vi.advanceTimersByTimeAsync(3_000);
            expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
            expect(exitedChild.kill).toHaveBeenCalledTimes(1);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    test.skipIf(process.platform === "win32")("terminates the owned process group", async () => {
        const runtime = HermesRuntime as any;
        vi.useFakeTimers();
        const signal = vi.spyOn(process, "kill").mockReturnValue(true);
        const child = { pid: 12345, kill: vi.fn(), exitCode: null, signalCode: null };
        try {
            runtime.stopChild(child);
            expect(signal).toHaveBeenCalledWith(-12345, "SIGTERM");
            await vi.advanceTimersByTimeAsync(3_000);
            expect(signal).toHaveBeenCalledWith(-12345, "SIGKILL");
            expect(child.kill).not.toHaveBeenCalled();
        } finally {
            signal.mockRestore();
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

describe("Hermes surface capability connection deadline", () => {
    test("uses a bounded token RPC and retries one interrupted transport without bypassing issuance", async () => {
        vi.useFakeTimers();
        const runtime = HermesRuntime as any;
        const previous = {
            surfaceContext: runtime.surfaceContext,
            surfaceGeneration: runtime.surfaceGeneration,
            surfaceCapabilityReady: runtime.surfaceCapabilityReady,
            surfaceRefreshTimer: runtime.surfaceRefreshTimer,
        };
        const mkdir = vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
        const write = vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);
        const chmod = vi.spyOn(fs, "chmodSync").mockReturnValue(undefined);
        surfaceTokens.issue
            .mockReset()
            .mockRejectedValueOnce(new Error("EC-TIME: timeout waiting for response"))
            .mockResolvedValueOnce({
                token: "test-capability",
                tabid: "tab",
                blockid: "",
                expiresat: Date.now() + 3600000,
            });
        runtime.surfaceContext = { tabId: "tab" };
        runtime.surfaceGeneration = 7;
        runtime.surfaceCapabilityReady = false;
        try {
            await runtime.refreshSurfaceCapability(7);
            expect(surfaceTokens.issue).toHaveBeenCalledTimes(2);
            expect(surfaceTokens.issue.mock.calls.every((call) => call[2]?.timeout === 10000)).toBe(true);
            expect(write).toHaveBeenCalledOnce();
            expect(runtime.surfaceCapabilityReady).toBe(true);
        } finally {
            clearTimeout(runtime.surfaceRefreshTimer);
            Object.assign(runtime, previous);
            mkdir.mockRestore();
            write.mockRestore();
            chmod.mockRestore();
            vi.useRealTimers();
        }
    });
    test("does not retry or establish capability after an authorization failure", async () => {
        const runtime = HermesRuntime as any;
        const previous = {
            surfaceContext: runtime.surfaceContext,
            surfaceGeneration: runtime.surfaceGeneration,
            surfaceCapabilityReady: runtime.surfaceCapabilityReady,
        };
        surfaceTokens.issue
            .mockReset()
            .mockRejectedValue(new Error("surface tokens may only be issued for Electron sessions"));
        runtime.surfaceContext = { tabId: "tab" };
        runtime.surfaceGeneration = 8;
        runtime.surfaceCapabilityReady = false;
        try {
            await expect(runtime.refreshSurfaceCapability(8)).rejects.toThrow("Electron sessions");
            expect(surfaceTokens.issue).toHaveBeenCalledOnce();
            expect(runtime.surfaceCapabilityReady).toBe(false);
        } finally {
            Object.assign(runtime, previous);
        }
    });
});
