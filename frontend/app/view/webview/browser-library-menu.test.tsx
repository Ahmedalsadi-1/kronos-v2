// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import { Provider } from "jotai";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { BrowserLibraryModel, parseBrowserLibrary } from "./browser-library";
import { BrowserLibraryMenu, BrowserPagePin } from "./browser-library-menu";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("updates pin controls, searches saved titles and preserves a closed tab when reopening fails", async () => {
    localStorage.clear();
    const library = BrowserLibraryModel.getInstance();
    globalStore.set(library.state, parseBrowserLibrary(null));
    const page = { url: "https://example.com/article", title: "Coffee cultivation", partition: "" };
    library.recordVisit(page);
    library.togglePin(page);
    library.rememberClosed(page);
    const open = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
        await act(async () =>
            root.render(
                <Provider store={globalStore}>
                    <BrowserPagePin page={page} />
                    <BrowserLibraryMenu onOpen={open} />
                </Provider>
            )
        );
        await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Unpin page"]').click());
        expect(host.querySelector('[aria-label="Pin page"]')).not.toBeNull();
        const search = host.querySelector("input");
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(search, "coffee");
            search.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(host.querySelector(".browser-library-results").textContent).toContain("Coffee cultivation");
        const closedSection = [...host.querySelectorAll<HTMLButtonElement>("nav button")].find(
            (button) => button.textContent === "Recently closed"
        );
        await act(async () => closedSection.click());
        await act(async () => host.querySelector<HTMLButtonElement>(".browser-library-reopen").click());
        expect(host.querySelector('[role="alert"]').textContent).toBe("Offline");
        expect(globalStore.get(library.state).closed).toHaveLength(1);
        await act(async () => host.querySelector<HTMLButtonElement>(".browser-library-reopen").click());
        expect(globalStore.get(library.state).closed).toHaveLength(0);
        expect(open).toHaveBeenCalledTimes(2);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
