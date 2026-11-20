// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import {
    BrowserLibraryModel,
    BrowserLibraryOpenEvent,
    type OpenSavedBrowserPage,
} from "@/app/view/webview/browser-library";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OSPenChatDock } from "./os-pen-chat-dock";
import { OSPenFiles } from "./os-pen-files";

const listFiles = vi.hoisted(() =>
    vi.fn(async (_client: unknown, _request: { path: string }): Promise<FileInfo[]> => [])
);
const createBlock = vi.hoisted(() => vi.fn(async () => "local-browser"));
const deleteBlock = vi.hoisted(() => vi.fn(async (_id: string) => {}));
vi.mock("@/app/block/block", () => ({ Block: () => null }));
vi.mock("@/app/block/persistent-block", () => ({
    PersistentBlockSlot: ({ blockId }: { blockId: string }) => <div data-canvas-slot={blockId} />,
}));
vi.mock("@/app/workspace/native-island-app", () => ({ makeNativeIslandNodeModel: () => ({}) }));
vi.mock("@/app/store/services", () => ({ ObjectService: { CreateBlock: createBlock, DeleteBlock: deleteBlock } }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/app/store/wshclientapi", () => ({
    RpcApi: {
        FileInfoCommand: async () => ({ isdir: false }),
        FileListCommand: listFiles,
        FetchSuggestionsCommand: async (_client: unknown, request: { widgetid: string }) => ({
            suggestions:
                request.widgetid === "pen-sidebar-bookmarks"
                    ? [{ suggestionid: "docs", display: "KronOS docs", "url:url": "https://example.org/docs" }]
                    : [],
        }),
    },
}));
vi.mock("@hermes/lib/desktop-git", () => ({ desktopGit: () => undefined }));

vi.mock("@hermes/store/session", async () => {
    const { atom } = await import("nanostores");
    return { $currentCwd: atom("/") };
});
vi.mock("./os-web-navbar", () => ({
    OSWebNavBar: ({ downloadsTarget }: { downloadsTarget?: HTMLElement }) =>
        downloadsTarget ? <div aria-label="Sidebar browser navigation" /> : null,
    OSWebDownloads: () => null,
}));

it("opens New Tab while preserving tab order and saved browser profiles", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const library = BrowserLibraryModel.getInstance();
    library.saveSession("restore-test", { active: "two", order: ["two", "one"] });
    const host = document.createElement("div");
    const frame = document.createElement("iframe");
    document.body.append(host, frame);
    const doc = frame.contentDocument;
    doc.body.innerHTML =
        '<div data-titlebar-left><span data-file-title>untitled.pen</span></div><div data-titlebar-right></div><div data-chat-fullscreen><div data-slot="composer-dock"></div></div>';
    const leftTitlebar = doc.querySelector("[data-titlebar-left]");
    vi.spyOn(leftTitlebar, "getBoundingClientRect").mockReturnValue(new DOMRect(72, 0, 160, 48));
    vi.spyOn(doc.querySelector("[data-chat-fullscreen]"), "getClientRects").mockReturnValue({
        length: 1,
    } as DOMRectList);
    const root = createRoot(host);
    const onActive = vi.fn();
    try {
        await act(async () =>
            root.render(
                <OSPenChatDock
                    workspaceId="restore-test"
                    editorDocument={doc}
                    visible
                    onFullChat={vi.fn()}
                    onActiveTab={onActive}
                    tabs={[
                        { id: "one", app: "browser", title: "Page One", url: "https://example.com/one" },
                        {
                            id: "two",
                            app: "browser",
                            title: "Page Two",
                            url: "https://example.com/two",
                            partition: "persist:kronterm-work",
                        },
                    ]}
                />
            )
        );
        expect(onActive).toHaveBeenLastCalledWith(undefined);
        expect(host.querySelector<HTMLElement>(".os-chat-start-page").hidden).toBe(false);
        expect(doc.documentElement.style.getPropertyValue("--kronos-titlebar-start")).toBe("240px");
        const sidebarToggle = doc.querySelector("[data-kronos-sidebar-toggle] button");
        vi.spyOn(sidebarToggle, "getBoundingClientRect").mockReturnValue(new DOMRect(228, 0, 28, 28));
        await act(async () => {
            leftTitlebar.querySelector("[data-file-title]").textContent = "a-longer-workspace-name.pen";
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        });
        expect(doc.documentElement.style.getPropertyValue("--kronos-titlebar-start")).toBe("264px");
        const strip = doc.querySelector("[data-kronos-chat-tabs]");
        expect(strip.textContent.indexOf("Page Two")).toBeLessThan(strip.textContent.indexOf("Page One"));
        await act(async () => doc.querySelector<HTMLButtonElement>('[aria-label="Close Page Two"]').click());
        expect(deleteBlock).toHaveBeenCalledWith("two");
        const closed = globalStore.get(library.state).closed[0];
        expect(closed).toMatchObject({ url: "https://example.com/two", partition: "persist:kronterm-work" });
        createBlock.mockRejectedValueOnce(new Error("Temporary create failure"));
        const failed: OpenSavedBrowserPage = { page: closed, closedId: closed.id };
        await act(async () => {
            window.dispatchEvent(new CustomEvent(BrowserLibraryOpenEvent, { detail: failed }));
            await expect(failed.opened).rejects.toThrow("Could not reopen this page");
        });
        expect(globalStore.get(library.state).closed.some((row) => row.id === closed.id)).toBe(true);
        const detail: OpenSavedBrowserPage = { page: closed, closedId: closed.id };
        await act(async () => {
            window.dispatchEvent(new CustomEvent(BrowserLibraryOpenEvent, { detail }));
            await detail.opened;
        });
        expect(createBlock).toHaveBeenLastCalledWith(
            {
                meta: {
                    view: "web",
                    "os:chatdock": "browser",
                    url: "https://example.com/two",
                    "web:partition": "persist:kronterm-work",
                },
            },
            expect.any(Object)
        );
        expect(globalStore.get(library.state).closed.some((row) => row.id === closed.id)).toBe(false);
    } finally {
        await act(async () => root.unmount());
        host.remove();
        frame.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});

it("shares the titlebar and pane geometry and opens a typed URL using the omnibox", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const frame = document.createElement("iframe");
    const host = document.createElement("div");
    document.body.append(frame, host);
    const editorDocument = frame.contentDocument;
    editorDocument.body.innerHTML =
        '<div data-titlebar-right="true"></div><div data-chat-fullscreen="true"><div data-slot="composer-dock"></div></div>';
    vi.spyOn(editorDocument.querySelector("[data-chat-fullscreen]"), "getClientRects").mockReturnValue({
        length: 1,
    } as DOMRectList);
    const root = createRoot(host);
    try {
        await act(async () => {
            root.render(<OSPenChatDock editorDocument={editorDocument} visible tabs={[]} onFullChat={vi.fn()} />);
        });
        expect(editorDocument.documentElement.hasAttribute("data-kronos-floating-chat")).toBe(true);
        expect(editorDocument.documentElement.hasAttribute("data-kronos-chat-start")).toBe(true);
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
        );
        expect(editorDocument.documentElement.hasAttribute("data-kronos-chat-start")).toBe(false);
        expect(editorDocument.querySelector('[aria-label="Expand tab"]')).toBeNull();
        const onFullChat = vi.fn();
        const onActiveBrowserTab = vi.fn();
        await act(async () => {
            root.render(
                <OSPenChatDock
                    editorDocument={editorDocument}
                    visible
                    tabs={[{ id: "background-browser", app: "browser", title: "Background page" }]}
                    onFullChat={onFullChat}
                    onActiveTab={onActiveBrowserTab}
                />
            );
        });
        const preview = editorDocument.querySelector<HTMLButtonElement>(
            '[data-slot="composer-dock"] [aria-label="Open browser tab: Background page"]'
        );
        expect(preview.getAttribute("aria-pressed")).toBe("false");
        const backgroundPage = host.querySelector('[data-widget-preview-id="background-browser"]');
        expect(backgroundPage).not.toBeNull();
        // The global hidden reset is !important; no guest ancestor may use it.
        expect(backgroundPage.closest("[hidden]")).toBeNull();
        expect(backgroundPage.closest("[inert]")).not.toBeNull();
        expect(host.querySelector(".pen-chat-dock").getAttribute("data-backgrounded")).toBe("true");

        expect(editorDocument.querySelector('[aria-label="Expand tab"]')).toBeNull();
        const previousCreates = createBlock.mock.calls.length;
        await act(async () => preview.click());
        expect(onActiveBrowserTab).toHaveBeenLastCalledWith("background-browser");
        expect(createBlock.mock.calls).toHaveLength(previousCreates);
        const fullChatPanel = editorDocument.querySelector("[data-chat-fullscreen]");
        await act(async () => fullChatPanel.removeAttribute("data-chat-fullscreen"));
        expect(onFullChat).toHaveBeenLastCalledWith(false);
        expect(host.querySelector(".pen-chat-dock").getAttribute("aria-hidden")).toBe("true");
        expect(host.querySelector(".pen-chat-dock").getAttribute("data-background-browser")).toBe("true");
        expect(editorDocument.querySelector('[aria-label="Widget tabs"]')).toBeNull();
        await act(async () => fullChatPanel.setAttribute("data-chat-fullscreen", "true"));
        expect(host.querySelector(".pen-chat-dock").getAttribute("aria-hidden")).toBe("true");
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Open browser tab: Background page"]').click()
        );
        await act(async () => {
            root.render(
                <OSPenChatDock
                    editorDocument={editorDocument}
                    visible
                    tabs={[
                        { id: "new-background", app: "browser", title: "Agent research" },
                        { id: "background-browser", app: "browser", title: "Background page" },
                        { id: "new-file", app: "files", title: "Notes" },
                    ]}
                    focusRequest={{ id: "new-background", background: true }}
                    onFullChat={onFullChat}
                    onActiveTab={onActiveBrowserTab}
                />
            );
        });
        const tabStrip = editorDocument.querySelector("[data-kronos-chat-tabs]");
        const labels = [...tabStrip.children].map((tab) => tab.textContent);
        expect(labels.findIndex((label) => label.includes("Background page"))).toBeLessThan(
            labels.findIndex((label) => label.includes("Agent research"))
        );
        expect(labels.findIndex((label) => label.includes("Agent research"))).toBeLessThan(
            labels.findIndex((label) => label.includes("Notes"))
        );
        expect(tabStrip.querySelector('[data-active="true"]').textContent).toContain("Background page");
        expect(onActiveBrowserTab).toHaveBeenLastCalledWith("background-browser");
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
        );
        await act(async () => {
            root.render(<OSPenChatDock editorDocument={editorDocument} visible tabs={[]} onFullChat={onFullChat} />);
        });
        const chatLink = editorDocument.createElement("a");
        chatLink.href = "https://example.com/article";
        chatLink.textContent = "Read article";
        editorDocument.querySelector("[data-chat-fullscreen]").append(chatLink);
        await act(async () => chatLink.click());
        expect(createBlock).toHaveBeenLastCalledWith(
            { meta: { view: "web", "os:chatdock": "browser", url: "https://example.com/article" } },
            expect.any(Object)
        );
        expect(editorDocument.querySelector('[aria-label="Expand tab"]')).not.toBeNull();
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
        );
        expect(editorDocument.querySelector('[aria-label="Expand tab"]')).toBeNull();
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
        );
        expect(editorDocument.querySelector('[data-titlebar-right] [aria-label="Widget tabs"]').textContent).toContain(
            "New tab"
        );

        const panel = editorDocument.querySelector("[data-chat-fullscreen]");
        const composer = panel.querySelector('[data-slot="composer-dock"]');
        const spotlight = editorDocument.createElement("div");
        spotlight.setAttribute("data-agent-spotlight", "");
        spotlight.innerHTML =
            '<section data-kronos-mini-chat></section><div data-kronos-pen-island-bar><div contenteditable="true">Draft</div><div data-kronos-pen-composer-controls><button aria-label="Choose sandbox computer"></button></div></div><button aria-label="Open chat tab"></button>';
        vi.spyOn(spotlight, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 600, 480, 80));
        Object.defineProperties(editorDocument.documentElement, {
            clientWidth: { value: 1000, configurable: true },
            clientHeight: { value: 800, configurable: true },
        });
        await act(async () => editorDocument.body.append(spotlight));
        await act(async () => editorDocument.querySelector<HTMLButtonElement>('[aria-label="Expand tab"]').click());
        expect(editorDocument.documentElement.hasAttribute("data-kronos-floating-chat")).toBe(true);
        expect(host.querySelector(".pen-chat-dock").hasAttribute("aria-hidden")).toBe(false);
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Hide message thread"]').click()
        );
        expect(editorDocument.documentElement.hasAttribute("data-kronos-thread-hidden")).toBe(true);
        expect(spotlight.querySelector("[contenteditable]").textContent).toBe("Draft");
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Show message thread"]').click()
        );
        expect(editorDocument.documentElement.hasAttribute("data-kronos-thread-hidden")).toBe(false);
        await act(async () =>
            editorDocument
                .querySelector('[aria-label="Move chat island"]')
                .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
        );
        expect(editorDocument.documentElement.style.getPropertyValue("--kronos-island-left")).toBe("188px");
        await act(async () =>
            editorDocument
                .querySelector('[aria-label="Resize floating chat"]')
                .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
        );
        expect(editorDocument.documentElement.style.getPropertyValue("--kronos-island-width")).toBe("784px");
        await act(async () => spotlight.querySelector<HTMLButtonElement>('[aria-label="Open chat tab"]').click());
        expect(editorDocument.documentElement.hasAttribute("data-kronos-floating-chat")).toBe(false);
        expect(host.querySelector(".pen-chat-dock").getAttribute("aria-hidden")).toBe("true");
        expect(panel.querySelector('[data-slot="composer-dock"]')).toBe(composer);
        expect(spotlight.querySelector("[contenteditable]").textContent).toBe("Draft");
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
        );
        expect(host.querySelector(".pen-chat-dock").hasAttribute("aria-hidden")).toBe(false);
        expect(editorDocument.documentElement.hasAttribute("data-kronos-chat-split")).toBe(true);

        const titlebar = editorDocument.querySelector("[data-titlebar-right]");
        const originalParent = titlebar.parentElement;
        const rail = editorDocument.createElement("div");
        rail.setAttribute("data-kronos-history-docked", "");
        rail.innerHTML = "<div data-kronos-sidebar-footer></div>";
        await act(async () => editorDocument.body.append(rail));
        expect(titlebar.parentElement).toBe(rail.querySelector("[data-kronos-sidebar-footer]"));
        expect(host.querySelector<HTMLElement>(".pen-chat-dock").style.top).toBe("0px");
        expect(editorDocument.querySelector('[aria-label="Widget side panel"]')).not.toBeNull();
        await act(async () => rail.remove());
        expect(titlebar.parentElement).toBe(originalParent);
        expect(host.querySelector<HTMLElement>(".pen-chat-dock").style.top).toBe("48px");

        const divider = host.querySelector('[role="separator"]');
        await act(async () =>
            divider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        );
        expect(divider.getAttribute("aria-valuenow")).toBe("30");
        expect(editorDocument.documentElement.style.getPropertyValue("--kronos-chat-dock-width")).toContain("70%");
        expect(
            host.querySelector<HTMLElement>(".pen-chat-dock").style.getPropertyValue("--kronos-chat-dock-width")
        ).toContain("70%");

        vi.spyOn(host, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
        Object.assign(divider, {
            setPointerCapture: vi.fn(),
            hasPointerCapture: () => true,
        });
        await act(async () => {
            divider.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
            divider.dispatchEvent(new MouseEvent("pointermove", { clientX: 420, bubbles: true }));
        });
        expect(divider.getAttribute("aria-valuenow")).toBe("42");

        const launcher = host.querySelector(".os-chat-start-launchers");
        for (const [label, meta] of [
            ["Android Emulator", { view: "web", "os:chatdock": "android", url: "http://127.0.0.1:3201/" }],
            ["iPhone Simulator", { view: "web", "os:chatdock": "iphone", url: "http://localhost:3200/" }],
        ] as const) {
            const button = Array.from(launcher.querySelectorAll<HTMLButtonElement>(":scope > button")).find(
                (item) => item.textContent.trim() === label
            );
            expect(button).toBeDefined();
            await act(async () => button.click());
            expect(createBlock).toHaveBeenLastCalledWith({ meta }, expect.any(Object));
        }

        const input = host.querySelector<HTMLTextAreaElement>('[aria-label="Chat and search"]');
        await act(async () => {
            input.focus();
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
                input,
                "http://localhost:9124"
            );
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(host.querySelector(".os-chat-start-actions").textContent).toContain("Open website");
        expect(host.querySelector('button[aria-label="Send message"]')).not.toBeNull();
        await act(async () => input.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
        expect(createBlock).toHaveBeenCalledWith(
            { meta: { view: "web", "os:chatdock": "browser", url: "http://localhost:9124" } },
            expect.any(Object)
        );
        const onActiveTab = vi.fn();
        const onFullChatForPreview = vi.fn();
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
        );
        await act(async () => {
            root.render(
                <OSPenChatDock
                    editorDocument={editorDocument}
                    visible
                    tabs={[
                        { id: "preview", app: "files", title: "index.ts" },
                        { id: "terminal", app: "terminal" },
                    ]}
                    focusRequest={{ id: "preview", background: true }}
                    onFullChat={onFullChatForPreview}
                    onActiveTab={onActiveTab}
                />
            );
        });
        expect(editorDocument.querySelector('[aria-label="Expand tab"]')).toBeNull();
        const filePreview = editorDocument.querySelector<HTMLButtonElement>(
            '[aria-label="Open file preview: index.ts"]'
        );
        expect(filePreview).not.toBeNull();
        await act(async () => filePreview.click());
        expect(onActiveTab).toHaveBeenLastCalledWith("preview");
        expect(editorDocument.querySelector('[data-kronos-chat-tabs] [data-active="true"]').textContent).toContain(
            "index.ts"
        );
        const strip = editorDocument.querySelector("[data-kronos-chat-tabs]");
        const terminal = [...strip.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Terminal"
        );
        const dragEvent = (type: string) =>
            Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
                dataTransfer: { setData: vi.fn() },
            });
        await act(async () => terminal.dispatchEvent(dragEvent("dragstart")));
        await act(async () => host.querySelector('[data-side="top"]').dispatchEvent(dragEvent("drop")));
        expect(host.querySelector(".pen-chat-widget-panes").getAttribute("data-split-axis")).toBe("vertical");
        expect(strip.querySelector('[data-split-side="start"]').textContent).toContain("Terminal");
        expect(strip.querySelector('[data-split-side="end"]').textContent).toContain("index.ts");
    } finally {
        await act(async () => root.unmount());
        frame.remove();
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});

it("browses above the project through the parent button and breadcrumb menu", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const click = async (label: string) => {
        const button = [...host.querySelectorAll("button")].find((item) => item.textContent.trim() === label);
        expect(button).toBeDefined();
        await act(async () => button.click());
    };
    try {
        await act(async () =>
            root.render(
                <OSPenFiles id="files" root="/Users/test/project" path="/Users/test/project">
                    {null}
                </OSPenFiles>
            )
        );
        expect(listFiles).toHaveBeenLastCalledWith(expect.anything(), {
            path: "wsh://local//Users/test/project",
            opts: { all: false },
        });
        await click("↑ Parent folder");
        expect(listFiles).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ path: "wsh://local//Users/test" })
        );
        listFiles.mockResolvedValueOnce([
            { path: "/Users", name: "Users", isdir: true },
            { path: "/tmp", name: "tmp", isdir: true },
        ]);
        await click("/");
        const search = host.querySelector<HTMLInputElement>('[aria-label="Search this folder"]');
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(search, "Users");
            search.dispatchEvent(new Event("input", { bubbles: true }));
        });
        expect(host.querySelector(".pen-files-menu").textContent).not.toContain("tmp");
        await act(async () =>
            host.querySelector<HTMLButtonElement>('.pen-files-menu button[aria-expanded="false"]').click()
        );
        expect(host.querySelector('[aria-label="Browse Users"]')).not.toBeNull();
        expect(listFiles).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ path: "wsh://local//Users" })
        );
        await click("Browse this folder");
        expect(listFiles).toHaveBeenLastCalledWith(
            expect.anything(),
            expect.objectContaining({ path: "wsh://local//" })
        );
        expect(host.textContent).not.toContain("Parent folder");
    } finally {
        await act(async () => root.unmount());
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});

it("opens canvas widgets as tabs and releases their slots when full chat closes", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const frame = document.createElement("iframe");
    const host = document.createElement("div");
    document.body.append(frame, host);
    const editorDocument = frame.contentDocument;
    editorDocument.body.innerHTML = "<div data-titlebar-right></div><div data-chat-fullscreen></div>";
    const panel = editorDocument.querySelector("[data-chat-fullscreen]");
    vi.spyOn(panel, "getClientRects").mockReturnValue({ length: 1 } as DOMRectList);
    const root = createRoot(host);
    const onFullChat = vi.fn();
    const onActiveTab = vi.fn();
    try {
        await act(async () =>
            root.render(
                <OSPenChatDock
                    editorDocument={editorDocument}
                    visible
                    tabs={[
                        { id: "canvas-terminal", app: "terminal", title: "Shell", canvas: true },
                        { id: "canvas-editor", app: "files", title: "Editor", path: "/test.ts", canvas: true },
                    ]}
                    onFullChat={onFullChat}
                    onActiveTab={onActiveTab}
                />
            )
        );
        expect(onActiveTab).toHaveBeenLastCalledWith(undefined);
        expect(host.querySelector<HTMLElement>(".os-chat-start-page").hidden).toBe(false);
        const editorTab = [
            ...editorDocument.querySelectorAll<HTMLButtonElement>("[data-kronos-chat-tabs] button"),
        ].find((button) => button.textContent.trim() === "Editor");
        await act(async () => editorTab.click());
        expect(onActiveTab).toHaveBeenLastCalledWith("canvas-editor");
        expect(host.querySelector('.pen-files [data-canvas-slot="canvas-editor"]')).not.toBeNull();
        expect(host.querySelector('[aria-label="Workspace files"]')).not.toBeNull();
        await act(async () => panel.removeAttribute("data-chat-fullscreen"));
        expect(onFullChat).toHaveBeenLastCalledWith(false);
        expect(host.querySelector("[data-canvas-slot]")).toBeNull();
        await act(async () => panel.setAttribute("data-chat-fullscreen", ""));
        expect(onFullChat).toHaveBeenLastCalledWith(true);
        expect(onActiveTab).toHaveBeenLastCalledWith(undefined);
        await act(async () =>
            editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
        );
        expect(onActiveTab).toHaveBeenLastCalledWith("canvas-editor");
    } finally {
        await act(async () => root.unmount());
        frame.remove();
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});

it("routes Files to the new explorer from either document with the panel closed", async () => {
    const env = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = true;
    const frame = document.createElement("iframe");
    const host = document.createElement("div");
    document.body.append(frame, host);
    const editorDocument = frame.contentDocument;
    editorDocument.body.innerHTML = "<div data-titlebar-right></div><div data-chat-fullscreen></div>";
    vi.spyOn(editorDocument.querySelector("[data-chat-fullscreen]"), "getClientRects").mockReturnValue({
        length: 1,
    } as DOMRectList);
    const root = createRoot(host);
    try {
        await act(async () =>
            root.render(<OSPenChatDock editorDocument={editorDocument} visible tabs={[]} onFullChat={vi.fn()} />)
        );
        for (const target of [document, editorDocument]) {
            const event = new Event("kronos:open-chat-files", { cancelable: true });
            await act(async () => {
                target.dispatchEvent(event);
            });
            expect(event.defaultPrevented).toBe(true);
            expect(createBlock).toHaveBeenLastCalledWith(
                { meta: { view: "preview", "os:chatdock": "files", file: "/" } },
                expect.any(Object)
            );
            await act(async () =>
                editorDocument.querySelector<HTMLButtonElement>('[aria-label="Widget side panel"]').click()
            );
        }
    } finally {
        await act(async () => root.unmount());
        frame.remove();
        host.remove();
        env.IS_REACT_ACT_ENVIRONMENT = previous;
    }
});
