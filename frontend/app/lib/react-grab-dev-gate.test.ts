import { describe, expect, it, vi } from "vitest";
import { selectReactGrabApi, shouldEnableReactGrab } from "./react-grab-dev-gate";

describe("shouldEnableReactGrab", () => {
    it("requires development mode and honors the explicit opt-out", () => {
        expect(shouldEnableReactGrab(true, undefined)).toBe(true);
        expect(shouldEnableReactGrab(true, "false")).toBe(false);
        expect(shouldEnableReactGrab(false, undefined)).toBe(false);
    });
});

it("uses the instance created by the package import without invoking init a second time", () => {
    const existing = { registerPlugin: vi.fn() } as any;
    const init = vi.fn();
    const api = selectReactGrabApi({ getGlobalApi: () => existing, init });
    expect(api).toBe(existing);
    expect(init).not.toHaveBeenCalled();
});

it("initializes with telemetry disabled only when no global API exists", () => {
    const created = {} as any;
    const init = vi.fn(() => created);
    expect(selectReactGrabApi({ getGlobalApi: () => null, init })).toBe(created);
    expect(init).toHaveBeenCalledExactlyOnceWith({ telemetry: false });
});
