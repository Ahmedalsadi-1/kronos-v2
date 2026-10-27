import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ lspStart: vi.fn(), lspStop: vi.fn() }));
vi.mock("@/app/store/global", () => ({ getApi: () => api }));

import { LspService } from "./lsp-service";

afterEach(() => {
    LspService.dispose();
    vi.clearAllMocks();
});

describe("LSP startup ownership", () => {
    it("shares an in-flight startup across editors for the same language", async () => {
        let resolveStart: (id: string) => void;
        api.lspStart.mockImplementationOnce(() => new Promise((resolve) => (resolveStart = resolve)));
        const first = LspService.startLanguageServer("go");
        const second = LspService.startLanguageServer("go");
        expect(api.lspStart).toHaveBeenCalledTimes(1);
        resolveStart("shared");
        expect(await first).toBe(await second);
    });

    it("stops a server that finishes starting after disposal", async () => {
        let resolveStart: (id: string) => void;
        api.lspStart.mockImplementationOnce(() => new Promise((resolve) => (resolveStart = resolve)));
        const pending = LspService.startLanguageServer("go");
        const rejected = expect(pending).rejects.toThrow(/cancelled/);
        LspService.dispose();
        resolveStart("late");
        await rejected;
        expect(api.lspStop).toHaveBeenCalledWith("late");
        expect(LspService.getSession("late")).toBeUndefined();
    });

    it("allows retry after startup fails", async () => {
        api.lspStart.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce("retry");
        await expect(LspService.startLanguageServer("go")).rejects.toThrow("unavailable");
        const session = await LspService.startLanguageServer("go");
        expect(session.sessionId).toBe("retry");
        expect(api.lspStart).toHaveBeenCalledTimes(2);
    });
});
