// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const Exec = promisify(execFile);
export type WorktreeCheckpoint = { id: string; stepId: string; directory: string; createdAt: number };

function inside(root: string, relative: string): string {
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid checkpoint path");
    let parent = path.dirname(resolved);
    while (parent !== root) {
        if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink())
            throw new Error("Checkpoint path crosses a symbolic link");
        parent = path.dirname(parent);
    }
    return resolved;
}

async function changedFiles(worktree: string): Promise<string[]> {
    const { stdout } = await Exec("git", [
        "-C",
        worktree,
        "ls-files",
        "-z",
        "--modified",
        "--deleted",
        "--others",
        "--exclude-standard",
    ]);
    const { stdout: staged } = await Exec("git", ["-C", worktree, "diff", "--name-only", "-z", "HEAD"]);
    return [...new Set(`${stdout}\0${staged}`.split("\0").filter(Boolean))];
}

export async function createWorktreeCheckpoint(worktree: string, directory: string): Promise<void> {
    const files = await changedFiles(worktree);
    const records: { file: string; exists: boolean }[] = [];
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    for (const file of files) {
        const source = inside(worktree, file);
        const destination = inside(path.join(directory, "files"), file);
        const exists = fs.existsSync(source);
        records.push({ file, exists });
        if (exists) {
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.cpSync(source, destination, { recursive: false, dereference: false });
        }
    }
    const { stdout: head } = await Exec("git", ["-C", worktree, "rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ head: head.trim(), files: records }), {
        mode: 0o600,
    });
}

export async function restoreWorktreeCheckpoint(worktree: string, directory: string): Promise<void> {
    const { stdout: actualRoot } = await Exec("git", ["-C", worktree, "rev-parse", "--show-toplevel"]);
    if (fs.realpathSync(actualRoot.trim()) !== fs.realpathSync(worktree))
        throw new Error("Checkpoint target is not the isolated worktree root");
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8"));
    const { stdout: head } = await Exec("git", ["-C", worktree, "rev-parse", "HEAD"]);
    if (manifest.head !== head.trim()) throw new Error("Worktree HEAD changed; inspect commits before restoring");
    const changed = await changedFiles(worktree);
    const { stdout: untracked } = await Exec("git", [
        "-C",
        worktree,
        "ls-files",
        "-z",
        "--others",
        "--exclude-standard",
    ]);
    for (const file of changed) inside(worktree, file);
    for (const record of manifest.files) inside(worktree, record.file);
    await Exec("git", ["-C", worktree, "restore", "--source=HEAD", "--staged", "--worktree", "--", "."]);
    for (const file of untracked.split("\0").filter(Boolean)) fs.rmSync(inside(worktree, file), { force: true });
    for (const record of manifest.files) {
        const destination = inside(worktree, record.file);
        if (!record.exists) {
            fs.rmSync(destination, { force: true });
            continue;
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.rmSync(destination, { force: true });
        fs.cpSync(inside(path.join(directory, "files"), record.file), destination, { dereference: false });
    }
}
