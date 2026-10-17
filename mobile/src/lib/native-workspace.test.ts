import { describe, expect, it } from "vitest";
import { parseWorkspaceDeepLink } from "./native-workspace";

describe("workspace deep links", () => {
    it("routes known surfaces with bounded task identifiers", () => {
        expect(parseWorkspaceDeepLink("kronterm://surface/browser?task=example")).toEqual({
            surface: "browser",
            taskID: "example",
        });
        expect(parseWorkspaceDeepLink(`kronterm://surface/emulator?task=${"a".repeat(300)}`)?.taskID).toHaveLength(128);
        expect(parseWorkspaceDeepLink("kronterm://surface/workspace")).toEqual({
            surface: "workspace",
            taskID: undefined,
        });
    });
    it("rejects external URLs and unsupported paths", () => {
        for (const value of [
            "https://surface/browser",
            "kronterm://other/browser",
            "kronterm://surface/browser/other",
            "kronterm://surface/execute",
            "invalid",
        ]) {
            expect(parseWorkspaceDeepLink(value)).toBeNull();
        }
    });
});
