// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { createConnection } from "node:net";

export function qmpCommand(path: string, execute: string, args: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const socket = createConnection(path);
        let buffer = "";
        const timer = setTimeout(
            () => finish(new Error("VM monitor timed out; inspect history before retrying.")),
            120000
        );
        const finish = (error?: Error, value?: unknown) => {
            clearTimeout(timer);
            socket.removeAllListeners();
            socket.on("error", () => {});
            socket.destroy();
            if (error) reject(error);
            else resolve(value);
        };
        socket.on("error", (error) => finish(error));
        socket.on("end", () => finish(new Error("VM monitor disconnected; outcome may be unknown.")));
        socket.on("data", (chunk) => {
            buffer += chunk.toString();
            if (buffer.length > 4 * 1024 * 1024) return finish(new Error("VM monitor response too large."));
            let end: number;
            while ((end = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, end).trim();
                buffer = buffer.slice(end + 1);
                if (!line) continue;
                let message: any;
                try {
                    message = JSON.parse(line);
                } catch {
                    return finish(new Error("Invalid VM monitor response."));
                }
                if (message.QMP) socket.write(JSON.stringify({ execute: "qmp_capabilities", id: 1 }) + "\n");
                else if (message.id === 1) {
                    if (message.error) return finish(new Error(message.error.desc));
                    socket.write(JSON.stringify({ execute, arguments: args, id: 2 }) + "\n");
                } else if (message.id === 2) {
                    return message.error ? finish(new Error(message.error.desc)) : finish(undefined, message.return);
                }
            }
        });
    });
}
