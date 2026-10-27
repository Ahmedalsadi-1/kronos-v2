// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { KronTermNativeToolBridge } from "./kronterm-native-tool-bridge";

const mocks = vi.hoisted(() => ({
    detect: vi.fn(),
    initialize: vi.fn(),
    send: vi.fn(),
    stop: vi.fn(),
    confirm: vi.fn(),
    runtime: vi.fn(),
    instances: [] as any[],
}));

vi.mock("@/app/store/services", () => ({ WorkspaceService: {} }));
vi.mock("./emain-window", () => ({}));
vi.mock("./emain-hud", () => ({}));
vi.mock("./emain-pet", () => ({ notifyDesktopPetActivity: vi.fn() }));
vi.mock("./emain-wsh", () => ({ ElectronWshClient: { wshRpcCall: vi.fn() } }));
vi.mock("./acp/acp-connector", () => ({ detectInstalledAgents: mocks.detect }));
vi.mock("./kronoscode-runtime", () => ({
    KronosCodeRuntime: {
        revalidate: mocks.runtime,
        getInternalConnection: () => ({ username: "kronoscode", password: "ephemeral-test-password" }),
    },
    isKronosCodeLoopbackUrl: (url: string) => new URL(url).hostname === "127.0.0.1",
    withKronosCodeAttachArgs: (_args: string[], url: string) => ["acp", "--attach", url],
}));
vi.mock("./acp/acp-agent-manager", async () => {
    const { EventEmitter } = await import("node:events");
    return {
        AcpAgentManager: class extends EventEmitter {
            sessionId = "coding-session";
            initialize = mocks.initialize;
            stop = mocks.stop;
            confirmTool = mocks.confirm;
            sendMessage = (request: unknown) => mocks.send(this, request);
            constructor(public options: unknown) {
                super();
                mocks.instances.push(this);
            }
        },
    };
});

const KronosCode = { backend: "kronoscode", name: "KronosCode", available: true, cliPath: "/bin/kronoscode" };

function bridge() {
    return new KronTermNativeToolBridge(() => ({ tabId: "tab-1", blockId: "agent-1" }));
}

describe("KronTerm Agent delegation to KronosCode", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.instances.length = 0;
        mocks.detect.mockResolvedValue([KronosCode]);
        mocks.initialize.mockResolvedValue(undefined);
        mocks.stop.mockResolvedValue(undefined);
        mocks.confirm.mockResolvedValue(undefined);
        mocks.runtime.mockResolvedValue({ baseUrl: "http://127.0.0.1:43127" });
        mocks.send.mockImplementation(async (manager) => {
            manager.emit("event", { type: "agent_thought_chunk", data: { text: "private reasoning" } });
            manager.emit("event", { type: "agent_message_chunk", data: { text: "Checked " } });
            manager.emit("event", { type: "agent_message_chunk", data: { text: "the repository." } });
        });
        vi.stubEnv("KRONTERM_WORKSPACE", "/workspace/project");
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    test("prefers KronosCode even when the other coding engine is installed", async () => {
        mocks.detect.mockResolvedValue([
            { ...KronosCode, backend: "kronterm-agent" },
            { ...KronosCode, backend: "hermes" },
            KronosCode,
        ]);
        const discovery = JSON.parse(await bridge().acpListAgents());
        expect(discovery.preferred).toBe("kronoscode");
        expect(discovery.agents.map((agent) => agent.backend)).toEqual(["kronterm-agent", "kronoscode"]);
    });

    test("delegates a scoped task and returns the specialist's answer without reasoning", async () => {
        const result = JSON.parse(await bridge().acpRunAgent(undefined, "Inspect the repository and report evidence"));
        expect(mocks.initialize).toHaveBeenCalledWith(
            expect.objectContaining({
                backend: "kronoscode",
                cliPath: "/bin/kronoscode",
                workspace: "/workspace/project",
                surfaceContext: { tabId: "tab-1", blockId: "agent-1" },
                customArgs: ["acp", "--attach", "http://127.0.0.1:43127"],
                customEnv: {
                    KRONOSCODE_SERVER_USERNAME: "kronoscode",
                    KRONOSCODE_SERVER_PASSWORD: "ephemeral-test-password",
                },
            })
        );
        expect(mocks.send.mock.calls[0][1]).toMatchObject({ content: "Inspect the repository and report evidence" });
        expect(result).toMatchObject({
            backend: "kronoscode",
            answer: "Checked the repository.",
            sessionId: "coding-session",
            toolAccess: "tab-scoped-kronterm-mcp",
        });
        expect(mocks.stop).toHaveBeenCalledOnce();
        expect(mocks.instances[0].listenerCount("event")).toBe(0);
    });

    test("reports missing KronosCode instead of silently selecting another engine", async () => {
        mocks.detect.mockResolvedValue([{ ...KronosCode, backend: "kronterm-agent" }]);
        const tools = bridge();
        expect(JSON.parse(await tools.acpListAgents()).preferred).toBeNull();
        await expect(tools.acpRunAgent("kronoscode", "Inspect")).rejects.toThrow("unavailable");
        expect(mocks.initialize).not.toHaveBeenCalled();
    });

    test("preserves the detected OpenCode executable and ACP launch arguments", async () => {
        mocks.detect.mockResolvedValue([
            {
                backend: "opencode",
                name: "OpenCode",
                available: true,
                cliPath: "/installed/opencode",
                acpArgs: ["acp", "--port", "0"],
            },
        ]);
        const result = JSON.parse(await bridge().acpRunAgent("opencode", "Inspect the repository"));
        expect(mocks.initialize).toHaveBeenCalledWith(
            expect.objectContaining({
                backend: "opencode",
                cliPath: "/installed/opencode",
                customArgs: ["acp", "--port", "0"],
            })
        );
        expect(mocks.runtime).not.toHaveBeenCalled();
        expect(result.backend).toBe("opencode");
    });

    test("does not grant local workspace tools to a remote KronosCode backend", async () => {
        mocks.runtime.mockResolvedValueOnce({ baseUrl: "https://coding.example.com" });
        const result = JSON.parse(await bridge().acpRunAgent("kronoscode", "Inspect"));
        expect(mocks.initialize).toHaveBeenCalledWith(
            expect.objectContaining({
                surfaceContext: undefined,
                customArgs: ["acp", "--attach", "https://coding.example.com"],
            })
        );
        expect(result.toolAccess).toBe("none");
    });

    test("reports a managed runtime boot failure before launching the ACP client", async () => {
        mocks.runtime.mockRejectedValueOnce(new Error("KronosCode health check failed"));
        await expect(bridge().acpRunAgent("kronoscode", "Inspect")).rejects.toThrow("health check failed");
        expect(mocks.instances).toHaveLength(0);
    });

    test("waits for server readiness and uses the assigned port before launching the ACP client", async () => {
        let ready: (connection: { baseUrl: string }) => void;
        mocks.runtime.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    ready = resolve;
                })
        );
        const delegation = bridge().acpRunAgent("kronoscode", "Inspect");
        await vi.waitFor(() => expect(mocks.runtime).toHaveBeenCalledOnce());
        expect(mocks.initialize).not.toHaveBeenCalled();
        ready({ baseUrl: "http://127.0.0.1:51668" });
        await delegation;
        expect(mocks.initialize).toHaveBeenCalledWith(
            expect.objectContaining({
                customArgs: ["acp", "--attach", "http://127.0.0.1:51668"],
            })
        );
    });

    test("surfaces agent failure and permits a later delegation after cleanup", async () => {
        mocks.send.mockImplementationOnce(async (manager) => {
            manager.emit("event", { type: "error", data: { error: "Provider disconnected" } });
            await new Promise(() => {});
        });
        const tools = bridge();
        await expect(tools.acpRunAgent("kronoscode", "Inspect")).rejects.toThrow("Provider disconnected");
        await expect(tools.acpRunAgent("kronoscode", "Retry")).resolves.toContain("Checked the repository.");
        expect(mocks.stop).toHaveBeenCalledTimes(2);
    });

    test("stops a timed-out specialist and rejects simultaneous delegation", async () => {
        vi.useFakeTimers();
        mocks.send.mockImplementationOnce(async () => new Promise(() => {}));
        const tools = bridge();
        const task = tools.acpRunAgent("kronoscode", "Inspect", 15);
        const rejection = expect(task).rejects.toThrow("timed out after 15 seconds");
        await expect(tools.acpRunAgent("kronoscode", "Duplicate")).rejects.toThrow("already active");
        await vi.advanceTimersByTimeAsync(15_000);
        await rejection;
        expect(mocks.stop).toHaveBeenCalledOnce();
        expect(mocks.instances[0].listenerCount("event")).toBe(0);
    });

    test("returns startup failures promptly even if initialization has not settled", async () => {
        mocks.initialize.mockImplementationOnce(async () => {
            mocks.instances[0].emit("event", { type: "error", data: { error: "ACP startup failed" } });
            await new Promise(() => {});
        });
        await expect(bridge().acpRunAgent("kronoscode", "Inspect")).rejects.toThrow("ACP startup failed");
        expect(mocks.send).not.toHaveBeenCalled();
        expect(mocks.stop).toHaveBeenCalledOnce();
    });

    test("does not launch a specialist when discovery finishes after the deadline", async () => {
        vi.useFakeTimers();
        let resolveDiscovery: (agents: (typeof KronosCode)[]) => void;
        mocks.detect.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveDiscovery = resolve;
                })
        );
        const task = bridge().acpRunAgent("kronoscode", "Inspect", 15);
        const rejection = expect(task).rejects.toThrow("timed out");
        await vi.advanceTimersByTimeAsync(15_000);
        await rejection;
        resolveDiscovery([KronosCode]);
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.instances).toHaveLength(0);
    });

    test("returns blocked approval evidence to the parent", async () => {
        mocks.send.mockImplementationOnce(async (manager) => {
            manager.emit("event", {
                type: "tool_permission",
                data: {
                    confirmation: {
                        msgId: "message-1",
                        callId: "call-1",
                        title: "Publish changes",
                        options: [{ kind: "reject_once", optionId: "reject" }],
                    },
                },
            });
        });
        const result = JSON.parse(await bridge().acpRunAgent("kronoscode", "Inspect"));
        expect(result.rejectedPermissions).toEqual(["Publish changes"]);
        expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ callId: "call-1", optionId: "reject" }));
    });

    test("reports an empty provider response as failure instead of empty success", async () => {
        mocks.send.mockResolvedValueOnce(undefined);
        await expect(bridge().acpRunAgent("kronoscode", "Inspect")).rejects.toThrow("completed without an answer");
        expect(mocks.stop).toHaveBeenCalledOnce();
    });

    test("workflow takeover aborts and stops the specialist in its isolated workspace", async () => {
        const controller = new AbortController();
        mocks.send.mockImplementationOnce(async () => new Promise(() => {}));
        const task = bridge().acpRunAgent("kronoscode", "Verify", 180, {
            workspace: "/isolated/worktree",
            signal: controller.signal,
        });
        const rejection = expect(task).rejects.toThrow("paused");
        await vi.waitFor(() => expect(mocks.send).toHaveBeenCalled());
        expect(mocks.initialize).toHaveBeenCalledWith(expect.objectContaining({ workspace: "/isolated/worktree" }));
        controller.abort();
        await rejection;
        expect(mocks.stop).toHaveBeenCalled();
    });
});
