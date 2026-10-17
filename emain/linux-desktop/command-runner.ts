// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { execFile } from "node:child_process";
import type { CommandRunner } from "./upstream/openmaus/container-computer";
import { augmentedPath } from "./upstream/openmaus/kronterm-adapter";

export const runLinuxDesktopCommand: CommandRunner = (command, args, timeout = 30_000) =>
    new Promise((resolve, reject) => {
        execFile(
            command,
            args,
            { timeout, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PATH: augmentedPath() } },
            (error, stdout) => (error ? reject(error) : resolve({ stdout }))
        );
    });
