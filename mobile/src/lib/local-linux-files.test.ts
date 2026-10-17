import { describe, expect, it, vi } from "vitest";
import type { V86 } from "v86";
import { listGuestFiles, readGuestText } from "./local-linux-files";

function fixture() {
    const inodes = [
        { mode: 0x4000, size: 0, mtime: 1 },
        { mode: 0x8000, size: 5, mtime: 2 },
        { mode: 0x4000, size: 0, mtime: 3 },
        { mode: 0xa000, size: 5, mtime: 4 },
    ];
    const read = vi.fn(async () => new TextEncoder().encode("hello"));
    const children = vi.fn(() => ["notes.txt", "src", "link", ".kron-script"]);
    const vm = { fs9p: { Search: (_parent: number, name: string) => ({ "notes.txt": 1, src: 2, link: 3, ".kron-script": 1 })[name] ?? -1, GetInode: (id: number) => inodes[id], GetChildren: children }, read_file: read } as unknown as V86;
    return { vm, inodes, read, children };
}

describe("shared Linux workspace", () => {
    it("lists real directories before files, including inode size and modification time", () => {
        const { vm } = fixture();
        expect(listGuestFiles(vm, "")).toEqual([
            { name: "src", path: "src", kind: "directory", size: 0, modifiedAt: 3000 },
            { name: "link", path: "link", kind: "other", size: 5, modifiedAt: 4000 },
            { name: "notes.txt", path: "notes.txt", kind: "file", size: 5, modifiedAt: 2000 },
        ]);
    });
    it("rejects traversal, absent paths and directory overflow", () => {
        const { vm, children } = fixture();
        expect(() => listGuestFiles(vm, "../tmp")).toThrow("Invalid");
        expect(() => listGuestFiles(vm, "missing")).toThrow("does not exist");
        children.mockReturnValue(Array(1001).fill("notes.txt"));
        expect(() => listGuestFiles(vm, "")).toThrow("1,000");
    });
    it("checks file type and size before allocating a read", async () => {
        const { vm, inodes, read } = fixture();
        await expect(readGuestText(vm, "link")).rejects.toThrow("regular");
        inodes[1].size = 1_000_001;
        await expect(readGuestText(vm, "notes.txt")).rejects.toThrow("1 MB");
        expect(read).not.toHaveBeenCalled();
    });
    it("reads UTF-8 text and rejects binary data", async () => {
        const { vm, read } = fixture();
        await expect(readGuestText(vm, "notes.txt")).resolves.toBe("hello");
        read.mockResolvedValue(new Uint8Array([0, 2]));
        await expect(readGuestText(vm, "notes.txt")).rejects.toThrow("binary");
    });
});
