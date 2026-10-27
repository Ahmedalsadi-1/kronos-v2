import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ startLanguageServer: vi.fn(), clientConstructor: vi.fn() }));
vi.mock("@/app/lsp/lsp-service", () => ({ LspService: { startLanguageServer: mocks.startLanguageServer } }));
vi.mock("@/app/lsp/lsp-transport", () => ({ IpcMessageReader: class {}, IpcMessageWriter: class {} }));
vi.mock("monaco-languageclient", () => ({
    MonacoLanguageClient: class {
        constructor() {
            return mocks.clientConstructor();
        }
    },
}));

import { startLspClient, stopAllLspClients } from "./lsp-client-manager";

afterEach(() => {
    stopAllLspClients();
    vi.clearAllMocks();
});

describe("LSP client resource ownership", () => {
    it("constructs only one client while the language server is starting", async () => {
        let resolveStart: (session: any) => void;
        mocks.startLanguageServer.mockImplementationOnce(() => new Promise((resolve) => (resolveStart = resolve)));
        const client = {
            start: vi.fn(),
            stop: vi.fn(),
            sendNotification: vi.fn(),
            onDidChangeState: vi.fn(),
        };
        mocks.clientConstructor.mockReturnValue(client);
        const model = { uri: { toString: () => "file:///main.go" }, getValue: () => "", onDidChangeContent: vi.fn() };
        const first = startLspClient(model as any, "go");
        const second = startLspClient(model as any, "go");
        resolveStart({ stop: vi.fn() });
        expect(await first).toBe(await second);
        expect(mocks.startLanguageServer).toHaveBeenCalledTimes(1);
        expect(mocks.clientConstructor).toHaveBeenCalledTimes(1);
    });

    it("releases the language server when its client reaches the stopped state", async () => {
        const session = { stop: vi.fn() };
        const changeSub = { dispose: vi.fn() };
        let onStateChange: (state: { newState: number }) => void;
        mocks.startLanguageServer.mockResolvedValueOnce(session);
        mocks.clientConstructor.mockReturnValue({
            start: vi.fn(),
            stop: vi.fn(),
            sendNotification: vi.fn(),
            onDidChangeState: (handler: typeof onStateChange) => (onStateChange = handler),
        });
        const model = {
            uri: { toString: () => "file:///main.go" },
            getValue: () => "",
            onDidChangeContent: () => changeSub,
        };
        await startLspClient(model as any, "go");
        onStateChange({ newState: 3 });
        expect(changeSub.dispose).toHaveBeenCalledOnce();
        expect(session.stop).toHaveBeenCalledOnce();
    });
});
