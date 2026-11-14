import { PRIMARY_SESSION_VIEW } from "@hermes/app/chat/session-view";
import { hudSections } from "@hermes/app/hud/sections";
import { useKronTermSettingsHost } from "@hermes/app/settings/kronterm-settings-host";
import { $pluginRecords } from "@hermes/contrib/plugins-store";
import { $speechMotion } from "@hermes/lib/speech-motion";
import { $agentPlugins, $agentPluginsStatus, loadAgentPlugins, type GatewayRequest } from "@hermes/store/agent-plugins";
import { $selectedStoredSessionId } from "@hermes/store/session";
import { $voiceHud } from "@hermes/store/voice-hud";
import { $voicePlayback } from "@hermes/store/voice-playback";
import { useTheme } from "@hermes/themes/context";
import { coucouAppearance, coucouPalette } from "@hermes/themes/coucou-palettes";
import { useEffect } from "react";
import { productivitySummary } from "../../../../types/productivity";

export function useNativeNotch(request: GatewayRequest, gatewayState: string, navigate: (route: string) => void) {
    const host = useKronTermSettingsHost();
    const { themeName, setTheme, setMode } = useTheme();
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("nativeSurface") !== "hud") return;
        const api = (window as unknown as { api: ElectronApi }).api;
        if (!api?.getProductivityState || !api?.onProductivityState) return;
        let alive = true;
        let receivedLiveState = false;
        const dispose = api.onProductivityState((state) => {
            receivedLiveState = true;
            if (alive) api.syncNativeNotch({ productivity: productivitySummary(state) });
        });
        void api
            .getProductivityState()
            .then((state) => {
                if (alive && !receivedLiveState) api.syncNativeNotch({ productivity: productivitySummary(state) });
            })
            .catch(() => {});
        return () => {
            alive = false;
            dispose();
        };
    }, []);
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("nativeSurface") !== "hud") return;
        const api = (window as unknown as { api: ElectronApi }).api;
        const publishAppearance = (appearance = api.getSystemAppearance()) =>
            api.syncNativeNotch({
                appearance: coucouAppearance(
                    themeName,
                    host?.appearance?.reducedMotion === true || appearance.reducedMotion,
                    appearance
                ),
            });
        publishAppearance();
        const disposeAppearance = api.onSystemAppearanceChange(publishAppearance);
        return disposeAppearance;
    }, [host?.appearance?.reducedMotion, themeName]);

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get("nativeSurface") !== "hud") return;
        const api = (window as unknown as { api: ElectronApi }).api;
        const publish = () => {
            const settings = hudSections(host?.sections);
            const plugins = $agentPlugins.get().map((plugin) => ({
                id: `agent:${plugin.key ?? plugin.name}`,
                name: plugin.name,
                detail: `${plugin.status} · ${plugin.description}`,
                kind: "plugin",
                route: `/settings?tab=plugins&plugin=${encodeURIComponent(plugin.key ?? plugin.name)}`,
            }));
            const desktop = Object.values($pluginRecords.get()).map((plugin) => ({
                id: `desktop:${plugin.id}`,
                name: plugin.name,
                detail: `${plugin.status} · ${plugin.description ?? "Desktop plugin"}`,
                kind: "plugin",
                route: `/settings?tab=plugins&desktopPlugin=${encodeURIComponent(plugin.id)}`,
            }));
            const inventory = {
                id: "plugins",
                name: "Plugins",
                kind: "plugin",
                route: "/settings?tab=plugins",
                detail:
                    $agentPluginsStatus.get() === "error"
                        ? "Agent plugins unavailable; open settings to retry"
                        : `${plugins.length} agent · ${desktop.length} desktop plugins`,
            };
            api.syncNativeNotch({
                categories: [inventory, ...settings, ...plugins, ...desktop],
            });
        };
        const disposers = [
            $agentPlugins.subscribe(publish),
            $pluginRecords.subscribe(publish),
            $agentPluginsStatus.subscribe(publish),
        ];
        const refresh = () => {
            if (gatewayState === "open") void loadAgentPlugins(request);
        };
        refresh();
        const timer = window.setInterval(refresh, 15_000);
        const unsubscribe = api.onNativeNotchNavigate((route) => {
            const palette = coucouPalette(new URL(route, "https://kronterm.local").searchParams.get("coucouTheme"));
            if (palette) {
                setTheme(palette.name);
                setMode("dark");
                return;
            }
            if (route === "/") {
                const sessionId = $selectedStoredSessionId.get();
                navigate(sessionId ? `/${encodeURIComponent(sessionId)}` : "/");
                return;
            }
            if (
                /^\/(settings|skills|command-center|messaging|webhooks|artifacts|cron|workflows|productivity|profiles|agents|starmap)(\?|$)/.test(
                    route
                )
            )
                navigate(route);
        });
        const publishCaption = () => {
            const message = [...PRIMARY_SESSION_VIEW.$messages.get()]
                .reverse()
                .find((row) => row.role === "assistant" && !row.hidden);
            const caption =
                message?.parts
                    .filter((part) => part.type === "text")
                    .map((part) => (part.type === "text" ? part.text : ""))
                    .join(" ")
                    .slice(-360) ?? "";
            api.syncNativeNotch({ caption });
        };
        const disposeCaption = PRIMARY_SESSION_VIEW.$messages.subscribe(publishCaption);
        const captionTimer = window.setInterval(publishCaption, 750);
        const publishVoice = () => {
            const voice = $voiceHud.get();
            const playback = $voicePlayback.get();
            const speaking = playback.status === "speaking" || (voice.active && voice.status === "speaking");
            const motion = $speechMotion.get();
            api.syncNativeNotch({
                voice: {
                    ...voice,
                    active: voice.active || speaking,
                    status: speaking ? "speaking" : voice.status,
                    speechLevel: motion.available ? motion.level : 0,
                    speechAvailable: motion.available,
                },
            });
        };
        const disposeVoice = $voiceHud.subscribe(publishVoice);
        const disposePlayback = $voicePlayback.subscribe(publishVoice);
        const disposeMotion = $speechMotion.subscribe(publishVoice);
        const disposeControl = api.onNativeHudVoiceControl((action) => {
            if (action === "expand") return;
            window.dispatchEvent(new CustomEvent("kronterm:voice-control", { detail: { action } }));
        });
        return () => {
            disposers.forEach((dispose) => dispose());
            clearInterval(timer);
            unsubscribe();
            disposeVoice();
            disposePlayback();
            disposeMotion();
            disposeCaption();
            clearInterval(captionTimer);
            disposeControl();
        };
    }, [request, gatewayState, navigate, host, setTheme, setMode]);
}
