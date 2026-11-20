import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { qmpCommand } from "./qmp-client";

it("negotiates QMP, ignores events, and surfaces monitor failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "qmp-test-"));
    const path = join(dir, "qmp.sock");
    const server = createServer((socket) => {
        socket.write('{"QMP":');
        socket.write("{}}\n");
        let buffer = "";
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            let index: number;
            while ((index = buffer.indexOf("\n")) >= 0) {
                const message = JSON.parse(buffer.slice(0, index));
                buffer = buffer.slice(index + 1);
                socket.write('{"event":"STOP"}\n');
                socket.write(
                    JSON.stringify(
                        message.execute === "fail"
                            ? { id: message.id, error: { desc: "snapshot failed" } }
                            : { id: message.id, return: message.id === 1 ? {} : [{ device: "disk" }] }
                    ) + "\n"
                );
            }
        });
    });
    await new Promise<void>((resolve) => server.listen(path, resolve));
    try {
        expect(await qmpCommand(path, "query-block")).toEqual([{ device: "disk" }]);
        await expect(qmpCommand(path, "fail")).rejects.toThrow("snapshot failed");
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await rm(dir, { recursive: true, force: true });
    }
});
