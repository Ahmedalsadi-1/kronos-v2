import { describe, expect, it } from "vitest";
import { filePathFromAgentInput, resolveAgentFilePath } from "./agent-file-activity";

describe("agent file targets", () => {
    it("extracts complete structured file targets without retaining patch contents", () => {
        expect(filePathFromAgentInput({ file_path: "/project/long file.ts", content: "secret" })).toBe(
            "/project/long file.ts"
        );
        expect(
            filePathFromAgentInput({ patch: "*** Begin Patch\n*** Update File: src/main.ts\n+private contents" })
        ).toBe("src/main.ts");
        expect(filePathFromAgentInput({ path: [{ x: 1, y: 2 }] })).toBeUndefined();
    });
    it("resolves relative files within the project and rejects unrelated targets", () => {
        expect(resolveAgentFilePath("src/main.ts", "/project")).toBe("/project/src/main.ts");
        expect(resolveAgentFilePath("/project/src/main.ts", "/project")).toBe("/project/src/main.ts");
        expect(resolveAgentFilePath("../elsewhere/file.ts", "/project")).toBeUndefined();
        expect(resolveAgentFilePath("https://example.com/file", "/project")).toBeUndefined();
    });
});
