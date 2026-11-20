import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { VmHistoryStore } from "./vm-history";

it("preserves departing branches before restore and reconciles snapshots after metadata loss", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vm-history-"));
    const snapshots: any[] = [];
    const operations: string[] = [];
    const runner = vi.fn(async (_command: string, args: string[]) => {
        if (args[0] === "info") return { stdout: JSON.stringify({ snapshots }) };
        operations.push(args[1]);
        if (args[1] === "-c") snapshots.push({ name: args[2], "date-sec": 1700000000, "vm-state-size": 0 });
        return { stdout: "" };
    });
    try {
        const store = new VmHistoryStore(dir, runner);
        const first = await store.create("First", false, () => {});
        const second = await store.create("Second", false, () => {});
        const restored = await store.restore(first.head, false, () => {});
        expect(operations).toEqual(["-c", "-c", "-c", "-a"]);
        expect(restored.head).toBe(first.head);
        expect(restored.checkpoints.at(-1).parentId).toBe(second.head);
        expect(JSON.parse(await readFile(join(dir, "history.json"), "utf8")).head).toBe(first.head);
        await rm(join(dir, "history.json"));
        expect((await store.list(false)).checkpoints).toHaveLength(3);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

it("does not restore when automatic backup fails or authorization changes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vm-history-"));
    const id = "kronos-00000000-0000-0000-0000-000000000001";
    const runner = vi.fn(async (_command: string, args: string[]) => {
        if (args[0] === "info")
            return { stdout: JSON.stringify({ snapshots: [{ name: id, "date-sec": 1700000000 }] }) };
        throw new Error("Disk full");
    });
    try {
        const store = new VmHistoryStore(dir, runner);
        await expect(store.restore(id, false, () => {})).rejects.toThrow("Disk full");
        expect(runner.mock.calls.some(([, args]) => args.includes("-a"))).toBe(false);
        await expect(
            store.restore(id, false, () => {
                throw new Error("Control changed");
            })
        ).rejects.toThrow("Control changed");
        expect(runner.mock.calls.filter(([, args]) => args.includes("-c"))).toHaveLength(1);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
