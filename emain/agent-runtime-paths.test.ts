// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveAgentWsh } from "./agent-runtime-paths";

const Roots: string[] = [];
afterEach(() => {
    vi.unstubAllEnvs();
    Roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

function fixture(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-wsh-"));
    Roots.push(root);
    return root;
}

function executable(filename: string): void {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}

describe("agent wsh resolution", () => {
    test("selects the host architecture from packaged binaries rather than the first directory entry", () => {
        const root = fixture();
        const resources = path.join(root, "resources");
        const bin = path.join(resources, "app.asar.unpacked", "dist", "bin");
        const host = path.join(bin, "wsh-0.14.3-darwin.arm64");
        executable(host);
        executable(path.join(bin, "wsh-0.14.3-darwin.x64"));
        executable(path.join(bin, "wsh-0.14.3-linux.arm64"));
        expect(
            resolveAgentWsh({ cwd: root, resourcesPath: resources, platform: "darwin", arch: "arm64", configured: "" })
        ).toBe(host);
    });

    test("honors an executable override and ignores directories or non-executable files", () => {
        const root = fixture();
        const override = path.join(root, "custom", "wsh");
        executable(override);
        executable(path.join(root, "wsh"));
        expect(resolveAgentWsh({ cwd: root, configured: override })).toBe(override);
        expect(resolveAgentWsh({ cwd: root, configured: root })).toBe(path.join(root, "wsh"));
        fs.chmodSync(override, 0o644);
        expect(resolveAgentWsh({ cwd: root, configured: override })).toBe(path.join(root, "wsh"));
    });
});
