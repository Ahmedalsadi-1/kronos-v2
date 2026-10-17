// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { HermesSurfaceContext } from "./hermes-runtime";
import { KronTermToolServer } from "./kronterm-tool-server";
import { resolveToolRequestContext } from "./tool-request-context";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), send: vi.fn(), transport: null as any }));
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
    server: { connect: mocks.connect },
    createToolSessionServer: () => ({ connect: mocks.connect }),
    nativeToolManifest: vi.fn(),
    setKronTermToolBridge: vi.fn(),
    setComputerTargetToolBridge: vi.fn(),
    warmKronComputerUse: vi.fn(),
}));
vi.mock("./kronterm-native-tool-bridge", () => ({}));
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
