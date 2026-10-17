import { globalStore } from "@/app/store/jotaiStore";
import { atom, type PrimitiveAtom } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { PreviewModel } from "./preview-model";

vi.mock("./preview", () => ({ PreviewView: () => null }));
vi.mock("./preview-directory-utils", () => ({ makeDirectoryDefaultMenuItems: vi.fn() }));
vi.mock("@/store/global", () => ({ getOverrideConfigAtom: vi.fn(), refocusNode: vi.fn() }));
vi.mock("@/app/store/contextmenu", () => ({ ContextMenuModel: {} }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));
vi.mock("@/store/wos", () => ({ makeORef: () => "block:file" }));
vi.mock("@/util/previewutil", () => ({ addOpenMenuItems: vi.fn() }));

function fixture() {
    const model = Object.create(PreviewModel.prototype) as PreviewModel;
    model.blockId = "file";
    model.metaFilePath = atom("/a.ts");
    model.connectionImmediate = atom("");
    model.newFileContent = atom("draft a");
    model.fileContentSaved = atom(null) as PrimitiveAtom<string>;
    model.errorMsgAtom = atom(null) as PrimitiveAtom<ErrorMsg>;
    model.blockAtom = atom({ meta: {} } as Block);
    model.statFilePath = atom((get) => Promise.resolve(get(model.metaFilePath)));
    model.fileDrafts = new Map();
    model.savedFileBuffers = new Map();
    const write = vi.fn(async () => {});
    model.env = {
        services: {
            object: {
                UpdateObjectMeta: vi.fn(async (_ref, meta) => globalStore.set(model.metaFilePath as any, meta.file)),
            },
        },
        rpc: { FileWriteCommand: write },
    } as any;
    return { model, write };
}
function pending() {
    let resolve: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve: () => resolve() };
}
describe("preview drafts", () => {
    it("preserves drafts through modal-style navigation and back/forward", async () => {
        const { model } = fixture();
        await model.goHistory("/b.ts");
        expect(model.getFileDraft("/a.ts")).toBe("draft a");
        globalStore.set(model.newFileContent, "draft b");
        globalStore.set(model.blockAtom as any, { meta: { history: ["/a.ts"] } });
        await model.goHistoryBack();
        expect(globalStore.get(model.newFileContent)).toBe("draft a");
        globalStore.set(model.blockAtom as any, { meta: { "history:forward": ["/b.ts"] } });
        await model.goHistoryForward();
        expect(globalStore.get(model.newFileContent)).toBe("draft b");
    });
    it("does not clear newer edits when a save completes", async () => {
        const { model, write } = fixture();
        const wait = pending();
        write.mockImplementation(() => wait.promise);
        const save = model.handleFileSave();
        await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
        globalStore.set(model.newFileContent, "newer edit");
        wait.resolve();
        await save;
        expect(globalStore.get(model.newFileContent)).toBe("newer edit");
        expect(globalStore.get(model.fileContentSaved)).toBe("draft a");
    });
    it("keeps another file draft when the previous file saves in background", async () => {
        const { model, write } = fixture();
        const wait = pending();
        write.mockImplementation(() => wait.promise);
        const save = model.handleFileSave();
        await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
        await model.goHistory("/b.ts");
        globalStore.set(model.newFileContent, "draft b");
        wait.resolve();
        await save;
        expect(globalStore.get(model.newFileContent)).toBe("draft b");
        await model.goHistory("/a.ts");
        expect(globalStore.get(model.newFileContent)).toBeNull();
        expect(globalStore.get(model.fileContentSaved)).toBe("draft a");
    });
    it("keeps connection drafts separate and preserves failed saves", async () => {
        const { model, write } = fixture();
        await model.goHistory("/b.ts");
        globalStore.set(model.connectionImmediate as any, "ssh:other");
        expect(model.hasFileDraft("/a.ts")).toBe(false);
        globalStore.set(model.newFileContent, "remote edit");
        write.mockRejectedValue(new Error("offline"));
        await model.handleFileSave();
        expect(globalStore.get(model.newFileContent)).toBe("remote edit");
        expect(globalStore.get(model.errorMsgAtom).status).toBe("Save Failed");
    });
});
