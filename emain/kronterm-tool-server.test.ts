// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import { join } from "node:path";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bindSandboxChatComputer, bindSandboxComputer, registerComputerChats } from "./computer-access-policy";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { availableHermesCodingToolNames, KronTermToolServer, kronTermToolManifest } from "./kronterm-tool-server";
import { swarmWorkerContext } from "./swarm-target-scope";
import { registerSwarmWorker } from "./swarm-worker-registry";
import { resolveToolRequestContext, withToolRequestContext } from "./tool-request-context";

const mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    activitySource: vi.fn((_source, operation, _sessionId) => operation()),
    send: vi.fn(),
    transport: null as any,
    tools: {} as Record<string, any>,
    skills: vi.fn(),
    workflow: vi.fn(),
}));
vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
    StreamableHTTPServerTransport: class {
        onmessage: any;
        send = mocks.send;
        constructor() {
            mocks.transport = this;
        }
    },
}));
vi.mock("../mcp-kron-term/src/index", () => ({
    server: { connect: mocks.connect, _registeredTools: mocks.tools },
    createToolSessionServer: () => ({ connect: mocks.connect }),
    nativeToolManifest: vi.fn(),
    setKronTermToolBridge: vi.fn(),
    setSharedSkillCatalog: mocks.skills,
    setComputerTargetToolBridge: vi.fn(),
    warmKronComputerUse: vi.fn(),
}));
vi.mock("./kronterm-native-tool-bridge", () => ({
    runWithAgentActivitySource: mocks.activitySource,
    KronTermNativeToolBridge: class {
        constructor(private context: () => HermesSurfaceContext) {}
        withToolTarget = (_target, operation) =>
            withToolRequestContext({ ...this.context(), workspaceId: "resolved-owner" }, operation);
    },
}));
vi.mock("./hermes-runtime", () => ({ HermesRuntime: { n8nCommand: mocks.workflow } }));
vi.mock("./productivity-runtime", () => ({ commandProductivity: vi.fn(), queryProductivity: vi.fn() }));
vi.mock("./emain-pet", () => ({ notifyDesktopPetSurfaceActivity: vi.fn() }));
vi.mock("./computer-targets-runtime", () => ({ getComputerTargetsRuntime: vi.fn() }));
vi.mock("./linux-desktops-runtime", () => ({ getLinuxDesktopsRuntime: vi.fn() }));
vi.mock("./sandbox-task-runtime", () => ({ SandboxTaskRuntime: vi.fn() }));
vi.mock("./swarm-runtime", () => ({ makeSwarmRuntime: vi.fn() }));

describe("tool server surface context", () => {
    beforeEach(() => vi.clearAllMocks());
    test("passes resolved workspace ownership and cancellation to n8n operations", async () => {
        const server = new KronTermToolServer(() => ({ tabId: "background-tab", n8nWorkflowId: "flow" }));
        const signal = new AbortController().signal;
        await (server as any).invokeWorkflowTool("workflows", {}, signal);
        expect(mocks.workflow).toHaveBeenCalledWith(
            { operation: "workflows" },
            expect.objectContaining({ workspaceId: "resolved-owner", tabId: "background-tab", n8nWorkflowId: "flow" }),
            signal
        );
    });
    test("initializes the in-process shared skill catalog from desktop roots", () => {
        new KronTermToolServer(() => ({ tabId: "tab-1" }));
        const catalog = mocks.skills.mock.calls.at(-1)[0];
        expect(catalog.configuredRoots().some((root: string) => root.endsWith(".agents/skills"))).toBe(true);
        expect(catalog.list("kronterm-tool-workflows").length).toBeGreaterThan(0);
    });

    test("resolves skill roots for each authenticated caller without leaking another project's roots", async () => {
        const first = join(process.cwd(), "project-one");
        const second = join(process.cwd(), "project-two");
        new KronTermToolServer(() => ({ agentWorkspace: first }));
        const catalog = mocks.skills.mock.calls.at(-1)[0];
        expect(catalog.configuredRoots()).toContain(join(first, ".agents", "skills"));
        await withToolRequestContext({ agentWorkspace: second }, async () => {
            await Promise.resolve();
            const roots = catalog.configuredRoots();
            expect(roots).toContain(join(second, ".hermes", "skills"));
            expect(roots).not.toContain(join(first, ".agents", "skills"));
        });
        expect(catalog.configuredRoots()).not.toContain(join(second, ".hermes", "skills"));
    });

    test("issues opaque caller identities stable across registration and distinct between callers", async () => {
        const server = new KronTermToolServer(() => ({ tabId: "tab-1" }));
        const identities: string[] = [];
        const recordIdentity = () => identities.push(resolveToolRequestContext(() => null).nativeCallerId);
        const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "browser_open" } };
        const firstToken = server.registerCaller("agent-a", () => ({ tabId: "tab-1", nativeCallerId: "forged" }));
        await (server as any).createTransport(firstToken);
        mocks.connect.mock.calls.at(-1)[0].onmessage = recordIdentity;
        mocks.transport.onmessage(call);

        const refreshedToken = server.registerCaller("agent-a", () => ({ tabId: "tab-2", nativeCallerId: "changed" }));
        expect(refreshedToken).toBe(firstToken);
        mocks.transport.onmessage(call);

        const secondToken = server.registerCaller("agent-b", () => ({ tabId: "tab-2" }));
        await (server as any).createTransport(secondToken);
        mocks.connect.mock.calls.at(-1)[0].onmessage = recordIdentity;
        mocks.transport.onmessage(call);

        expect(identities).toHaveLength(3);
        expect(identities[0]).toMatch(/^[a-f0-9]{48}$/);
        expect(identities[1]).toBe(identities[0]);
        expect(identities[2]).not.toBe(identities[0]);
        expect(secondToken).not.toBe(firstToken);
        expect(identities).not.toContain(firstToken);
        expect(identities).not.toContain(secondToken);
    });

    test("uses the current runtime provider when enforcing and advertising MCP tools", async () => {
        const server = new KronTermToolServer(() => ({ tabId: "tab-1", hostMode: "kronterm" }));
        await (server as any).createTransport();
        const scoped = mocks.connect.mock.calls[0][0];
        const onmessage = vi.fn();
        scoped.onmessage = onmessage;
        const context: HermesSurfaceContext = {
            tabId: "tab-2",
            blockId: "browser-2",
            hostMode: "web-fullscreen",
            capabilities: { browser: true, terminal: false, files: false, sandbox: false, computerControl: false },
        };
        server.setContextProvider(() => context);

        mocks.transport.onmessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "terminal_open" } });
        expect(onmessage).not.toHaveBeenCalled();
        expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ id: 1, error: expect.any(Object) }));

        mocks.transport.onmessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
        await scoped.send({
            jsonrpc: "2.0",
            id: 2,
            result: { tools: [{ name: "terminal_open" }, { name: "browser_open" }] },
        });
        expect(mocks.send).toHaveBeenLastCalledWith(
            { jsonrpc: "2.0", id: 2, result: { tools: [{ name: "browser_open" }] } },
            undefined
        );

        server.setContextProvider(() => ({ tabId: "tab-3", hostMode: "kronterm" }));
        mocks.transport.onmessage({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "terminal_open" } });
        expect(onmessage).toHaveBeenLastCalledWith(expect.objectContaining({ id: 3 }), undefined);
    });

    test("scoped MCP transport filters discovery and rejects another block before dispatch", async () => {
        const parent = { tabId: "tab", workspaceId: "workspace" };
        const context = swarmWorkerContext(parent, "run", {
            id: "browser:assigned",
            kind: "browser",
            label: "Browser",
            generation: 0,
            resourceKeys: ["block:assigned"],
            blockId: "assigned",
            tabId: parent.tabId,
        });
        const server = new KronTermToolServer(() => parent);
        const token = server.registerCaller("scoped-mcp", () => context);
        await (server as any).createTransport(token);
        const scoped = mocks.connect.mock.calls.at(-1)[0];
        const onmessage = vi.fn();
        scoped.onmessage = onmessage;
        mocks.transport.onmessage({ jsonrpc: "2.0", id: 10, method: "tools/list" });
        await scoped.send({
            jsonrpc: "2.0",
            id: 10,
            result: { tools: [{ name: "widget_snapshot" }, { name: "terminal_open" }] },
        });
        expect(mocks.send.mock.calls.at(-1)[0].result.tools).toEqual([{ name: "widget_snapshot" }]);
        onmessage.mockClear();
        for (const [id, blockId] of [
            [11, "wrong"],
            [12, "assigned"],
        ]) {
            mocks.transport.onmessage({
                jsonrpc: "2.0",
                id,
                method: "tools/call",
                params: { name: "widget_snapshot", arguments: { blockId } },
            });
        }
        expect(mocks.send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 11, error: expect.any(Object) }));
        expect(onmessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 12 }), undefined);
    });
});

test("native calls use runtime session identity and MCP cannot bypass a Computer grant", async () => {
    const context: HermesSurfaceContext = { tabId: "focused-b", agentRuntime: "hermes" };
    bindSandboxComputer("owner-a", "linux-vm:one");
    bindSandboxComputer("focused-b", "linux-container:two");
    registerComputerChats("owner-a", ["runtime-a"]);
    registerComputerChats("owner-a", ["runtime-c", "stored-c"]);
    bindSandboxChatComputer("owner-a", "stored-c", "linux-vm:three");
    const server = new KronTermToolServer(() => context);
    const handler = vi.fn(async () => ({
        content: [{ type: "text", text: resolveToolRequestContext(() => null).sandboxComputerId }],
    }));
    mocks.tools.sandbox_vm_status = { enabled: true, handler };
    const call = async (sessionId?: string, method = "call") => {
        const request = Object.assign(
            Readable.from([Buffer.from(JSON.stringify({ method, name: "sandbox_vm_status", sessionId }))]),
            { method: "POST" }
        );
        const response = Object.assign(new EventEmitter(), {
            status: 0,
            body: "",
            headersSent: false,
            writableEnded: false,
            destroyed: false,
            writeHead(status: number) {
                this.status = status;
                this.headersSent = true;
                return this;
            },
            end(text: string) {
                this.body = text;
                this.writableEnded = true;
                return this;
            },
        });
        await (server as any).handleNativeRequest(request, response);
        return response;
    };
    try {
        const valid = await call("runtime-a");
        expect(valid.status).toBe(200);
        expect(JSON.parse(valid.body).content[0].text).toBe("linux-vm:one");
        const separate = await call("runtime-c");
        expect(separate.status).toBe(200);
        expect(JSON.parse(separate.body).content[0].text).toBe("linux-vm:three");
        expect((await call("unknown")).status).toBe(400);
        expect((await call()).status).toBe(400);
        expect(handler).toHaveBeenCalledTimes(2);
        expect(JSON.parse((await call("runtime-a", "scope")).body).builtinTools).toEqual([]);
        expect((await call("unknown", "scope")).status).toBe(400);
        const token = server.registerCaller("hermes", () => context);
        await (server as any).createTransport(token);
        mocks.connect.mock.calls.at(-1)[0].onmessage = vi.fn();
        mocks.transport.onmessage({
            jsonrpc: "2.0",
            id: 99,
            method: "tools/call",
            params: { name: "sandbox_vm_status" },
        });
        expect(mocks.send.mock.calls.at(-1)[0].error.message).toContain("session-scoped native adapter");
    } finally {
        bindSandboxChatComputer("owner-a", "stored-c");
        bindSandboxComputer("owner-a");
        bindSandboxComputer("focused-b");
        delete mocks.tools.sandbox_vm_status;
    }
});

test("Hermes coding tools follow workspace, computer and delegation scope", () => {
    const context: HermesSurfaceContext = { tabId: "coding-tab", agentRuntime: "hermes" };
    const coding = ["terminal", "process_manage", "read_file", "write_file", "patch", "search_files"];
    expect(availableHermesCodingToolNames(context)).toEqual(coding);
    expect(availableHermesCodingToolNames({ ...context, delegationScope: "inherit" })).toEqual(coding);
    expect(availableHermesCodingToolNames({ ...context, delegationScope: "widgets" })).toEqual([]);
    expect(availableHermesCodingToolNames({ ...context, delegationScope: "sandbox" })).toEqual([]);
    expect(availableHermesCodingToolNames({ ...context, n8nWorkerId: "worker" })).toEqual([]);
    expect(availableHermesCodingToolNames({})).toEqual([]);
    expect(availableHermesCodingToolNames({ ...context, hostMode: "web-fullscreen" })).toEqual([]);
    try {
        bindSandboxComputer(context.tabId, "coding-vm");
        expect(availableHermesCodingToolNames(context)).toEqual([]);
        bindSandboxComputer(context.tabId, "coding-vm", "hybrid");
        expect(availableHermesCodingToolNames(context)).toEqual(coding);
        expect(availableHermesCodingToolNames({ ...context, delegationScope: "sandbox" })).toEqual([]);
    } finally {
        bindSandboxComputer(context.tabId, null);
    }
});

test("native swarm calls expose only granted tools, require the exact block, and deny revoked identities", async () => {
    const context = { tabId: "swarm-tab", workspaceId: "workspace", nativeCallerId: "trusted-swarm-caller" };
    const worker = swarmWorkerContext(context, "swarm-run", {
        id: "browser:assigned",
        kind: "browser",
        label: "Browser",
        blockId: "assigned",
        tabId: context.tabId,
        generation: 0,
        resourceKeys: ["block:assigned"],
    });
    const grant = registerSwarmWorker(["swarm-engine-id"], worker);
    const server = new KronTermToolServer(() => context);
    const snapshot = vi.fn(async () => ({ content: [{ type: "text", text: "observed" }] }));
    mocks.tools.widget_snapshot = { enabled: true, handler: snapshot, annotations: { readOnlyHint: true } };
    mocks.tools.terminal_input = { enabled: true, handler: vi.fn() };
    const request = async (payload: Record<string, unknown>, revokeWhileReading = false) => {
        const token = revokeWhileReading ? server.registerCaller("retiring-hermes", () => context) : undefined;
        const body = JSON.stringify({ ...payload, sessionId: "swarm-engine-id" });
        const chunks = async function* () {
            yield body;
            if (revokeWhileReading) server.unregisterCaller("retiring-hermes");
        };
        const input = Object.assign(Readable.from(chunks()), {
            method: "POST",
        });
        const output = Object.assign(new EventEmitter(), {
            status: 0,
            body: "",
            headersSent: false,
            writableEnded: false,
            destroyed: false,
            writeHead(status: number) {
                this.status = status;
                this.headersSent = true;
                return this;
            },
            end(body: string) {
                this.body = body;
                this.writableEnded = true;
                return this;
            },
        });
        await (server as any).handleNativeRequest(input, output, token);
        return { status: output.status, body: JSON.parse(output.body) };
    };
    try {
        expect(await request({ method: "scope" })).toEqual({
            status: 200,
            body: { scope: { swarm: true }, tools: [{ name: "widget_snapshot" }], builtinTools: [] },
        });
        expect((await request({ method: "call", name: "terminal_input" })).status).toBe(404);
        expect((await request({ method: "delegate_prepare" })).status).toBe(400);
        expect(
            (await request({ method: "call", name: "widget_snapshot", arguments: { blockId: "other" } })).status
        ).toBe(400);
        expect(
            (await request({ method: "call", name: "widget_snapshot", arguments: { blockId: "assigned" } })).status
        ).toBe(200);
        expect(snapshot).toHaveBeenCalledTimes(1);
        expect((await request({ method: "scope" }, true)).status).toBe(401);
        grant.revoke();
        expect((await request({ method: "scope" })).status).toBe(400);
    } finally {
        grant.revoke();
        delete mocks.tools.widget_snapshot;
        delete mocks.tools.terminal_input;
    }
});

test("native delegation enforces a private worker scope on every request and revokes it at completion", async () => {
    const context: HermesSurfaceContext = { tabId: "delegate-tab", nativeCallerId: "trusted-caller" };
    bindSandboxComputer("delegate-tab", "delegate-vm");
    const server = new KronTermToolServer(() => context);
    const { DelegationPolicy } = await import("./delegation-policy");
    (server as any).delegations = new DelegationPolicy(
        async () =>
            ({
                ready: true,
                status: "running",
                controlOwner: "agent",
                assignedAgentId: "sandbox:delegate-tab",
                controlGeneration: 3,
            }) as any
    );
    const sandboxTools = [
        "sandbox_vm_status",
        "sandbox_vm_exec",
        "sandbox_vm_files",
        "sandbox_vm_browser",
        "sandbox_vm_desktop",
    ];
    for (const name of sandboxTools) mocks.tools[name] = { enabled: true, handler: vi.fn() };
    let workerSignal: AbortSignal;
    mocks.tools.sandbox_vm_exec = {
        enabled: true,
        handler: async (_args, { signal }) => {
            workerSignal = signal;
            return { scope: resolveToolRequestContext(() => null).delegationScope };
        },
    };
    mocks.tools.terminal_execute = { enabled: true, handler: vi.fn() };
    const request = async (payload: object) => {
        const input = Object.assign(Readable.from([Buffer.from(JSON.stringify(payload))]), { method: "POST" });
        const output = Object.assign(new EventEmitter(), {
            body: "",
            status: 0,
            headersSent: false,
            writableEnded: false,
            destroyed: false,
            writeHead(status: number) {
                this.status = status;
                this.headersSent = true;
                return this;
            },
            end(body: string) {
                this.body = body;
                this.writableEnded = true;
                return this;
            },
        });
        await (server as any).handleNativeRequest(input, output);
        return output;
    };
    try {
        const prepared = await request({
            method: "delegate_prepare",
            requiredTools: ["sandbox_vm_exec"],
            taskCount: 1,
        });
        expect(prepared.status).toBe(200);
        const { token } = JSON.parse(prepared.body);
        expect(token).toMatch(/^[a-f0-9]{64}$/);
        const list = await request({ method: "list", namesOnly: true, delegationToken: token });
        expect(JSON.parse(list.body).tools).toEqual(sandboxTools.map((name) => ({ name })));
        const scope = await request({ method: "scope", delegationToken: token });
        expect(JSON.parse(scope.body).builtinTools).toEqual([]);
        const allowed = await request({
            method: "call",
            name: "sandbox_vm_exec",
            delegationToken: token,
            childId: "worker:1",
            sessionId: "parent",
        });
        expect(mocks.activitySource).toHaveBeenLastCalledWith("hermes", expect.any(Function), "worker:1", undefined);
        expect(JSON.parse(allowed.body)).toEqual({ scope: "sandbox" });
        mocks.tools.sandbox_vm_exec.handler = vi.fn().mockRejectedValue(new Error("Response lost after dispatch"));
        const uncertain = await request({ method: "call", name: "sandbox_vm_exec", delegationToken: token });
        expect(JSON.parse(uncertain.body)).toMatchObject({
            error: "Response lost after dispatch",
            failure: { code: "TOOL_EXECUTION_UNCERTAIN", retryable: false, uncertain: true },
        });
        const denied = await request({ method: "call", name: "terminal_execute", delegationToken: token });
        expect(denied.status).toBe(404);
        expect(mocks.tools.terminal_execute.handler).not.toHaveBeenCalled();
        await request({ method: "delegate_finish", delegationToken: token, childId: "worker:1" });
        expect(workerSignal.aborted).toBe(true);
        const revoked = await request({ method: "call", name: "sandbox_vm_exec", delegationToken: token });
        expect(revoked.status).toBe(400);
        expect(revoked.body).toContain("revoked");
        expect((await request({ method: "scope", delegationToken: token })).status).toBe(400);

        bindSandboxComputer("delegate-tab", null);
        const coding = await request({
            method: "delegate_prepare",
            scope: "inherit",
            requiredTools: ["terminal", "write_file", "patch"],
            taskCount: 1,
        });
        expect(coding.status).toBe(200);
        const codingToken = JSON.parse(coding.body).token;
        const codingScope = await request({ method: "scope", delegationToken: codingToken, childId: "coder" });
        expect(JSON.parse(codingScope.body).builtinTools).toContain("write_file");
        expect(JSON.parse(codingScope.body).builtinTools).toContain("terminal");
        await request({ method: "delegate_cancel", delegationToken: codingToken, childId: "coder" });
        expect((await request({ method: "scope", delegationToken: codingToken, childId: "coder" })).status).toBe(400);
        await request({ method: "delegate_finish", delegationToken: codingToken });
    } finally {
        bindSandboxComputer("delegate-tab", null);
        for (const name of sandboxTools) delete mocks.tools[name];
        delete mocks.tools.terminal_execute;
    }
});

test("startup exports all enabled tool schemas with the required manifest predicate", async () => {
    const { nativeToolManifest } = await import("../mcp-kron-term/src/index");
    const schemas = [{ name: "sandbox_vm_exec" }, { name: "terminal_execute" }];
    vi.mocked(nativeToolManifest).mockImplementation((filter) => {
        if (typeof filter !== "function") throw new TypeError("toolAllowed is not a function");
        return schemas.filter((tool) => filter(tool.name)) as any;
    });
    expect(kronTermToolManifest()).toEqual(schemas);
});
