// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebServerEndpointVarName, WSServerEndpointVarName } from "../frontend/util/endpoints";
import { getWaveVersion, runWaveSrv } from "./emain-wavesrv";

const { spawn, quit } = vi.hoisted(() => ({ spawn: vi.fn(), quit: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn }));
vi.mock("electron", () => ({ app: { quit } }));
vi.mock("./authkey", () => ({ AuthKey: "test", WaveAuthKeyEnv: "WAVESRV_AUTH_KEY" }));
vi.mock("./emain-activity", () => ({ setForceQuit: vi.fn() }));
vi.mock("./emain-platform", () => ({
    getElectronAppResourcesPath: () => "/test/resources",
    getElectronAppUnpackedBasePath: () => "/test/app",
    getWaveConfigDir: () => "/test/config",
    getWaveDataDir: () => "/test/data",
    getWaveSrvCwd: () => "/test",
    getWaveSrvPath: () => "/test/wavesrv",
    getXdgCurrentDesktop: () => undefined,
    WaveConfigHomeVarName: "WAVESRV_CONFIG",
    WaveDataHomeVarName: "WAVESRV_DATA",
}));
vi.mock("./emain-util", () => ({
    getElectronExecPath: () => "/test/electron",
    WaveAppElectronExecPath: "WAVESRV_EXEC",
    WaveAppPathVarName: "WAVESRV_APP",
    WaveAppResourcesPathVarName: "WAVESRV_RESOURCES",
}));
vi.mock("./updater", () => ({ updater: undefined }));

class WorkspaceProcess extends EventEmitter {
    stdout = new PassThrough();
    stderr = new PassThrough();
}

describe("local workspace startup", () => {
    let child: WorkspaceProcess;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        vi.stubEnv(WebServerEndpointVarName, undefined);
        vi.stubEnv(WSServerEndpointVarName, undefined);
        child = new WorkspaceProcess();
        spawn.mockReturnValue(child);
    });

    afterEach(() => {
        child.stdout.end();
        child.stderr.end();
        vi.unstubAllEnvs();
        vi.useRealTimers();
    });

    it("rejects when the process cannot spawn", async () => {
        const ready = runWaveSrv(vi.fn());
        child.emit("error", new Error("ENOENT"));
        await expect(ready).rejects.toThrow("ENOENT");
        expect(quit).not.toHaveBeenCalled();
    });

    it("rejects an early process exit", async () => {
        const ready = runWaveSrv(vi.fn());
        child.emit("exit", 1, null);
        await expect(ready).rejects.toThrow("exited during startup");
        expect(quit).not.toHaveBeenCalled();
    });

    it("rejects a malformed handshake", async () => {
        const ready = runWaveSrv(vi.fn());
        child.stderr.write("WAVESRV-ESTART: invalid\n");
        await expect(ready).rejects.toThrow("Invalid local workspace startup response");
    });

    it("rejects a stalled handshake and ignores a late response", async () => {
        const ready = runWaveSrv(vi.fn());
        const failure = expect(ready).rejects.toThrow("startup timed out");
        await vi.advanceTimersByTimeAsync(60_000);
        await failure;
        child.stderr.write("WAVESRV-ESTART: ws:127.0.0.1:1 web:127.0.0.1:2 version:0.14.3 buildtime:123\n");
        expect(process.env[WebServerEndpointVarName]).toBeUndefined();
    });

    it("sets the endpoints after the handshake and handles a later exit", async () => {
        const eventHandler = vi.fn();
        const ready = runWaveSrv(eventHandler);
        child.stderr.write("WAVESRV-ESTART: ws:127.0.0.1:1 web:127.0.0.1:2 version:0.14.3 buildtime:123\n");
        await ready;
        expect(process.env[WSServerEndpointVarName]).toBe("127.0.0.1:1");
        expect(process.env[WebServerEndpointVarName]).toBe("127.0.0.1:2");
        expect(getWaveVersion()).toEqual({ version: "0.14.3", buildTime: 123 });
        child.stderr.write('WAVESRV-EVENT:{"eventtype":"test"}\n');
        expect(eventHandler).toHaveBeenCalledWith({ eventtype: "test" });
        child.emit("exit", 1, null);
        expect(quit).toHaveBeenCalledOnce();
    });
});
