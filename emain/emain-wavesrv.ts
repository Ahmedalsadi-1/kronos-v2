// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as electron from "electron";
import * as child_process from "node:child_process";
import * as readline from "readline";
import { WebServerEndpointVarName, WSServerEndpointVarName } from "../frontend/util/endpoints";
import { AuthKey, WaveAuthKeyEnv } from "./authkey";
import { setForceQuit } from "./emain-activity";
import {
    getElectronAppResourcesPath,
    getElectronAppUnpackedBasePath,
    getWaveConfigDir,
    getWaveDataDir,
    getWaveSrvCwd,
    getWaveSrvPath,
    getXdgCurrentDesktop,
    WaveConfigHomeVarName,
    WaveDataHomeVarName,
} from "./emain-platform";
import {
    getElectronExecPath,
    WaveAppElectronExecPath,
    WaveAppPathVarName,
    WaveAppResourcesPathVarName,
} from "./emain-util";
import { updater } from "./updater";

let isWaveSrvDead = false;
let waveSrvProc: child_process.ChildProcessWithoutNullStreams | null = null;
let WaveVersion = "unknown"; // set by WAVESRV-ESTART
let WaveBuildTime = 0; // set by WAVESRV-ESTART

export function getWaveVersion(): { version: string; buildTime: number } {
    return { version: WaveVersion, buildTime: WaveBuildTime };
}

export function getWaveSrvProc(): child_process.ChildProcessWithoutNullStreams | null {
    return waveSrvProc;
}

export function getIsWaveSrvDead(): boolean {
    return isWaveSrvDead;
}

export async function runWaveSrv(handleWSEvent: (evtMsg: WSEventType) => void): Promise<void> {
    const envCopy = { ...process.env };
    const xdgCurrentDesktop = getXdgCurrentDesktop();
    if (xdgCurrentDesktop != null) {
        envCopy["XDG_CURRENT_DESKTOP"] = xdgCurrentDesktop;
    }
    envCopy[WaveAppPathVarName] = getElectronAppUnpackedBasePath();
    envCopy[WaveAppResourcesPathVarName] = getElectronAppResourcesPath();
    envCopy[WaveAppElectronExecPath] = getElectronExecPath();
    envCopy[WaveAuthKeyEnv] = AuthKey;
    envCopy[WaveDataHomeVarName] = getWaveDataDir();
    envCopy[WaveConfigHomeVarName] = getWaveConfigDir();
    envCopy["WCLOUD_ENDPOINT"] = "https://api.kronterm.dev/central";
    envCopy["WCLOUD_WS_ENDPOINT"] = "wss://wsapi.kronterm.dev/";
    const waveSrvCmd = getWaveSrvPath();
    console.log("trying to run local server", waveSrvCmd);
    const proc = child_process.spawn(waveSrvCmd, {
        cwd: getWaveSrvCwd(),
        env: envCopy,
    });
    waveSrvProc = proc;
    return new Promise<void>((resolve, reject) => {
        let startupState: "starting" | "ready" | "failed" = "starting";
        const timeout = setTimeout(() => failStartup(new Error("Local workspace startup timed out")), 60_000);

        function failStartup(error: Error) {
            if (startupState !== "starting") return;
            startupState = "failed";
            clearTimeout(timeout);
            reject(error);
        }

        proc.once("exit", (code, signal) => {
            isWaveSrvDead = true;
            if (startupState !== "ready") {
                failStartup(new Error(`Local workspace exited during startup (${signal ?? code})`));
                return;
            }
            if (updater?.status === "installing") return;
            console.log("wavesrv exited, shutting down");
            setForceQuit(true);
            electron.app.quit();
        });
        proc.on("error", (error) => {
            console.log("error running wavesrv", error);
            if (proc.pid == null) {
                isWaveSrvDead = true;
                waveSrvProc = null;
            }
            failStartup(error);
        });
        const rlStdout = readline.createInterface({
            input: proc.stdout,
            terminal: false,
        });
        rlStdout.on("line", (line) => {
            console.log(line);
        });
        const rlStderr = readline.createInterface({
            input: proc.stderr,
            terminal: false,
        });
        rlStderr.on("line", (line) => {
            if (line.includes("WAVESRV-ESTART")) {
                if (startupState !== "starting") return;
                const startParams = /ws:([a-z0-9.:]+) web:([a-z0-9.:]+) version:([a-z0-9.-]+) buildtime:(\d+)/gm.exec(
                    line
                );
                if (startParams == null) {
                    failStartup(new Error("Invalid local workspace startup response"));
                    return;
                }
                process.env[WSServerEndpointVarName] = startParams[1];
                process.env[WebServerEndpointVarName] = startParams[2];
                WaveVersion = startParams[3];
                WaveBuildTime = parseInt(startParams[4]);
                startupState = "ready";
                clearTimeout(timeout);
                resolve();
                return;
            }
            if (line.startsWith("WAVESRV-EVENT:")) {
                const evtJson = line.slice("WAVESRV-EVENT:".length);
                try {
                    const evtMsg: WSEventType = JSON.parse(evtJson);
                    handleWSEvent(evtMsg);
                } catch (e) {
                    console.log("error handling WAVESRV-EVENT", e);
                }
                return;
            }
            console.log(line);
        });
    });
}
