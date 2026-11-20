import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { GuestFiles, guestPython } from "./guest-commands";
import { guestFileWriteCommands } from "./guest-file-transfer";
const exec = promisify(execFile);

it("transfers compressed and incompressible Unicode exactly within command limits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "guest-transfer-"));
    try {
        for (const text of ["hello 🌍\n".repeat(30000), randomBytes(50000).toString("base64") + "🌍"]) {
            const path = join(dir, "source.txt");
            const commands = guestFileWriteCommands(path, text);
            expect(commands.every((command) => command.length <= 20000)).toBe(true);
            if (text.startsWith("hello")) expect(commands).toHaveLength(1);
            for (const command of commands) await exec("sh", ["-c", command]);
            expect(await readFile(path, "utf8")).toBe(text);
        }
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

it("edits atomically, preserves executable permissions, and refuses stale or ambiguous edits", async () => {
    const dir = await mkdtemp(join(tmpdir(), "guest-edit-"));
    try {
        const path = join(dir, "run.sh");
        const text = "#!/bin/sh\necho before\n";
        await writeFile(path, text);
        await chmod(path, 0o755);
        const digest = createHash("sha256").update(text).digest("hex");
        const edit = (expectedSha256: string, oldText = "before") =>
            exec("sh", [
                "-c",
                guestPython(GuestFiles, { action: "edit", path, oldText, newText: "after", expectedSha256 }),
            ]);
        await expect(edit(digest, "missing")).rejects.toThrow();
        await edit(digest);
        expect(await readFile(path, "utf8")).toBe(text.replace("before", "after"));
        expect((await stat(path)).mode & 0o777).toBe(0o755);
        await expect(edit(digest)).rejects.toThrow();
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
