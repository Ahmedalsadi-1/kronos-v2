// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSWebNavBar } from "./os-web-navbar";

const models = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("@/store/global", () => ({ getBlockComponentModel: models.lookup, getApi: () => ({}) }));
vi.mock("@/app/view/webview/webview", () => ({ BrowserPageToolbar: () => <div role="toolbar">Ready</div> }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("recovers the toolbar when a browser model becomes ready after the old retry deadline", async () => {
    vi.useFakeTimers();
    const home = document.createElement("div");
    document.body.append(home);
    const root = createRoot(home);
    try {
        models.lookup.mockReturnValue(undefined);
        await act(async () => root.render(<OSWebNavBar blockId="slow-browser" syncNativeHeader={false} />));
        await act(async () => vi.advanceTimersByTime(8000));
        expect(home.textContent).toContain("Loading browser controls");
        models.lookup.mockReturnValue({ viewModel: { viewType: "web" } });
        await act(async () => vi.advanceTimersByTime(1000));
        expect(home.textContent).toBe("Ready");
    } finally {
        await act(async () => root.unmount());
        home.remove();
        vi.useRealTimers();
    }
});
