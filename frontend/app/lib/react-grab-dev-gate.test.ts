import { describe, expect, it } from "vitest";
import { shouldEnableReactGrab } from "./react-grab-dev-gate";

describe("shouldEnableReactGrab", () => {
    it("requires development mode and honors the explicit opt-out", () => {
        expect(shouldEnableReactGrab(true, undefined)).toBe(true);
        expect(shouldEnableReactGrab(true, "false")).toBe(false);
        expect(shouldEnableReactGrab(false, undefined)).toBe(false);
    });
});
