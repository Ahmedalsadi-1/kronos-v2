// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSPenBrowserToolbar } from "./os-pen-browser-toolbar";

const mounts = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }));
vi.mock("./os-web-navbar", () => ({
    OSWebNavBar: () => {
        useEffect(() => {
            mounts.mount();
            return () => {
                mounts.unmount();
            };
        }, []);
        return (
            <div role="toolbar" aria-label="Browser navigation">
                <input defaultValue="https://example.com" />
            </div>
        );
    },
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("moves the same toolbar and edited address into the sidebar and back without remounting", async () => {
    const home = document.createElement("div");
    const frame = document.createElement("iframe");
    document.body.append(home, frame);
    const sidebar = frame.contentDocument.createElement("div");
    frame.contentDocument.body.append(sidebar);
    const root = createRoot(home);
    try {
        await act(async () => root.render(<OSPenBrowserToolbar blockId="browser" />));
        const input = home.querySelector("input");
        input.value = "unfinished query";
        await act(async () => root.render(<OSPenBrowserToolbar blockId="browser" target={sidebar} />));
        expect(home.querySelector('[role="toolbar"]')).toBeNull();
        expect(sidebar.querySelector("input")).toBe(input);
        expect(input.value).toBe("unfinished query");
        await act(async () => root.render(<OSPenBrowserToolbar blockId="browser" />));
        expect(home.querySelector("input")).toBe(input);
        expect(sidebar.childElementCount).toBe(0);
        expect(mounts.mount).toHaveBeenCalledTimes(1);
        expect(mounts.unmount).not.toHaveBeenCalled();
    } finally {
        await act(async () => root.unmount());
        home.remove();
        frame.remove();
    }
});
