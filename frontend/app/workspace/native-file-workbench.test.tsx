// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import { attachOSResourceToKronos } from "@/app/store/os-resource-service";
import { RpcApi } from "@/app/store/wshclientapi";
import { createBlockSplitHorizontally } from "@/store/global";
import { Provider, atom } from "jotai";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeFileWorkbench } from "./native-file-workbench";

const mocks = vi.hoisted(() => ({ model: null as any, explorer: null as (path: string) => void, sync: vi.fn() }));
vi.mock("@/store/global", () => ({
    createBlockSplitHorizontally: vi.fn(async () => "split-file"),
    getBlockComponentModel: () => ({ viewModel: mocks.model }),
    getApi: () => ({
        syncNativeNotch: mocks.sync,
        onNativeNotchExplorer: (callback: (path: string) => void) => {
            mocks.explorer = callback;
            return () => {};
        },
    }),
}));
vi.mock("@/app/store/os-resource-service", () => ({ attachOSResourceToKronos: vi.fn() }));
vi.mock("./ade-diagnostics", () => ({ AdeDiagnostics: () => <div>Current file problems</div> }));
vi.mock("@/app/store/wshclientapi", () => ({
    RpcApi: { OSWorktreeChangesCommand: vi.fn(async () => []), OSWorktreeFileDiffCommand: vi.fn(async () => "") },
}));

let root: Root;
let container: HTMLDivElement;
afterEach(async () => {
    if (root) await act(async () => root.unmount());
    container?.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
});

async function mount() {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const metaFilePath = atom("/project");
    const newFileContent = atom(null as string);
    const drafts = new Map<string, string>();
    const files = [
        { path: "/project/a.ts", name: "a.ts", isdir: false },
        { path: "/project/b.ts", name: "b.ts", isdir: false },
    ];
    mocks.model = {
        blockId: "files",
        viewType: "preview",
        metaFilePath,
        newFileContent,
        editMode: atom(false),
        setEditMode: vi.fn(async (edit: boolean) => globalStore.set(mocks.model.editMode, edit)),
        connectionImmediate: atom(""),
        errorMsgAtom: atom(null),
        statFile: atom((get) =>
            Promise.resolve({ path: get(metaFilePath), dir: "/project", isdir: get(metaFilePath) === "/project" })
        ),
        formatRemoteUri: async (path: string) => path,
        env: {
            rpc: {
                FileReadCommand: vi.fn(async () => ({ entries: files })),
                FileInfoCommand: vi.fn(async (_client, { info }: any) => ({
                    path: info.path,
                    notfound: !files.some((file) => file.path === info.path),
                })),
                FileAppendCommand: vi.fn(async () => {}),
            },
        },
        goHistory: vi.fn(async (path: string) => {
            const previous = globalStore.get(metaFilePath);
            const draft = globalStore.get(newFileContent);
            if (draft != null) drafts.set(previous, draft);
            else drafts.delete(previous);
            globalStore.set(metaFilePath, path);
            globalStore.set(newFileContent, drafts.get(path) ?? null);
        }),
        hasFileDraft: (path: string) => drafts.has(path),
        discardFileDraft: (path: string) => drafts.delete(path),
        handleFileSave: vi.fn(async () => globalStore.set(newFileContent, null)),
        updateOpenFileModalAndError: vi.fn(),
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () =>
        root.render(
            <Provider store={globalStore}>
                <NativeFileWorkbench blockId="files">
                    <div>Editor</div>
                </NativeFileWorkbench>
            </Provider>
        )
    );
    return { metaFilePath, newFileContent };
}

describe("native mini IDE", () => {
    it("does not republish an unchanged tree while idle", async () => {
        vi.useFakeTimers();
        await mount();
        mocks.sync.mockClear();
        await act(async () => vi.advanceTimersByTime(5000));
        expect(mocks.sync).not.toHaveBeenCalled();
    });
    it("publishes the tree, opens tabs from native selections, and restores unsaved drafts", async () => {
        const { metaFilePath, newFileContent } = await mount();
        expect(mocks.sync).toHaveBeenCalledWith(
            expect.objectContaining({
                explorer: expect.objectContaining({
                    entries: expect.arrayContaining([expect.objectContaining({ path: "/project/a.ts" })]),
                }),
            })
        );
        await act(async () => mocks.explorer("/project/a.ts"));
        expect(globalStore.get(metaFilePath)).toBe("/project/a.ts");
        await act(async () => globalStore.set(newFileContent, "unsaved A"));
        await act(async () => mocks.explorer("/project/b.ts"));
        expect(globalStore.get(newFileContent)).toBeNull();
        await act(async () => mocks.explorer("/project/a.ts"));
        expect(globalStore.get(newFileContent)).toBe("unsaved A");
        expect(container.querySelectorAll('[role="tab"]')).toHaveLength(5);
        expect(container.textContent).not.toContain("Terminal");
        expect(container.textContent).toContain("Output");
        expect(container.textContent).toContain("Logs");
    });
    it("keeps failed saves visible and never logs them as completed output", async () => {
        const { newFileContent } = await mount();
        await act(async () => mocks.explorer("/project/a.ts"));
        await act(async () => globalStore.set(newFileContent, "unsaved A"));
        mocks.model.handleFileSave.mockImplementation(async () => {
            globalStore.set(mocks.model.errorMsgAtom, { status: "Save Failed", text: "Permission denied" });
        });
        await act(async () => (container.querySelector('[aria-label="Save file"]') as HTMLButtonElement).click());
        expect(container.textContent).toContain("Permission denied");
        expect(container.textContent).not.toContain("Saved /project/a.ts");
        expect(globalStore.get(newFileContent)).toBe("unsaved A");
    });

    it("ignores paths absent from its directory inventory", async () => {
        const { metaFilePath } = await mount();
        await act(async () => mocks.explorer("/elsewhere/private"));
        expect(globalStore.get(metaFilePath)).toBe("/project");
        expect(mocks.model.goHistory).not.toHaveBeenCalled();
    });
});

it("opens files from the ADE explorer and filters without adding a chat or terminal", async () => {
    const { metaFilePath } = await mount();
    const explorer = container.querySelector('[aria-label="Project explorer"]');
    await act(async () => (explorer.querySelector('[title="/project/a.ts"]') as HTMLButtonElement).click());
    expect(globalStore.get(metaFilePath)).toBe("/project/a.ts");
    expect(container.querySelector('[aria-label="KronTerm development environment"]')).not.toBeNull();
    const activity = [...container.querySelectorAll("button")].find((button) => button.textContent === "Activity");
    expect(activity.getAttribute("aria-expanded")).toBe("false");
    await act(async () => activity.click());
    expect(activity.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".native-file-output").hasAttribute("hidden")).toBe(false);
});

it("opens the existing project file search", async () => {
    await mount();
    await act(async () =>
        [...container.querySelectorAll("button")].find((button) => button.textContent === "Open file").click()
    );
    expect(mocks.model.updateOpenFileModalAndError).toHaveBeenCalledWith(true);
});

it("ignores notch commands for an unfocused ADE widget", async () => {
    await mount();
    mocks.model.nodeModel = { isFocused: atom(false) };
    await act(async () => mocks.explorer(":new-file"));
    expect(mocks.model.env.rpc.FileInfoCommand).not.toHaveBeenCalled();
    expect(mocks.model.goHistory).not.toHaveBeenCalled();
});

it("moves between open file tabs with the keyboard", async () => {
    const { metaFilePath } = await mount();
    await act(async () => mocks.explorer("/project/a.ts"));
    await act(async () => mocks.explorer("/project/b.ts"));
    const tabs = container.querySelectorAll<HTMLButtonElement>('[aria-label="Open files"] [role="tab"]');
    expect(tabs[0].tabIndex).toBe(-1);
    expect(tabs[1].tabIndex).toBe(0);
    await act(async () => {
        tabs[1].focus();
        tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(globalStore.get(metaFilePath)).toBe("/project/a.ts");
    expect(document.activeElement).toBe(tabs[0]);
});

it("attaches to existing chat and refuses to split an unsaved file", async () => {
    const { newFileContent } = await mount();
    await act(async () => mocks.explorer("/project/a.ts"));
    await act(async () =>
        [...container.querySelectorAll("button")].find((button) => button.textContent === "Ask agent").click()
    );
    expect(attachOSResourceToKronos).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "file", resource: "/project/a.ts" })
    );
    await act(async () => globalStore.set(newFileContent, "dirty"));
    await act(async () =>
        [...container.querySelectorAll("button")].find((button) => button.textContent === "Split editor").click()
    );
    expect(createBlockSplitHorizontally).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Save this file before opening a second editor");
});

it("shows real Git loading and ignores a late diff for another selected file", async () => {
    await mount();
    let resolveChanges: (rows: any[]) => void;
    vi.mocked(RpcApi.OSWorktreeChangesCommand).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                resolveChanges = resolve;
            })
    );
    await act(async () =>
        [...container.querySelectorAll("button")].find((button) => button.textContent === "Changes").click()
    );
    expect(container.textContent).toContain("Loading Git changes");
    expect(container.textContent).not.toContain("No uncommitted changes");
    await act(async () =>
        resolveChanges([
            { path: "a.ts", status: "M" },
            { path: "b.ts", status: "M" },
        ])
    );
    let resolveA: (text: string) => void;
    vi.mocked(RpcApi.OSWorktreeFileDiffCommand)
        .mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveA = resolve;
                })
        )
        .mockResolvedValueOnce("diff B");
    await act(async () => (container.querySelector('[title="Review a.ts"]') as HTMLButtonElement).click());
    await act(async () => (container.querySelector('[title="Review b.ts"]') as HTMLButtonElement).click());
    await act(async () => resolveA("stale diff A"));
    expect(container.querySelector('[aria-label="Git diff"]').textContent).toContain("diff B");
    expect(container.textContent).not.toContain("stale diff A");
});

it("exposes Edit and Preview on the integrated file toolbar", async () => {
    await mount();
    await act(async () => mocks.explorer("/project/a.ts"));
    await act(async () => (container.querySelector('[aria-label="Edit file"]') as HTMLButtonElement).click());
    expect(globalStore.get(mocks.model.editMode)).toBe(true);
    expect(container.querySelector('[aria-label="Preview file"]')).not.toBeNull();
});

it("refuses to replace an existing file from the native new-file action", async () => {
    await mount();
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("a.ts");
    try {
        await act(async () => {
            mocks.explorer(":new-file");
        });
        expect(mocks.model.env.rpc.FileAppendCommand).not.toHaveBeenCalled();
        expect(container.textContent).toContain("already exists");
    } finally {
        prompt.mockRestore();
    }
});
