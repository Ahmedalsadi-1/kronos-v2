// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { gzipSync } from "node:zlib";
import { GuestFiles, guestPython } from "./guest-commands";

export function guestFileWriteCommands(path: string, text: string): string[] {
    const bytes = Buffer.from(text);
    if (bytes.length > 1048576) throw new Error("File exceeds 1 MB.");
    const command = (chunk: Buffer, append: boolean) =>
        guestPython(GuestFiles, {
            action: append ? "append" : "write",
            path,
            data: gzipSync(chunk).toString("base64"),
        });
    const whole = command(bytes, false);
    if (whole.length <= 20000) return [whole];
    const commands: string[] = [];
    for (let offset = 0; offset < bytes.length;) {
        let size = bytes.length - offset;
        let next = command(bytes.subarray(offset, offset + size), offset > 0);
        while (next.length > 20000 && size > 1) {
            size = Math.floor(size / 2);
            next = command(bytes.subarray(offset, offset + size), offset > 0);
        }
        if (next.length > 20000) throw new Error("Guest file path is too long for transfer.");
        commands.push(next);
        offset += size;
    }
    return commands;
}
