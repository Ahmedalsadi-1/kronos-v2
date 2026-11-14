// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectInstalledAgents, detectOpenCodeCli, spawnAcpAgent } from "./acp-connector";

const mocks = vi.hoisted(() => ({ execFile: vi.fn(), spawn: vi.fn() }));
vi.mock("child_process", () => ({ execFile: mocks.execFile, spawn: mocks.spawn }));
vi.mock("./acp-types", () => ({
    ACP_BACKENDS_ALL: {
        first: { name: "First", cliCommand: "first", enabled: true },
        second: { name: "Second", cliCommand: "second", enabled: true },
        absent: { name: "Absent", cliCommand: "absent", enabled: true },
        disabled: { name: "Disabled", cliCommand: "disabled", enabled: false },
    },
}));

describe("ACP agent discovery", () => {
    beforeEach(() => vi.clearAllMocks());

    it("starts independent lookups concurrently and preserves backend order", async () => {
        const pending = new Map<string, (error: Error, stdout: string) => void>();
        mocks.execFile.mockImplementation((_command, args, options, callback) => {
            expect(options.timeout).toBe(5000);
            pending.set(args[0], callback);
        });
        const result = detectInstalledAgents();
        expect([...pending.keys()]).toEqual(["first", "second", "absent"]);
        pending.get("second")(null, "/bin/second\r\n/bin/other\r\n");
        pending.get("absent")(new Error("not found"), "");
        pending.get("first")(null, "/bin/first\n");
        expect(await result).toMatchObject([
            { backend: "first", available: true, cliPath: "/bin/first" },
            { backend: "second", available: true, cliPath: "/bin/second" },
            { backend: "absent", available: false },
        ]);
    });

    it("discovers an agent installed after a previous failed lookup", async () => {
        mocks.execFile.mockImplementation((_command, _args, _options, callback) => callback(new Error("missing"), ""));
        expect((await detectInstalledAgents())[0].available).toBe(false);
        mocks.execFile.mockImplementation((_command, args, _options, callback) => callback(null, `/bin/${args[0]}\n`));
        expect((await detectInstalledAgents())[0].available).toBe(true);
    });
});

describe("OpenCode executable discovery", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("prefers the native user installation over an unrelated PATH wrapper", async () => {
        const native = path.join(
            os.homedir(),
            ".opencode",
            "bin",
            process.platform === "win32" ? "opencode.exe" : "opencode"
        );
        vi.spyOn(fs, "accessSync").mockImplementation((value) => {
            if (String(value) !== native) throw new Error("missing");
        });
        mocks.execFile.mockClear();
        expect(await detectOpenCodeCli()).toBe(native);
        expect(mocks.execFile).not.toHaveBeenCalled();
    });

    it("honors an executable override before the native installation", async () => {
        vi.stubEnv("KRONTERM_OPENCODE_BIN", "/custom/opencode");
        vi.spyOn(fs, "accessSync").mockImplementation(() => {});
        expect(await detectOpenCodeCli()).toBe("/custom/opencode");
    });

    it("falls back to PATH when no native executable exists", async () => {
        vi.spyOn(fs, "accessSync").mockImplementation(() => {
            throw new Error("missing");
        });
        mocks.execFile.mockImplementation((_command, _args, _options, callback) =>
            callback(null, "/installed/opencode\n")
        );
        expect(await detectOpenCodeCli()).toBe("/installed/opencode");
    });
});

vi.mock("./acp-env", async (importOriginal) => {
    const original = await importOriginal<typeof import("./acp-env")>();
    return { ...original, prepareCleanEnv: vi.fn(async (env) => env) };
});

describe("KronosCode ACP executable resolution", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(fs, "accessSync").mockImplementation((value) => {
            if (String(value) !== "/Applications/KronOS Test/kronoscode") throw new Error("missing");
        });
        mocks.spawn.mockReturnValue({ unref: vi.fn() });
        mocks.execFile.mockImplementation((_command, _args, _options, callback) => callback(new Error("missing"), ""));
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("resolves a bare backend name without relying on the desktop PATH and preserves spaces", async () => {
        vi.stubEnv("KRONTERM_KRONOSCODE_BIN", "/Applications/KronOS Test/kronoscode");
        await spawnAcpAgent("kronoscode", "kronoscode", "/tmp", ["acp", "--attach", "http://127.0.0.1:1234"]);
        expect(mocks.spawn).toHaveBeenCalledWith(
            "/Applications/KronOS Test/kronoscode",
            ["acp", "--attach", "http://127.0.0.1:1234"],
            expect.objectContaining({ cwd: "/tmp" })
        );
    });

    it("preserves an explicitly configured executable", async () => {
        await spawnAcpAgent("kronoscode", "/custom/kronoscode", "/tmp", ["acp"]);
        expect(mocks.spawn).toHaveBeenCalledWith("/custom/kronoscode", ["acp"], expect.any(Object));
    });

    it("reports a missing runtime before attempting a broken spawn", async () => {
        vi.stubEnv("KRONTERM_KRONOSCODE_BIN", "");
        vi.stubEnv("KRONOSCODE_BIN", "");
        await expect(spawnAcpAgent("kronoscode", "kronoscode", "/tmp", ["acp"])).rejects.toThrow(
            "KronosCode executable is unavailable"
        );
        expect(mocks.spawn).not.toHaveBeenCalled();
    });
});
