// @vitest-environment jsdom
import { globalStore } from "@/app/store/jotaiStore";
import { attachOSResourceToKronos } from "@/app/store/os-resource-service";
import { RpcApi } from "@/app/store/wshclientapi";
import { createBlockSplitHorizontally } from "@/store/global";
import { agentActivityTimeline, publishAgentActivity } from "@/types/agent-activity";
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
    agentActivityTimeline.clear();
    if (root) await act(async () => root.unmount());
    container?.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

async function mount() {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 250,
        bottom: 400,
        width: 250,
        height: 400,
        toJSON: () => ({}),
    });
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
        refreshVersion: atom(0),
        fileContentSaved: atom("initial disk contents"),
        goHistoryBack: vi.fn(async () => {}),
        goHistoryForward: vi.fn(async () => {}),
        goParentDirectory: vi.fn(async () => {}),
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
                FileMkdirCommand: vi.fn(async () => {}),
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

it("edits the explorer folder path inline and cancels without navigating", async () => {
    await mount();
    const editPath = async () => {
        await act(async () =>
            (container.querySelector('[aria-label="Open folder path"]') as HTMLButtonElement).click()
        );
        const input = container.querySelector('[aria-label="Folder path"]') as HTMLInputElement;
        expect(input.value).toBe("/project");
        expect(document.activeElement).toBe(input);
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "  /other/project  ");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        return input;
    };
    const cancelled = await editPath();
    await act(async () => cancelled.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(mocks.model.goHistory).not.toHaveBeenCalled();
    const submitted = await editPath();
    await act(async () => submitted.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.model.goHistory).toHaveBeenCalledWith("/other/project");
    expect(mocks.model.updateOpenFileModalAndError).not.toHaveBeenCalled();
});

it("searches unopened folders and opens a result", async () => {
    await mount();
    mocks.model.env.rpc.FileReadCommand.mockImplementation(async (_client, { info }) => ({
        entries:
            info.path === "/project"
                ? [{ path: "/project/src", name: "src", isdir: true }]
                : [{ path: "/project/src/needle.ts", name: "needle.ts", isdir: false }],
    }));
    const input = container.querySelector('[aria-label="Search project files"]') as HTMLInputElement;
    expect(input.closest("label").hidden).toBe(false);
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "needle");
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 180));
    });
    const result = container.querySelector('[aria-label="File search results"] button') as HTMLButtonElement;
    expect(result.textContent).toContain("src/needle.ts");
    await act(async () => result.click());
    expect(mocks.model.goHistory).toHaveBeenCalledWith("/project/src/needle.ts");
});

it("copies the current unsaved file content and exposes workspace controls on demand", async () => {
    const writeText = vi.fn(async () => {});
    const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
        const { metaFilePath, newFileContent } = await mount();
        await act(async () => {
            globalStore.set(metaFilePath, "/project/a.ts");
            globalStore.set(newFileContent, "const localDraft = true;");
        });
        const heading = container.querySelector(".ade-heading") as HTMLElement;
        expect(heading.hidden).toBe(true);
        await act(async () =>
            (container.querySelector('[aria-label="Toggle workspace controls"]') as HTMLButtonElement).click()
        );
        expect(heading.hidden).toBe(false);
        await act(async () =>
            (container.querySelector('[aria-label="Copy file contents"]') as HTMLButtonElement).click()
        );
        expect(writeText).toHaveBeenCalledWith("const localDraft = true;");
        expect(container.querySelector('[aria-label="Code copied"]')).not.toBeNull();
        expect(mocks.model.handleFileSave).not.toHaveBeenCalled();
    } finally {
        if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
        else Reflect.deleteProperty(navigator, "clipboard");
    }
});

describe("native mini IDE", () => {
    it("picks up file activity that arrived while the editor was opening", async () => {
        publishAgentActivity({
            source: "hermes",
            surface: "file",
            action: "type",
            phase: "running",
            filepath: "/project/b.ts",
        });
        const { metaFilePath } = await mount();
        expect(globalStore.get(metaFilePath)).toBe("/project/b.ts");
        expect(globalStore.get(mocks.model.refreshVersion)).toBeGreaterThan(0);
    });
    it("follows agent files, reloads disk updates, and preserves unsaved local edits", async () => {
        const { metaFilePath, newFileContent } = await mount();
        vi.useFakeTimers();
        const activity = {
            source: "hermes" as const,
            surface: "file" as const,
            action: "type" as const,
            phase: "running" as const,
            filepath: "/project/a.ts",
            blockid: "agent-chat",
        };
        await act(async () => publishAgentActivity(activity));
        expect(globalStore.get(metaFilePath)).toBe("/project/a.ts");
        expect(mocks.model.setEditMode).toHaveBeenCalledWith(true);
        const version = Number(globalStore.get(mocks.model.refreshVersion));
        await act(async () => vi.advanceTimersByTime(500));
        expect(globalStore.get(mocks.model.refreshVersion)).toBeGreaterThan(version);
        await act(async () => globalStore.set(newFileContent, "my unsaved edits"));
        const protectedVersion = globalStore.get(mocks.model.refreshVersion);
        await act(async () => vi.advanceTimersByTime(1000));
        expect(globalStore.get(mocks.model.refreshVersion)).toBe(protectedVersion);
        expect(globalStore.get(newFileContent)).toBe("my unsaved edits");
        await act(async () => publishAgentActivity({ ...activity, phase: "failed" }));
        await act(async () => globalStore.set(newFileContent, null));
        await act(async () => vi.advanceTimersByTime(1000));
        expect(globalStore.get(mocks.model.refreshVersion)).toBe(protectedVersion);
    });

    it("exposes navigation and supports resizing, folding, and opting out of agent follow", async () => {
        const { metaFilePath } = await mount();
        const button = (label: string) => container.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
        await act(async () => {
            button("Back").click();
            button("Forward").click();
            button("Parent folder").click();
        });
        expect(mocks.model.goHistoryBack).toHaveBeenCalled();
        expect(mocks.model.goHistoryForward).toHaveBeenCalled();
        expect(mocks.model.goParentDirectory).toHaveBeenCalled();
        const separator = container.querySelector('[role="separator"]');
        await act(async () =>
            separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
        );
        expect(separator.getAttribute("aria-valuenow")).toBe("270");
        await act(async () => button("Fold file explorer").click());
        expect((container.querySelector('[aria-label="Project explorer"]') as HTMLElement).hidden).toBe(true);
        await act(async () => button("Expand file explorer").click());
        expect((container.querySelector('[aria-label="Project explorer"]') as HTMLElement).hidden).toBe(false);
        await act(async () => button("Follow agent files").click());
        await act(async () =>
            publishAgentActivity({
                source: "hermes",
                surface: "file",
                action: "type",
                phase: "running",
                filepath: "/project/b.ts",
            })
        );
        expect(globalStore.get(metaFilePath)).toBe("/project");
    });
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
    await act(async () => mocks.explorer(":new-file"));
    const input = container.querySelector('[aria-label="New file name"]') as HTMLInputElement;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "a.ts");
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
        container
            .querySelector('[aria-label="Create new file"]')
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(mocks.model.env.rpc.FileAppendCommand).not.toHaveBeenCalled();
    expect(container.textContent).toContain("already exists");
});

it.each(["file", "folder"])("creates a new %s from the sidebar without a browser prompt", async (kind) => {
    await mount();
    await act(async () => (container.querySelector(`[aria-label="New ${kind}"]`) as HTMLButtonElement).click());
    const input = container.querySelector(`[aria-label="New ${kind} name"]`) as HTMLInputElement;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
            input,
            kind === "file" ? "notes.ts" : "notes"
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
        container
            .querySelector(`[aria-label="Create new ${kind}"]`)
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    if (kind === "file")
        expect(mocks.model.env.rpc.FileAppendCommand.mock.calls[0]?.[1]).toEqual({
            info: { path: "/project/notes.ts" },
            data64: "",
        });
    else
        expect(mocks.model.env.rpc.FileMkdirCommand.mock.calls[0]?.[1]).toEqual({
            info: { path: "/project/notes" },
        });
    expect(container.querySelector(`[aria-label="New ${kind} name"]`)).toBeNull();
});
