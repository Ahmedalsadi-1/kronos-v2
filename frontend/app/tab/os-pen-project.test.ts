// @vitest-environment jsdom
import { stringToBase64 } from "@/util/util";
import { expect, it, vi } from "vitest";
import { loadPenProject, penProjectRoots, type PenProjectDocument } from "./os-pen-project";
import { makeInitialOSModeState } from "./os-workspace-model";

const { list, read } = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));
vi.mock("@/app/store/wshclientapi", () => ({ RpcApi: { FileListCommand: list, FileReadCommand: read } }));
vi.mock("@/app/store/wshrpcutil", () => ({ TabRpcClient: {} }));

it("uses workspace roots first and avoids scanning the home directory as a fallback", () => {
    expect(penProjectRoots(["~/work/", "/home/user/work"], "/another", "/home/user")).toEqual(["/home/user/work"]);
    expect(penProjectRoots([], "/home/user/work", "/home/user")).toEqual(["/home/user/work"]);
    expect(penProjectRoots([], "/home/user/", "/home/user")).toEqual([]);
});

it("discovers nested Pen documents automatically and leaves restored edits alone", async () => {
    const path = "/project/designs/app.pen";
    const root = ["/project"];
    list.mockImplementation(async (_client, input) => {
        if (input.path.endsWith("/project"))
            return [
                { name: "designs", isdir: true },
                { name: "node_modules", isdir: true },
                { name: "linked.pen", modestr: "Lrwxrwxrwx" },
            ];
        expect(input.path).toBe("wsh://local//project/designs");
        return [{ name: "app.pen", size: 200 }];
    });
    read.mockResolvedValue({
        data64: stringToBase64(JSON.stringify({ version: "2.22", children: [{ type: "text", content: "Title" }] })),
    });
    const loaded: PenProjectDocument[] = [];
    const signal = new AbortController().signal;
    expect(await loadPenProject(root, [], signal, (doc) => loaded.push(doc))).toMatchObject({ found: 1, failed: 0 });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ path, layers: [{ kind: "pen-layer", text: "Title" }] });
    const restored = makeInitialOSModeState(
        {
            oid: "test-tab",
            blockids: [],
            meta: { "layout:os": { loadedPenPaths: [path], objects: loaded[0].layers } },
        } as unknown as Tab,
        []
    );
    const onReload = vi.fn();
    await loadPenProject(root, restored.loadedPenPaths, signal, onReload);
    expect(onReload).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
});

it("ignores a listing that completes after a workspace switch", async () => {
    const controller = new AbortController();
    list.mockImplementationOnce(async () => {
        controller.abort();
        return [{ name: "stale.pen" }];
    });
    const onDocument = vi.fn();
    await expect(loadPenProject(["/old-project"], [], controller.signal, onDocument)).rejects.toThrow();
    expect(onDocument).not.toHaveBeenCalled();
});
