// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_SETTINGS_VIEWS } from "./views";
import { openWorkspaceTool, WorkspaceTools } from "./workspace-tools";

afterEach(() => vi.unstubAllGlobals());

describe("permanent workspace tools", () => {
    it("keeps both settings destinations available without a desktop bridge", () => {
        vi.stubGlobal("hermesDesktop", undefined);
        expect(WorkspaceTools.map((tool) => tool.id)).toEqual(["kronrender", "kronflow"]);
        expect(BASE_SETTINGS_VIEWS).toEqual(expect.arrayContaining(["kronrender", "kronflow"]));
    });

    it("opens KronFlow through workspace navigation", async () => {
        const navigate = vi.fn();
        await openWorkspaceTool("kronflow", navigate);
        expect(navigate).toHaveBeenCalledOnce();
    });

    it("launches the existing KronRender workspace and reports unavailable hosts", async () => {
        const launchWorkspace = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal("hermesDesktop", { krontermSurfaces: { launchWorkspace } });
        await openWorkspaceTool("kronrender", vi.fn());
        expect(launchWorkspace).toHaveBeenCalledWith("comfy-workflow");
        vi.stubGlobal("hermesDesktop", undefined);
        await expect(openWorkspaceTool("kronrender", vi.fn())).rejects.toThrow("KronOS desktop");
    });

    it("preserves launch failures so callers can display an error", async () => {
        vi.stubGlobal("hermesDesktop", {
            krontermSurfaces: { launchWorkspace: vi.fn().mockRejectedValue(new Error("Unavailable")) },
        });
        await expect(openWorkspaceTool("kronrender", vi.fn())).rejects.toThrow("Unavailable");
    });
});
