import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { DeveloperMemoryStore } from "../src/developer-memory.ts";

it("searches legacy memories without evidence and sessions without events", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kronterm-memory-"));
    try {
        const file = join(directory, "memory.json");
        await writeFile(
            file,
            JSON.stringify({
                memories: [{ id: "old", content: "legacy deploy", updatedAt: "2026-10-10" }],
                sessions: [{ id: "session", title: "legacy deploy", updatedAt: "2026-10-10" }],
            })
        );
        const store = new DeveloperMemoryStore(file);
        assert.equal((await store.searchMemories("deploy"))[0].id, "old");
        assert.equal((await store.searchSessions("deploy"))[0].id, "session");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

it("allows queued writes after a rejected mutation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "kronterm-memory-"));
    try {
        const store = new DeveloperMemoryStore(join(directory, "memory.json"));
        await assert.rejects(store.deleteMemory("missing"), /not found/);
        const memory = await store.createMemory({ content: "recovered" });
        assert.equal((await store.getMemory(memory.id)).content, "recovered");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
