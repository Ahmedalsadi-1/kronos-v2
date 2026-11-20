// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserWorkspaceSearch } from "./browser-workspace-search";

const api = vi.hoisted(() => ({ browserSearchSuggestions: vi.fn() }));
vi.mock("@/store/global", () => ({ getApi: () => api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

it("shows live search recommendations and opens the keyboard-selected phrase", async () => {
    vi.useFakeTimers();
    api.browserSearchSuggestions.mockResolvedValue(["coffee beans", "coffee nearby"]);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onOpen = vi.fn();
    try {
        await act(async () => root.render(<BrowserWorkspaceSearch onOpen={onOpen} />));
        const input = host.querySelector("input");
        await act(async () => {
            input.focus();
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "coffee");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(api.browserSearchSuggestions).not.toHaveBeenCalled();
        await act(async () => vi.advanceTimersByTime(250));
        expect(api.browserSearchSuggestions).toHaveBeenCalledExactlyOnceWith("coffee");
        expect(host.querySelector('[role="listbox"]').textContent).toContain("coffee nearby");
        for (const key of ["ArrowDown", "ArrowDown"]) {
            await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
        }
        await act(async () =>
            host.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        );
        expect(onOpen).toHaveBeenCalledExactlyOnceWith("coffee beans");
        expect(host.querySelector('[role="listbox"]')).toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
