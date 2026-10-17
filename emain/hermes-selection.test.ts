import { expect, it } from "vitest";
import { validateHermesSelection } from "./hermes-selection";

it("bounds structured captures and strips filename paths", () => {
    expect(
        validateHermesSelection({
            text: " context ",
            target: "current",
            images: [{ filename: "../capture.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" }],
        })
    ).toEqual({
        text: "context",
        target: "current",
        images: [{ filename: "capture.png", dataUrl: "data:image/png;base64,Y2FwdHVyZQ==" }],
    });
});
it.each([
    { text: "x".repeat(64001), target: "current" },
    { text: "context", target: "other" },
    { text: "context", target: "current", images: [{ filename: "x.png", dataUrl: "https://example.com/image.png" }] },
    {
        text: "context",
        target: "current",
        images: Array.from({ length: 5 }, () => ({ filename: "x.png", dataUrl: "data:image/png;base64,YQ==" })),
    },
    {
        text: "context",
        target: "current",
        images: [{ filename: "x.png", dataUrl: `data:image/png;base64,${"a".repeat(4_000_001)}` }],
    },
])("rejects malformed or unbounded selection payloads", (payload) => {
    expect(() => validateHermesSelection(payload)).toThrow();
});
