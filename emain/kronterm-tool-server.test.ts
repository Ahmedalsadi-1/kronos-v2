// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bindSandboxComputer, registerComputerChats } from "./computer-access-policy";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { KronTermToolServer, kronTermToolManifest } from "./kronterm-tool-server";
import { resolveToolRequestContext } from "./tool-request-context";

const mocks = vi.hoisted(() => ({
    connect: vi.fn(),
    send: vi.fn(),
    transport: null as any,
    tools: {} as Record<string, any>,
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
    setComputerTargetToolBridge: vi.fn(),
    warmKronComputerUse: vi.fn(),
}));
vi.mock("./kronterm-native-tool-bridge", () => ({ runWithAgentActivitySource: (_source, operation) => operation() }));
vi.mock("./productivity-runtime", () => ({ commandProductivity: vi.fn(), queryProductivity: vi.fn() }));
vi.mock("./emain-pet", () => ({ notifyDesktopPetSurfaceActivity: vi.fn() }));
vi.mock("./computer-targets-runtime", () => ({ getComputerTargetsRuntime: vi.fn() }));
vi.mock("./linux-desktops-runtime", () => ({ getLinuxDesktopsRuntime: vi.fn() }));
vi.mock("./sandbox-task-runtime", () => ({ SandboxTaskRuntime: vi.fn() }));

describe("tool server surface context", () => {
    beforeEach(() => vi.clearAllMocks());

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
});

test("native calls use runtime session identity and MCP cannot bypass a Computer grant", async () => {
    const context: HermesSurfaceContext = { tabId: "focused-b", agentRuntime: "hermes" };
    bindSandboxComputer("owner-a", "linux-vm:one");
    bindSandboxComputer("focused-b", "linux-container:two");
    registerComputerChats("owner-a", ["runtime-a"]);
    const server = new KronTermToolServer(() => context);
    const handler = vi.fn(async () => ({
        content: [{ type: "text", text: resolveToolRequestContext(() => null).sandboxComputerId }],
    }));
    mocks.tools.sandbox_vm_status = { enabled: true, handler };
    const call = async (sessionId?: string) => {
        const request = Object.assign(
            Readable.from([Buffer.from(JSON.stringify({ method: "call", name: "sandbox_vm_status", sessionId }))]),
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
        expect((await call("unknown")).status).toBe(400);
        expect((await call()).status).toBe(400);
        expect(handler).toHaveBeenCalledTimes(1);
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
        bindSandboxComputer("owner-a");
        bindSandboxComputer("focused-b");
        delete mocks.tools.sandbox_vm_status;
    }
});

test("native delegation enforces a private worker scope on every request and revokes it at completion", async () => {
    const { nativeToolManifest } = await import("../mcp-kron-term/src/index");
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
    vi.mocked(nativeToolManifest).mockImplementation(
        (filter = () => true) => ["sandbox_vm_exec", "terminal_execute"].filter(filter).map((name) => ({ name })) as any
    );
    mocks.tools.sandbox_vm_exec = {
        enabled: true,
        handler: async () => ({ scope: resolveToolRequestContext(() => null).delegationScope }),
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
            scope: "sandbox",
            requiredTools: ["sandbox_vm_exec"],
            taskCount: 1,
        });
        expect(prepared.status).toBe(200);
        const { token } = JSON.parse(prepared.body);
        expect(token).toMatch(/^[a-f0-9]{64}$/);
        const allowed = await request({ method: "call", name: "sandbox_vm_exec", delegationToken: token });
        expect(JSON.parse(allowed.body)).toEqual({ scope: "sandbox" });
        const denied = await request({ method: "call", name: "terminal_execute", delegationToken: token });
        expect(denied.status).toBe(404);
        expect(mocks.tools.terminal_execute.handler).not.toHaveBeenCalled();
        await request({ method: "delegate_finish", delegationToken: token, childId: "worker:1" });
        const revoked = await request({ method: "call", name: "sandbox_vm_exec", delegationToken: token });
        expect(revoked.status).toBe(400);
        expect(revoked.body).toContain("revoked");
    } finally {
        bindSandboxComputer("delegate-tab", null);
        delete mocks.tools.sandbox_vm_exec;
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
