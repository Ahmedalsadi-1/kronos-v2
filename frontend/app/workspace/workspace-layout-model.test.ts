import { globalStore } from "@/app/store/jotaiStore";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
    WorkspaceLayoutModel,
    computeWorkspacePanelLayout,
    getWorkspaceTabPresentation,
    isEmptyPanelGroupLayoutError,
} from "./workspace-layout-model";

vi.mock("@/store/global", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/store/global")>()),
    atoms: { prefersReducedMotionAtom: {} },
}));

describe("workspace panel transitions", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    function makeModel() {
        const model = Object.create(WorkspaceLayoutModel.prototype) as WorkspaceLayoutModel;
        const panel = { style: { transition: "none" } };
        model.panelContainerRef = { querySelectorAll: () => [panel] } as unknown as HTMLDivElement;
        return { model, panel };
    }

    test("uses the requested duration and clears the transition when it finishes", () => {
        vi.useFakeTimers();
        vi.spyOn(globalStore, "get").mockReturnValue(false);
        const { model, panel } = makeModel();
        model.enableTransitions(250);
        expect(panel.style.transition).toBe("flex 250ms cubic-bezier(0.2, 0.82, 0.2, 1)");
        vi.advanceTimersByTime(249);
        expect(panel.style.transition).not.toBe("none");
        vi.advanceTimersByTime(1);
        expect(panel.style.transition).toBe("none");
    });

    test("applies reduced motion immediately and cancels any pending animation timer", () => {
        vi.useFakeTimers();
        const get = vi.spyOn(globalStore, "get").mockReturnValue(false);
        const { model, panel } = makeModel();
        model.enableTransitions(250);
        get.mockReturnValue(true);
        model.enableTransitions(250);
        expect(panel.style.transition).toBe("none");
        expect(vi.getTimerCount()).toBe(0);
    });

    test("unregistering the active layout cancels pending focus and animation work", () => {
        vi.useFakeTimers();
        vi.spyOn(globalStore, "get").mockReturnValue(false);
        const { model, panel } = makeModel();
        const focus = vi.fn();
        const handle = {} as WorkspaceLayoutModel["outerPanelGroupRef"];
        model.outerPanelGroupRef = handle;
        model.enableTransitions(250);
        (model as any).focusTimeoutRef = setTimeout(focus, 350);
        model.unregisterRefs(handle);
        expect(vi.getTimerCount()).toBe(0);
        expect(panel.style.transition).toBe("none");
        vi.runAllTimers();
        expect(focus).not.toHaveBeenCalled();
    });
});

describe("getWorkspaceTabPresentation", () => {
    test("hides the left workspace tabs only in hidden mode", () => {
        expect(getWorkspaceTabPresentation("hidden")).toEqual({
            showLeftTabBar: false,
            showTopWorkspaceTabs: false,
        });
        expect(getWorkspaceTabPresentation("compact")).toEqual({
            showLeftTabBar: true,
            showTopWorkspaceTabs: false,
        });
        expect(getWorkspaceTabPresentation("full")).toEqual({
            showLeftTabBar: true,
            showTopWorkspaceTabs: false,
        });
    });
});

describe("computeWorkspacePanelLayout", () => {
    test("keeps the workspace tree left and the AI panel right of the content", () => {
        const layout = computeWorkspacePanelLayout({ windowWidth: 1200, vtabWidth: 220, aiPanelWidth: 400 });

        expect(layout.outer[0]).toBeCloseTo(18.333, 2);
        expect(layout.outer[1]).toBeCloseTo(81.667, 2);
        expect(layout.inner[0]).toBeCloseTo(59.184, 2);
        expect(layout.inner[1]).toBeCloseTo(40.816, 2);
    });

    test("lets content use the left edge when the workspace tree is collapsed", () => {
        const layout = computeWorkspacePanelLayout({ windowWidth: 1200, vtabWidth: 0, aiPanelWidth: 400 });

        expect(layout.outer).toEqual([0, 100]);
        expect(layout.inner[0]).toBeCloseTo(66.667, 2);
        expect(layout.inner[1]).toBeCloseTo(33.333, 2);
    });
});

describe("isEmptyPanelGroupLayoutError", () => {
    test("recognizes the transient react-resizable-panels remount error", () => {
        expect(isEmptyPanelGroupLayoutError(new Error("Invalid 0 panel layout: 0%, 100%"))).toBe(true);
    });

    test("does not hide real panel layout failures", () => {
        expect(isEmptyPanelGroupLayoutError(new Error("Invalid 2 panel layout: 100%"))).toBe(false);
        expect(isEmptyPanelGroupLayoutError("Invalid 0 panel layout: 0%, 100%")).toBe(false);
    });
});
