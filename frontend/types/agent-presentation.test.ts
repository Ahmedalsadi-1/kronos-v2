import { describe, expect, test } from "vitest";
import { agentActivityCaption } from "./agent-presentation";

describe("compact agent captions", () => {
    test.each([
        ["awaiting-approval", "Waiting for your approval"],
        ["succeeded", "Task complete"],
        ["failed", "Task needs attention"],
        ["cancelled", "Task cancelled"],
        ["paused", "Paused"],
        ["verifying", "Checking the result"],
    ])("keeps %s distinct from active work", (phase, caption) => {
        expect(agentActivityCaption({ phase, action: "type", surface: "terminal" })).toBe(caption);
    });
    test("uses short surface captions independently of raw tool descriptions", () => {
        expect(agentActivityCaption({ phase: "running", action: "type", surface: "terminal" })).toBe(
            "Working in the terminal"
        );
        expect(agentActivityCaption({ phase: "running", action: "thinking" })).toBe("Thinking");
        expect(agentActivityCaption({ phase: "running", action: "inspect", surface: "file" })).toBe(
            "Checking your files"
        );
    });
});
