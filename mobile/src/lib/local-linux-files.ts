import type { V86 } from "v86";
import { safeGuestPath, type LocalLinuxEntry, type LocalLinuxFile } from "./local-linux-protocol";

interface SharedFilesystem {
    Search(parent: number, name: string): number;
    CreateDirectory(name: string, parent: number): number;
    GetInode(id: number): { mode: number; size: number; mtime: number };
    GetChildren(id: number): string[];
    Write(id: number, offset: number, length: number, data: Uint8Array): Promise<void>;
    ChangeSize(id: number, length: number): Promise<void>;
}

export async function writeGuestFiles(vm: V86, files: LocalLinuxFile[]): Promise<void> {
    if (files.some((file) => !safeGuestPath(file.path))) throw new Error("Invalid workspace path");
    // v86's pinned public file API lacks directory creation and overwrites; use its 9p filesystem for those operations.
    const fs = (vm as V86 & { fs9p: SharedFilesystem }).fs9p;
    if (!fs) throw new Error("Linux shared filesystem is unavailable");
    for (const file of files) {
        const parts = file.path.split("/");
        const name = parts.pop()!;
        let parent = 0;
        for (const part of parts) {
            const existing = fs.Search(parent, part);
            parent = existing < 0 ? fs.CreateDirectory(part, parent) : existing;
            if ((fs.GetInode(parent).mode & 0xf000) !== 0x4000) throw new Error(`Not a directory: ${part}`);
        }
        const bytes = new TextEncoder().encode(file.content);
        const existing = fs.Search(parent, name);
        if (existing < 0) await vm.create_file(file.path, bytes);
        else {
            if ((fs.GetInode(existing).mode & 0xf000) !== 0x8000) throw new Error(`Not a regular file: ${file.path}`);
            await fs.ChangeSize(existing, bytes.length);
            await fs.Write(existing, 0, bytes.length, bytes);
        }
    }
}

function resolveGuestInode(vm: V86, path: string): { fs: SharedFilesystem; id: number } {
    if (path !== "" && !safeGuestPath(path)) throw new Error("Invalid workspace path");
    const fs = (vm as V86 & { fs9p: SharedFilesystem }).fs9p;
    if (!fs) throw new Error("Linux shared filesystem is unavailable");
    let id = 0;
    for (const part of path.split("/").filter(Boolean)) {
        if ((fs.GetInode(id).mode & 0xf000) !== 0x4000) throw new Error("Not a directory");
        id = fs.Search(id, part);
        if (id < 0) throw new Error("Workspace path does not exist");
    }
    return { fs, id };
}

export function listGuestFiles(vm: V86, path: string): LocalLinuxEntry[] {
    const { fs, id } = resolveGuestInode(vm, path);
    if ((fs.GetInode(id).mode & 0xf000) !== 0x4000) throw new Error("Not a directory");
    const names = fs.GetChildren(id);
    if (names.length > 1000) throw new Error("This directory exceeds the 1,000 entry limit");
    return names
        .filter((name) => !name.startsWith(".kron-"))
        .map((name) => {
            const entryPath = path ? `${path}/${name}` : name;
            if (!safeGuestPath(entryPath)) throw new Error("Unsupported workspace filename");
            const inode = fs.GetInode(fs.Search(id, name));
            const mode = inode.mode & 0xf000;
            return {
                name,
                path: entryPath,
                kind: mode === 0x4000 ? "directory" : mode === 0x8000 ? "file" : "other",
                size: inode.size,
                modifiedAt: inode.mtime * 1000,
            } as LocalLinuxEntry;
        })
        .sort(
            (a, b) => Number(b.kind === "directory") - Number(a.kind === "directory") || a.name.localeCompare(b.name)
        );
}

export async function readGuestText(vm: V86, path: string): Promise<string> {
    if (!safeGuestPath(path)) throw new Error("Invalid workspace path");
    const { fs, id } = resolveGuestInode(vm, path);
    const inode = fs.GetInode(id);
    if ((inode.mode & 0xf000) !== 0x8000) throw new Error("Only regular files can be opened");
    if (inode.size > 1_000_000) throw new Error("Open text files smaller than 1 MB");
    const bytes = await vm.read_file(path);
    if (bytes.includes(0)) throw new Error("This file contains binary data");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
