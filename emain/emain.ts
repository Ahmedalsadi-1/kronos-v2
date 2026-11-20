// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RpcApi } from "@/app/store/wshclientapi";
import * as electron from "electron";
import { globalEvents } from "emain/emain-events";
import { mkdir } from "node:fs/promises";
import path from "path";
import { sprintf } from "sprintf-js";
import * as services from "../frontend/app/store/services";
import { CurrentOnboardingVersion } from "../frontend/types/onboarding-version";
import { initElectronWshrpc, shutdownWshrpc } from "../frontend/app/store/wshrpcutil-base";
import { fireAndForget } from "../frontend/util/util";
import { stopAllAgentManagers } from "./acp";
import { AuthKey, configureAuthKeyRequestInjection } from "./authkey";
import { installBackgroundLaunchPolicy } from "./background-launch";
import { browserBookmarksDirectory, restoreBrowserExtensions } from "./browser/browser-migration";
import { watchBrowserSession } from "./browser/browser-site-settings";
import { installBrowserElementTool } from "./browser-element-tool";
import { ensureKronRender, stopKronRender } from "./comfyui-runtime";
import {
    getActivityState,
    getAndClearTermCommandsDurable,
    getAndClearTermCommandsRemote,
    getAndClearTermCommandsRun,
    getAndClearTermCommandsWsl,
    getForceQuit,
    getGlobalIsRelaunching,
    getUserConfirmedQuit,
    setForceQuit,
    setGlobalIsQuitting,
    setGlobalIsStarting,
    setUserConfirmedQuit,
    setWasActive,
    setWasInFg,
} from "./emain-activity";
import { stopAudioEngine } from "./emain-audio";
import { initIpcHandlers } from "./emain-ipc";
import { log } from "./emain-log";
import { stopAllLanguageServers } from "./emain-lsp";
import { initMenuEventSubscriptions, makeAndSetAppMenu, makeDockTaskbar } from "./emain-menu";
import {
    checkIfRunningUnderARM64Translation,
    getElectronAppBasePath,
    getElectronAppUnpackedBasePath,
    getWaveConfigDir,
    getWaveDataDir,
    isDev,
    unameArch,
    unamePlatform,
} from "./emain-platform";
import { ensureHotSpareTab, setMaxTabCacheSize } from "./emain-tabview";
import { getIsWaveSrvDead, getWaveSrvProc, runWaveSrv } from "./emain-wavesrv";
import { applyWebviewAttachPolicy } from "./emain-webview-policy";
import {
    createBrowserWindow,
    createNewWaveWindow,
    focusedWaveWindow,
    getAllWaveWindows,
    getWaveWindowById,
    getWaveWindowByWorkspaceId,
    registerGlobalHotkey,
    registerNotchHotkey,
    relaunchBrowserWindows,
    WaveBrowserWindow,
} from "./emain-window";
import { ElectronWshClient, initElectronWshClient } from "./emain-wsh";
import { HermesRuntime } from "./hermes-runtime";
import { KronosCodeRuntime } from "./kronoscode-runtime";
import { openKronosSignIn, waitForKronosStartupSignIn } from "./kronos-signin";
import { isKronosAccountConfigured } from "./kronos-auth";
import { getLaunchSettings } from "./launchsettings";
import { focusStartupOnboarding, runStartupOnboarding } from "./startup-onboarding";
import { ensureKronosSkillDirectory } from "./shared-skill-roots";
import { configureAutoUpdater, updater } from "./updater";
import { activateExistingWorkspace } from "./workspace-activation";
import { initializeComputerAccessPersistence } from "./computer-access-policy";
import { recordDiagnostic } from "./diagnostics";

const electronApp = electron.app;
installBackgroundLaunchPolicy();

let confirmQuit = true;
let startupWorkspaceReleased = false;

const waveDataDir = getWaveDataDir();
const waveConfigDir = getWaveConfigDir();
initializeComputerAccessPersistence(path.join(waveDataDir, "computer-access.json"));

// requestSingleInstanceLock keys off the default userData path, which is
// shared by every same-named instance — this makes the lock per-profile.
electronApp.setPath("userData", path.join(waveDataDir, "electron-userdata"));

electron.nativeTheme.themeSource = "system";

console.log = log;
console.log(
    sprintf(
        "kronterm-app starting, data_dir=%s, config_dir=%s electronpath=%s gopath=%s arch=%s/%s electron=%s",
        waveDataDir,
        waveConfigDir,
        getElectronAppBasePath(),
        getElectronAppUnpackedBasePath(),
        unamePlatform,
        unameArch,
        process.versions.electron
    )
);
if (isDev) {
    console.log("kronterm-app KRONTERM_DEV set");
}

function handleWSEvent(evtMsg: WSEventType) {
    fireAndForget(async () => {
        console.log("handleWSEvent", evtMsg?.eventtype);
        if (evtMsg.eventtype == "electron:newwindow") {
            if (!startupWorkspaceReleased) return;
            console.log("electron:newwindow", evtMsg.data);
            const windowId: string = evtMsg.data;
            const windowData: WaveWindow = (await services.ObjectService.GetObject("window:" + windowId)) as WaveWindow;
            if (windowData == null) {
                return;
            }
            const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
            const newWin = await createBrowserWindow(windowData, fullConfig, {
                unamePlatform,
                isPrimaryStartupWindow: false,
            });
            newWin.show();
        } else if (evtMsg.eventtype == "electron:closewindow") {
            console.log("electron:closewindow", evtMsg.data);
            if (evtMsg.data === undefined) return;
            const ww = getWaveWindowById(evtMsg.data);
            if (ww != null) {
                ww.destroy(); // bypass the "are you sure?" dialog
            }
        } else if (evtMsg.eventtype == "electron:updateactivetab") {
            const activeTabUpdate: { workspaceid: string; newactivetabid: string } = evtMsg.data;
            console.log("electron:updateactivetab", activeTabUpdate);
            const ww = getWaveWindowByWorkspaceId(activeTabUpdate.workspaceid);
            if (ww == null) {
                return;
            }
            await ww.setActiveTab(activeTabUpdate.newactivetabid, false);
        } else {
            console.log("unhandled electron ws eventtype", evtMsg.eventtype);
        }
    });
}

// we try to set the primary display as index [0]
function getActivityDisplays(): ActivityDisplayType[] {
    const displays = electron.screen.getAllDisplays();
    const primaryDisplay = electron.screen.getPrimaryDisplay();
    const rtn: ActivityDisplayType[] = [];
    for (const display of displays) {
        const adt = {
            width: display.size.width,
            height: display.size.height,
            dpr: display.scaleFactor,
            internal: display.internal,
        };
        if (display.id === primaryDisplay?.id) {
            rtn.unshift(adt);
        } else {
            rtn.push(adt);
        }
    }
    return rtn;
}

async function sendDisplaysTDataEvent() {
    const displays = getActivityDisplays();
    if (displays.length === 0) {
        return;
    }
    const props: TEventProps = {};
    props["display:count"] = displays.length;
    props["display:height"] = displays[0].height;
    props["display:width"] = displays[0].width;
    props["display:dpr"] = displays[0].dpr;
    props["display:all"] = displays;
    try {
        await RpcApi.RecordTEventCommand(
            ElectronWshClient,
            {
                event: "app:display",
                props,
            },
            { noresponse: true }
        );
    } catch (e) {
        console.log("error sending display tdata event", e);
    }
}

function logActiveState() {
    fireAndForget(async () => {
        const astate = getActivityState();
        const activity: ActivityUpdate = { openminutes: 1 };
        const ww = focusedWaveWindow;
        const activeTabView = ww?.activeTabView;
        const isWaveAIOpen = activeTabView?.isWaveAIOpen ?? false;

        if (astate.wasInFg) {
            activity.fgminutes = 1;
        }
        if (astate.wasActive) {
            activity.activeminutes = 1;
        }
        activity.displays = getActivityDisplays();

        const termCmdCount = getAndClearTermCommandsRun();
        if (termCmdCount > 0) {
            activity.termcommandsrun = termCmdCount;
        }
        const termCmdRemoteCount = getAndClearTermCommandsRemote();
        const termCmdWslCount = getAndClearTermCommandsWsl();
        const termCmdDurableCount = getAndClearTermCommandsDurable();

        const props: TEventProps = {
            "activity:activeminutes": activity.activeminutes,
            "activity:fgminutes": activity.fgminutes,
            "activity:openminutes": activity.openminutes,
        };
        if (termCmdCount > 0) {
            props["activity:termcommandsrun"] = termCmdCount;
        }
        if (termCmdRemoteCount > 0) {
            props["activity:termcommands:remote"] = termCmdRemoteCount;
        }
        if (termCmdWslCount > 0) {
            props["activity:termcommands:wsl"] = termCmdWslCount;
        }
        if (termCmdDurableCount > 0) {
            props["activity:termcommands:durable"] = termCmdDurableCount;
        }
        if (astate.wasActive && isWaveAIOpen) {
            props["activity:waveaiactiveminutes"] = 1;
        }
        if (astate.wasInFg && isWaveAIOpen) {
            props["activity:waveaifgminutes"] = 1;
        }

        try {
            await RpcApi.ActivityCommand(ElectronWshClient, activity, { noresponse: true });
            await RpcApi.RecordTEventCommand(
                ElectronWshClient,
                {
                    event: "app:activity",
                    props,
                },
                { noresponse: true }
            );
        } catch (e) {
            console.log("error logging active state", e);
        } finally {
            setWasInFg(ww?.isFocused() ?? false);
            setWasActive(false);
        }
    });
}

// this isn't perfect, but gets the job done without being complicated
function runActiveTimer() {
    logActiveState();
    setTimeout(runActiveTimer, 60000);
}

function hideWindowWithCatch(window: WaveBrowserWindow) {
    if (window == null) {
        return;
    }
    try {
        if (window.isDestroyed()) {
            return;
        }
        window.hide();
    } catch (e) {
        console.log("error hiding window", e);
    }
}

electronApp.on("window-all-closed", () => {
    if (!startupWorkspaceReleased || getGlobalIsRelaunching()) {
        return;
    }
    if (unamePlatform !== "darwin") {
        setUserConfirmedQuit(true);
        electronApp.quit();
    }
});
electronApp.on("before-quit", (e) => {
    const allWindows = getAllWaveWindows();
    if (
        confirmQuit &&
        !getForceQuit() &&
        !getUserConfirmedQuit() &&
        allWindows.length > 0 &&
        !getIsWaveSrvDead() &&
        !process.env.KRONTERM_NOCONFIRMQUIT
    ) {
        e.preventDefault();
        const choice = electron.dialog.showMessageBoxSync(null, {
            type: "question",
            buttons: ["Cancel", "Quit"],
            title: "Confirm Quit",
            message: "Are you sure you want to quit KronOS?",
            defaultId: 0,
            cancelId: 0,
        });
        if (choice === 0) {
            return;
        }
        setUserConfirmedQuit(true);
        electronApp.quit();
        return;
    }
    setGlobalIsQuitting(true);
    void stopAllAgentManagers();
    HermesRuntime.stop();
    KronosCodeRuntime.stop();
    stopAllLanguageServers();
    stopAudioEngine();
    stopKronRender();
    updater?.stop();
    if (unamePlatform == "win32") {
        // win32 doesn't have a SIGINT, so we just let electron die, which
        // ends up killing wavesrv via closing it's stdin.
        return;
    }
    getWaveSrvProc()?.kill("SIGINT");
    shutdownWshrpc();
    if (getForceQuit()) {
        return;
    }
    e.preventDefault();
    for (const window of allWindows) {
        hideWindowWithCatch(window);
    }
    if (getIsWaveSrvDead()) {
        console.log("wavesrv is dead, quitting immediately");
        setForceQuit(true);
        electronApp.quit();
        return;
    }
    setTimeout(() => {
        console.log("waiting for wavesrv to exit...");
        setForceQuit(true);
        electronApp.quit();
    }, 3000);
});
process.on("SIGINT", () => {
    console.log("Caught SIGINT, shutting down");
    setUserConfirmedQuit(true);
    electronApp.quit();
});
process.on("SIGHUP", () => {
    console.log("Caught SIGHUP, shutting down");
    setUserConfirmedQuit(true);
    electronApp.quit();
});
process.on("SIGTERM", () => {
    console.log("Caught SIGTERM, shutting down");
    setUserConfirmedQuit(true);
    electronApp.quit();
});
let caughtException = false;
process.on("uncaughtException", (error) => {
    recordDiagnostic("main", error);
    if (caughtException) {
        return;
    }

    // Check if the error is related to QUIC protocol, if so, ignore (can happen with the updater)
    if (error?.message?.includes("net::ERR_QUIC_PROTOCOL_ERROR")) {
        console.log("Ignoring QUIC protocol error:", error.message);
        console.log("Stack Trace:", error.stack);
        return;
    }

    caughtException = true;
    console.log("Uncaught Exception, shutting down: ", error);
    console.log("Stack Trace:", error.stack);
    // Optionally, handle cleanup or exit the app
    setUserConfirmedQuit(true);
    electronApp.quit();
});

let lastWaveWindowCount = 0;
process.on("unhandledRejection", (error) => recordDiagnostic("main", error));
electronApp.on("render-process-gone", (_event, _contents, details) => {
    if (details.reason !== "clean-exit") recordDiagnostic("renderer");
});
electronApp.on("child-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") recordDiagnostic("child-process");
});
globalEvents.on("windows-updated", () => {
    const wwCount = getAllWaveWindows().length;
    if (wwCount == lastWaveWindowCount) {
        return;
    }
    lastWaveWindowCount = wwCount;
    console.log("windows-updated", wwCount);
    makeAndSetAppMenu();
});

const GPU_CRASH_WATCHDOG_WINDOW_MS = 10 * 60 * 1000;
const GPU_CRASH_WATCHDOG_THRESHOLD = 3;

// Chromium already falls back to software compositing after a GPU process crash, so the session
// keeps running. Persisting the opt-out here only makes the *next* launch skip the crash-recovery
// churn on machines whose drivers cannot keep the GPU process alive.
function installGpuCrashWatchdog(launchSettings: SettingsType) {
    if (launchSettings?.["window:disablehardwareacceleration"]) {
        return;
    }
    const crashTimestamps: number[] = [];
    let optOutWritten = false;
    electronApp.on("child-process-gone", (_event, details) => {
        if (details.type !== "GPU" || details.reason !== "crashed") {
            return;
        }
        const now = Date.now();
        crashTimestamps.push(now);
        while (crashTimestamps.length > 0 && now - crashTimestamps[0] > GPU_CRASH_WATCHDOG_WINDOW_MS) {
            crashTimestamps.shift();
        }
        console.log(`gpu process crashed (exitCode=${details.exitCode}), ${crashTimestamps.length} in watchdog window`);
        if (crashTimestamps.length < GPU_CRASH_WATCHDOG_THRESHOLD || optOutWritten) {
            return;
        }
        optOutWritten = true;
        console.log("gpu crashes repeated, persisting window:disablehardwareacceleration for next launch");
        fireAndForget(async () => {
            await RpcApi.SetConfigCommand(ElectronWshClient, { "window:disablehardwareacceleration": true });
        });
    });
}

async function appMain() {
    // Set disableHardwareAcceleration as early as possible, if required.
    const launchSettings = getLaunchSettings();
    if (launchSettings?.["window:disablehardwareacceleration"]) {
        console.log("disabling hardware acceleration, per launch settings");
        electronApp.disableHardwareAcceleration();
    }
    installGpuCrashWatchdog(launchSettings);
    const startTs = Date.now();
    const instanceLock = electronApp.requestSingleInstanceLock();
    if (!instanceLock) {
        console.log("kronterm-app could not get single-instance-lock, shutting down");
        setUserConfirmedQuit(true);
        electronApp.quit();
        return;
    }
    const allowedWebviewPreloads = [path.join(getElectronAppBasePath(), "preload", "preload-webview.cjs")];
    electronApp.on("web-contents-created", (_event, contents) => {
        if (contents.getType() === "webview") watchBrowserSession(contents.session);
        if (process.env.VITE_ENABLE_REACT_GRAB !== "false" && contents.getType() === "webview") {
            contents.on("dom-ready", () => {
                void installBrowserElementTool(contents).catch((error) =>
                    console.warn("Browser element tool could not initialize", error.message)
                );
            });
        }
        contents.on("will-attach-webview", (attachEvent, webPreferences, params) => {
            const decision = applyWebviewAttachPolicy(webPreferences, params, allowedWebviewPreloads);
            if (decision.strippedPreload != null) {
                console.log("webview attach: stripped unapproved preload", decision.strippedPreload);
            }
            if (!decision.allow) {
                console.log("webview attach denied:", decision.reason);
                attachEvent.preventDefault();
            }
        });
    });
    electronApp.on("second-instance", (_event, argv, workingDirectory) => {
        console.log("second-instance event, argv:", argv, "workingDirectory:", workingDirectory);
        if (!startupWorkspaceReleased) {
            focusStartupOnboarding();
            return;
        }
        fireAndForget(async () => {
            if (!activateExistingWorkspace(getAllWaveWindows(), focusedWaveWindow)) await createNewWaveWindow();
        });
    });
    try {
        await mkdir(browserBookmarksDirectory(), { recursive: true }).catch((error) => {
            console.warn("Could not prepare the browser bookmarks directory", error.code);
        });
        await runWaveSrv(handleWSEvent);
    } catch (error) {
        console.error("Local workspace startup failed", error);
        recordDiagnostic("main", error);
        await electronApp.whenReady();
        electron.dialog.showErrorBox(
            "KronOS could not start",
            "The local workspace failed to start. Restart KronOS and reinstall it if the problem persists."
        );
        setForceQuit(true);
        electronApp.quit();
        return;
    }
    console.log("wavesrv ready signal received", Date.now() - startTs, "ms");
    await electronApp.whenReady();

    try {
        ensureKronosSkillDirectory();
    } catch (error) {
        console.warn("Could not initialize the KronOS skills directory", error);
    }

    if (process.platform === "darwin") {
        const micStatus = electron.systemPreferences.getMediaAccessStatus("microphone");
        if (micStatus === "not-determined") {
            electron.systemPreferences.askForMediaAccess("microphone");
        }
    }
    if (process.env.ELECTRON_RENDERER_URL) {
        // Optimized Vite modules can keep the same URL while their generated chunk imports change.
        await electron.session.defaultSession.clearCache().catch((error) => {
            console.warn("Could not clear the development renderer cache", error);
        });
    }
    configureAuthKeyRequestInjection(electron.session.defaultSession);
    await restoreBrowserExtensions();
    initIpcHandlers();
    void ensureKronRender().catch((error) => console.log("KronRender startup:", error.message));

    try {
        initElectronWshClient();
        initElectronWshrpc(ElectronWshClient, { authKey: AuthKey });
        initMenuEventSubscriptions();
    } catch (e) {
        console.log("error initializing wshrpc", e);
    }
    const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
    fireAndForget(async () => {
        try {
            await HermesRuntime.ensure();
        } catch (error) {
            console.log("background agent startup failed", error);
        }
    });
    checkIfRunningUnderARM64Translation(fullConfig);
    if (fullConfig?.settings?.["app:confirmquit"] != null) {
        confirmQuit = fullConfig.settings["app:confirmquit"];
    }
    const startupPreviewRoot = isDev
        ? process.env.KRONOS_STARTUP_PREVIEW_ROOT
        : path.join(process.resourcesPath, "onboarding");
    if (startupPreviewRoot) {
        try {
            const clientData = await services.ClientService.GetClientData();
            if (!clientData.tosagreed) {
                const finished = await runStartupOnboarding(startupPreviewRoot, async (parent) => {
                    await waitForKronosStartupSignIn(parent);
                    await RpcApi.SetMetaCommand(ElectronWshClient, {
                        oref: "client:" + clientData.oid,
                        meta: { "onboarding:lastversion": CurrentOnboardingVersion },
                    });
                    await services.ClientService.AgreeTos();
                });
                if (!finished) {
                    electronApp.quit();
                    return;
                }
            }
        } catch (error) {
            recordDiagnostic("main", error);
            electron.dialog.showErrorBox("KronOS setup could not open", "Check the local onboarding files and restart KronOS.");
            electronApp.quit();
            return;
        }
    }
    if (!startupPreviewRoot && isKronosAccountConfigured()) {
        const clientData = await services.ClientService.GetClientData();
        if (!clientData.tosagreed) await waitForKronosStartupSignIn();
    }
    startupWorkspaceReleased = true;
    ensureHotSpareTab(fullConfig);
    await relaunchBrowserWindows(fullConfig);
    if (process.env.KRONOS_TEST_SIGN_IN === "1") {
        const parent = getAllWaveWindows().find((window) => window.isVisible());
        if (parent) openKronosSignIn(parent);
    }
    setTimeout(runActiveTimer, 5000); // start active timer, wait 5s just to be safe
    setTimeout(sendDisplaysTDataEvent, 5000);

    makeAndSetAppMenu();
    makeDockTaskbar();
    setGlobalIsStarting(false);
    if (fullConfig?.settings?.["window:maxtabcachesize"] != null) {
        setMaxTabCacheSize(fullConfig.settings["window:maxtabcachesize"]);
    }

    electronApp.on("activate", () => {
        if (!activateExistingWorkspace(getAllWaveWindows(), focusedWaveWindow)) {
            fireAndForget(createNewWaveWindow);
        }
    });
    electron.powerMonitor.on("resume", () => {
        console.log("system resumed from sleep, notifying server");
        for (const webContents of electron.webContents.getAllWebContents()) {
            if (!webContents.isDestroyed()) {
                webContents.send("kronoscode-power-resume");
            }
        }
        fireAndForget(async () => {
            try {
                await KronosCodeRuntime.revalidate();
            } catch (error) {
                console.log("KronosCode revalidation after system resume failed", error);
            }
        });
        fireAndForget(async () => {
            try {
                await RpcApi.NotifySystemResumeCommand(ElectronWshClient, { noresponse: true });
            } catch (e) {
                console.log("error calling NotifySystemResumeCommand", e);
            }
        });
    });
    const rawGlobalHotKey = launchSettings?.["app:globalhotkey"];
    if (rawGlobalHotKey) {
        registerGlobalHotkey(rawGlobalHotKey);
    }
    const rawNotchHotKey = launchSettings?.["app:notchhotkey"];
    if (rawNotchHotKey) {
        registerNotchHotkey(rawNotchHotKey);
    }
    void configureAutoUpdater(fullConfig.settings);
}

appMain().catch((e) => {
    console.log("appMain error", e);
    setUserConfirmedQuit(true);
    electronApp.quit();
});
