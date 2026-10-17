import { describe, expect, it, vi } from "vitest";
import { copySandboxArtifacts, validateSandboxRequest } from "./agent-linux-sandbox";
vi.mock("./local-linux", () => ({ LocalLinuxRuntime: class {} }));

describe("disposable Linux code sandbox", () => {
    it("rejects traversal and reserved control files before starting a VM", () => {
        for (const path of ["../secret", "/etc/passwd", "x/../../a", ".kron-script", "x\\y", "a\n"]) {
            expect(() => validateSandboxRequest({ script: "true", files: [], outputPaths: [path] })).toThrow();
        }
    });
    it("bounds UTF-8 input and script size", () => {
        expect(() =>
            validateSandboxRequest({
                script: "true",
                files: [{ path: "input", content: "é".repeat(600_000) }],
                outputPaths: [],
            })
        ).toThrow("1 MB");
        expect(() => validateSandboxRequest({ script: "x".repeat(16_001), files: [], outputPaths: [] })).toThrow();
    });
    it("accepts an explicit artifact allowlist", () => {
        expect(() =>
            validateSandboxRequest({
                script: "printf hello > result.txt",
                files: [],
                outputPaths: ["result.txt"],
            })
        ).not.toThrow();
    });
    it("does not copy artifacts from a failed run", async () => {
        const destination = { waitUntilReady: vi.fn(), writeFiles: vi.fn() };
        await expect(
            copySandboxArtifacts({ exitCode: 1, output: "failed", artifacts: [] }, destination as never)
        ).rejects.toThrow("successful");
        expect(destination.writeFiles).not.toHaveBeenCalled();
    });
});
