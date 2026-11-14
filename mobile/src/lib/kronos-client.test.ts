import { vi } from "vitest";
import { KronosHostClient, messageText, normalizeHostUrl } from "./kronos-client";

describe("normalizeHostUrl", () => {
    it("adds HTTPS and removes an API suffix", () => {
        expect(normalizeHostUrl("kron.example/api/")).toBe("https://kron.example");
    });

    it("preserves explicit local HTTP endpoints", () => {
        expect(normalizeHostUrl("http://192.168.1.8:4119/")).toBe("http://192.168.1.8:4119");
    });

    it("rejects unsupported protocols", () => {
        expect(() => normalizeHostUrl("ftp://kron.example")).toThrow("HTTPS or HTTP");
    });
});

describe("messageText", () => {
    it("does not flatten tool or reasoning parts into the assistant answer", () => {
        expect(
            messageText([
                { type: "reasoning", text: "private trace" },
                { type: "tool", text: "tool result" },
                { type: "text", text: "Visible answer" },
            ])
        ).toBe("Visible answer");
    });
});

it("distinguishes a valid empty session list from an unrelated host response", async () => {
    const client = new KronosHostClient({
        id: "labs",
        label: "Labs host",
        baseUrl: "https://labs.example",
        kind: "managed",
        color: "#2567f2",
        capabilities: [],
        createdAt: 0,
    });
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
        fetch.mockResolvedValueOnce(Response.json({ status: "ok" }));
        await expect(client.listSessions()).rejects.toThrow("compatible iPhone session list");
        fetch.mockResolvedValueOnce(Response.json({ sessions: [] }));
        await expect(client.listSessions()).resolves.toEqual([]);
        fetch.mockResolvedValueOnce(Response.json([{ id: "session-1" }]));
        await expect(client.listSessions()).resolves.toEqual([{ id: "session-1" }]);
    } finally {
        fetch.mockRestore();
    }
});
