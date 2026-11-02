import { EventEmitter } from "node:events";
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { N8nRuntime, n8nCatalogReady, resolveN8nPaths } from "./n8n-runtime";

const mocks = vi.hoisted(() => ({
    spawn: vi.fn(),
    bridge: vi.fn(),
    revoke: vi.fn(),
    grants: vi.fn(),
    session: vi.fn(),
    requests: vi.fn(),
}));
vi.mock("./authkey", () => ({ revokeManagedRuntimeRequests: mocks.grants }));
vi.mock("./workflow-account", () => ({ releaseWorkflowSession: mocks.session }));
vi.mock("./n8n-client", () => ({ releaseN8nRequests: mocks.requests }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("./kronterm-tool-server", () => ({
    startKronTermToolServer: mocks.bridge,
    revokeKronTermToolCaller: mocks.revoke,
}));

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

function setup() {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
    vi.spyOn(fs.promises, "readFile").mockResolvedValue(
        JSON.stringify([
            { name: "CUSTOM.kronTermTool" },
            { name: "CUSTOM.kronTermHarness" },
            { name: "CUSTOM.kronTermWidget" },
            { name: "CUSTOM.hermesAgent" },
        ])
    );
    const child = Object.assign(new EventEmitter(), {
        pid: 123456789,
        exitCode: null,
        signalCode: null,
        stderr: new EventEmitter(),
    });
    mocks.spawn.mockReturnValue(child);
    mocks.bridge.mockResolvedValue({ nativeUrl: "http://127.0.0.1:1234/native", token: "private-token" });
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true }))
    );
    vi.spyOn(process, "kill").mockReturnValue(true);
    return { child, runtime: new N8nRuntime() };
}

describe("managed n8n runtime", () => {
    it("waits for a complete catalog containing all attached nodes", async () => {
        const read = vi.spyOn(fs.promises, "readFile");
        read.mockResolvedValueOnce("{}").mockResolvedValueOnce('[{"name":');
        expect(await n8nCatalogReady("/test")).toBe(false);
        read.mockResolvedValueOnce("{}").mockResolvedValueOnce("[]");
        expect(await n8nCatalogReady("/test")).toBe(false);
        read.mockResolvedValueOnce("{}").mockResolvedValueOnce(
            JSON.stringify([
                { name: "CUSTOM.kronTermTool" },
                { name: "CUSTOM.kronTermHarness" },
                { name: "CUSTOM.kronTermWidget" },
                { name: "CUSTOM.hermesAgent" },
            ])
        );
        expect(await n8nCatalogReady("/test")).toBe(true);
    });
    it("rejects missing workspace scope and reports unbuilt source", async () => {
        const runtime = new N8nRuntime();
        await expect(runtime.start({})).rejects.toThrow("workspace tab");
        vi.spyOn(fs, "existsSync").mockReturnValue(false);
        expect(resolveN8nPaths).toThrow("n8n is not built");
        expect(mocks.spawn).not.toHaveBeenCalled();
    });

    it("starts once, waits for readiness, pins the context, and keeps bridge credentials private", async () => {
        const { runtime, child } = setup();
        const context = { workspaceId: "workspace", tabId: "tab", capabilities: { browser: true } } as any;
        const first = runtime.start(context);
        const second = runtime.start(context);
        expect(first).toBe(second);
        const status = await first;
        expect(status).toEqual({ running: true, url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/) });
        expect(JSON.stringify(status)).not.toContain("private-token");
        const provider = mocks.bridge.mock.calls[0][0];
        context.capabilities.browser = false;
        expect(provider().capabilities.browser).toBe(true);
        const options = mocks.spawn.mock.calls[0][2];
        expect(options.env.N8N_LISTEN_ADDRESS).toBe("127.0.0.1");
        expect(options.env.KRONTERM_N8N_TOOL_TOKEN).toBe("private-token");
        await expect(runtime.start({ workspaceId: "other", tabId: "other" })).rejects.toThrow("Stop n8n");
        expect(mocks.spawn).toHaveBeenCalledTimes(1);
        child.emit("exit", 1);
        expect(runtime.status()).toEqual({ running: false });
        expect(mocks.revoke).toHaveBeenCalledTimes(1);
        expect(mocks.grants).toHaveBeenCalledWith(status.url);
        expect(mocks.grants).toHaveBeenCalledWith(status.url.replace(/^http/, "ws"));
        expect(mocks.session).toHaveBeenCalledWith(status.url);
        expect(mocks.requests).toHaveBeenCalledWith(status.url);
        runtime.stop();
        expect(mocks.revoke).toHaveBeenCalledTimes(1);
    });

    it("does not spawn a process after startup is cancelled", async () => {
        const { runtime } = setup();
        let release: (value: any) => void;
        mocks.bridge.mockReturnValueOnce(
            new Promise((resolve) => {
                release = resolve;
            })
        );
        const pending = runtime.start({ workspaceId: "workspace", tabId: "tab" });
        runtime.stop();
        release({ nativeUrl: "http://127.0.0.1:1234/native", token: "private-token" });
        await expect(pending).rejects.toThrow("cancelled");
        expect(mocks.spawn).not.toHaveBeenCalled();
    });
});
