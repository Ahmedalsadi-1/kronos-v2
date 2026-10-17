import { describe, expect, it } from "vitest";

import { shouldRenderHermesAuxiliarySurfaces } from "./workspace-hermes-surfaces";

describe("workspace Hermes auxiliary surfaces", () => {
    it("suppresses the HUD and panel only in web mode", () => {
        expect(shouldRenderHermesAuxiliarySurfaces("web")).toBe(false);
        expect(shouldRenderHermesAuxiliarySurfaces("widgets")).toBe(true);
        expect(shouldRenderHermesAuxiliarySurfaces("tabs")).toBe(true);
        expect(shouldRenderHermesAuxiliarySurfaces("canvas")).toBe(true);
        expect(shouldRenderHermesAuxiliarySurfaces("os")).toBe(true);
    });
});
