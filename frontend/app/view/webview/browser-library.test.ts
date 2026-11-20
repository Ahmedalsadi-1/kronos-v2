// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import { beforeEach, expect, it, vi } from "vitest";
import {
    BrowserLibraryModel,
    BrowserLibraryStorageKey,
    parseBrowserLibrary,
    savedBrowserPage,
    searchBrowserHistory,
} from "./browser-library";

const page = { url: "https://example.com/article", title: "Example article", partition: "persist:kronterm-work" };
const library = BrowserLibraryModel.getInstance();
beforeEach(() => {
    localStorage.clear();
    globalStore.set(library.state, parseBrowserLibrary(null));
});

it("records visits and final titles once and searches both title and address", () => {
    library.recordVisit(page, 1000);
    library.recordVisit(page, 1100);
    library.updateTitle({ ...page, title: "Coffee cultivation" });
    const history = globalStore.get(library.state).history;
    expect(history).toHaveLength(1);
    expect(history[0].visits).toBe(1);
    expect(searchBrowserHistory(history, "coffee example.com")).toHaveLength(1);
    expect(searchBrowserHistory(history, "unknown")).toHaveLength(0);
});

it("does not save private pages, credential-bearing URLs or executable URLs", () => {
    for (const value of [
        { ...page, partition: "kronterm-private-123" },
        { ...page, url: "https://user:secret@example.com" },
        { ...page, url: "javascript:alert(1)" },
    ]) {
        expect(savedBrowserPage(value)).toBeUndefined();
        library.recordVisit(value);
        library.togglePin(value);
        library.rememberClosed(value);
    }
    expect(globalStore.get(library.state)).toMatchObject({ pins: [], history: [], closed: [] });
});

it("preserves profile ownership, pin removal and a bounded stack of recently closed pages", () => {
    library.togglePin(page);
    library.togglePin({ ...page, partition: "persist:kronterm-personal" });
    expect(globalStore.get(library.state).pins).toHaveLength(2);
    library.togglePin(page);
    expect(globalStore.get(library.state).pins[0].partition).toBe("persist:kronterm-personal");
    for (let index = 0; index < 35; index++) library.rememberClosed({ ...page, url: `https://example.com/${index}` });
    const closed = globalStore.get(library.state).closed;
    expect(closed).toHaveLength(30);
    expect(closed[0].url).toBe("https://example.com/34");
    library.forgetClosed(closed[0].id);
    expect(globalStore.get(library.state).closed[0].url).toBe("https://example.com/33");
});

it("recovers from malformed or unsupported saved data", () => {
    expect(parseBrowserLibrary("bad json").history).toEqual([]);
    expect(parseBrowserLibrary('{"version":99,"pins":[{}]}').pins).toEqual([]);
});

it("restores pins, history, closed tabs and workspace selection from storage in a fresh module", async () => {
    library.recordVisit(page);
    library.togglePin(page);
    library.rememberClosed(page);
    library.saveSession("workspace-one", { active: "browser-two", order: ["browser-two", "browser-one"] });
    expect(localStorage.getItem(BrowserLibraryStorageKey)).toContain("browser-two");
    vi.resetModules();
    const fresh = await import("./browser-library");
    const { globalStore: freshStore } = await import("@/app/store/jotaiStore");
    const restored = freshStore.get(fresh.BrowserLibraryModel.getInstance().state);
    expect(restored.pins).toEqual([page]);
    expect(restored.history[0]).toMatchObject(page);
    expect(restored.closed[0]).toMatchObject(page);
    expect(restored.sessions["workspace-one"]).toEqual({
        active: "browser-two",
        order: ["browser-two", "browser-one"],
    });
});
