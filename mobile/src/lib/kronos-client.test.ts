import { messageText, normalizeHostUrl } from "./kronos-client";

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
