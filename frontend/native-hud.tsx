// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/jotaiStore";
import { useTabModel } from "@/app/store/tab-model";
import { HermesApp } from "@/app/view/hermes/hermes-app";
import { installHermesDesktopShim } from "@/app/view/hermes/hermes-desktop-shim";
import { HermesConnectionState, useHermesConnection } from "@/app/view/hermes/use-hermes-connection";
import { KronSettingsViewModel } from "@/app/view/kronsettings/kronsettings-model";
import { useWaveEnv } from "@/app/waveenv/waveenv";
import { NativeHudFallback } from "@/app/workspace/native-hud-fallback";
import { NativeIslandProviders } from "@/app/workspace/native-island-app";
import { PRIMARY_SESSION_VIEW } from "@hermes/app/chat/session-view";
import { $selectedStoredSessionId } from "@hermes/store/session";
import { useEffect, useMemo, useState } from "react";
import "./tailwindsetup.css";

const api = (window as unknown as { api: ElectronApi }).api;
const params = new URLSearchParams(window.location.search);
const initialTabId = params.get("tabId") ?? undefined;
const nativeNotch = params.get("nativeNotch") === "1";
const rememberedSessionKey = `kronterm.hud.session.${initialTabId ?? "default"}`;
const sessionId = params.has("sessionId") ? params.get("sessionId") : localStorage.getItem(rememberedSessionKey);
if (sessionId) window.location.hash = `#/${encodeURIComponent(sessionId)}`;

function NativeHudContent({ tabId, onReady }: { tabId: string; onReady: () => void }) {
    const waveEnv = useWaveEnv();
    const tabModel = useTabModel();
    const settingsModel = useMemo(
        () =>
            new KronSettingsViewModel({
                blockId: globalStore.get(tabModel.tabAtom)?.blockids?.[0] ?? tabId,
                nodeModel: null,
                tabModel,
                waveEnv,
            }),
        [tabId, tabModel, waveEnv]
    );
    const { ready, error, retry } = useHermesConnection(tabId, true, "kronterm");
    const [companionAvailable, setCompanionAvailable] = useState(false);

    useEffect(() => api.onNativeNotchAvailability(setCompanionAvailable), []);

    useEffect(() => {
        installHermesDesktopShim({ baseUrl: "http://127.0.0.1:9119" });
    }, []);

    useEffect(() => {
        if (!ready && !error) return;
        let paintedFrame = 0;
        const frame = requestAnimationFrame(() => {
            paintedFrame = requestAnimationFrame(onReady);
        });
        return () => {
            cancelAnimationFrame(frame);
            cancelAnimationFrame(paintedFrame);
        };
    }, [ready, error, onReady]);

    useEffect(() => {
        if (sessionId) localStorage.setItem(rememberedSessionKey, sessionId);
        else if (params.has("sessionId")) localStorage.removeItem(rememberedSessionKey);
        return $selectedStoredSessionId.listen((id) => {
            if (id) localStorage.setItem(rememberedSessionKey, id);
        });
    }, []);

    useEffect(() => {
        let runningSession: string;
        return PRIMARY_SESSION_VIEW.$busy.listen((busy) => {
            if (busy) runningSession = $selectedStoredSessionId.get() ?? sessionId ?? "kronterm-hud";
            if (!runningSession) return;
            api.publishAgentSurfaceActivity({
                source: "hermes",
                sessionid: runningSession,
                surface: "panel",
                action: "thinking",
                phase: busy ? "running" : "finish",
                detail: busy ? "KronosCode is responding" : "KronosCode turn finished",
            });
            if (!busy) runningSession = undefined;
        });
    }, []);

    return (
        <main
            data-coucou-hud={nativeNotch ? "" : undefined}
            className={`flex h-screen w-screen flex-col overflow-hidden text-white ${nativeNotch ? "bg-black" : "gap-2 bg-transparent p-2"}`}
        >
            <section className="relative min-h-0 flex-1 overflow-visible">
                {ready ? (
                    <HermesApp hudMode hostMode="hud" kronSettingsModel={settingsModel} />
                ) : (
                    <HermesConnectionState error={error} retry={retry} />
                )}
            </section>
            {(!nativeNotch || !companionAvailable) && <NativeHudFallback sessionId={sessionId} />}
        </main>
    );
}

document.documentElement.dataset.nativeSurface = "hud";
document.title = "KronTerm HUD";
document.body.style.background = "transparent";
document.body.style.margin = "0";
document.body.classList.remove("init");
export function NativeHud({ tabId, onReady }: { tabId: string; onReady: () => void }) {
    return (
        <NativeIslandProviders tabId={tabId}>
            <NativeHudContent tabId={tabId} onReady={onReady} />
        </NativeIslandProviders>
    );
}
