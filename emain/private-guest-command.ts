// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";

export function runPrivateGuestCommand(command: string, args: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = execFile(command, args, { timeout: 30_000, maxBuffer: 64 * 1024 }, (error, stdout) => {
            if (error) reject(new Error("Secure browser operation failed. Check the selected computer and try again."));
            else resolve(stdout);
        });
        child.stdin.on("error", () => {});
        child.stdin.end(input);
    });
}
