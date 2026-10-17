import { beforeEach, describe, expect, it, vi } from "vitest";
import { installHermesWorkflowPack } from "./hermes-workflow-packs";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: (...args: unknown[]) => execute(...args) }));
vi.mock("node:fs", () => ({ default: { existsSync: () => true } }));

describe("profile-scoped workflow packs", () => {
    beforeEach(() => {
        execute.mockReset();
    });
    it("requires reviewed catalog content before running a process", async () => {
        await expect(installHermesWorkflowPack({ pack: "diagram-design" }, "/profiles/research")).rejects.toThrow(
            "review"
        );
        await expect(
            installHermesWorkflowPack({ pack: "../../arbitrary", reviewed: true }, "/profiles/research")
        ).rejects.toThrow("supported");
        expect(execute).not.toHaveBeenCalled();
    });
    it("rejects unresolved profile directories", async () => {
        await expect(installHermesWorkflowPack({ pack: "productivity", reviewed: true }, "relative")).rejects.toThrow(
            "absolute"
        );
        expect(execute).not.toHaveBeenCalled();
    });
    it("passes the backend profile directory as a literal process argument", async () => {
        execute.mockImplementation((_binary, _args, _options, callback) =>
            callback(null, "/profiles/research/skills/kw-productivity\n", "")
        );
        const result = await installHermesWorkflowPack({ pack: "productivity", reviewed: true }, "/profiles/research");
        expect(execute.mock.calls[0][1]).toEqual(
            expect.arrayContaining(["productivity", "--reviewed", "--skills-dir", "/profiles/research/skills"])
        );
        expect(result.installed).toBe("/profiles/research/skills/kw-productivity");
    });
});
