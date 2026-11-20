import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { CompanionSettingsPage, QuickEntrySettingsPage } from "./desktop-feature-settings";
import { IntegrationsSettings } from "./integrations-settings";
import { makeNativeSettingsNavigation } from "./native-settings-navigation";
import { SettingsNavigation } from "./settings-navigation";
import { WorkspaceToolSettings } from "./workspace-tool-settings";
import { WorkspaceTools } from "./workspace-tools";

import { codiconIcon } from "@hermes/components/ui/codicon";
import { Tip } from "@hermes/components/ui/tooltip";
import { getHermesConfigDefaults, getHermesConfigRecord, saveHermesConfig } from "@hermes/hermes";
import { useI18n } from "@hermes/i18n";
import { triggerHaptic } from "@hermes/lib/haptics";
import {
    Archive,
    BarChart3,
    Bell,
    Download,
    Globe,
    Info,
    Keyboard,
    KeyRound,
    Monitor,
    Network,
    Package,
    PawPrint,
    RefreshCw,
    Settings2,
    Upload,
    Wrench,
    Zap,
} from "@hermes/lib/icons";
import { notifyError } from "@hermes/store/notifications";

import { useRouteEnumParam } from "../hooks/use-route-enum-param";
import { OverlayIconButton } from "../overlays/overlay-chrome";
import { OverlayMain, type OverlayNavGroup, OverlaySplitLayout } from "../overlays/overlay-split-layout";
import { OverlayView } from "../overlays/overlay-view";
import { SKILLS_ROUTE } from "../routes";

import { ComputersSettings } from "@hermes/computer/computers-settings";
import { SkillsView } from "../skills";
import { AboutSettings } from "./about-settings";
import { AppearanceSettings } from "./appearance-settings";
import { BillingSettings } from "./billing";
import { ConfigSettings } from "./config-settings";
import { ConnectionsSettings } from "./connections-settings";
import { SECTIONS } from "./constants";
import { DelegationSettings } from "./delegation-settings";
import { GatewaySettings } from "./gateway-settings";
import { KeybindSettings } from "./keybind-settings";
import { KEYS_VIEWS, KeysSettings, type KeysView } from "./keys-settings";
import {
    getKronTermSettingsSectionId,
    makeKronTermSettingsViewId,
    useKronTermSettingsHost,
} from "./kronterm-settings-host";
import { NotificationsSettings } from "./notifications-settings";
import { PluginsSettings } from "./plugins-settings";
import { PROVIDER_VIEWS, ProvidersSettings, type ProviderView } from "./providers-settings";
import { SessionsSettings } from "./sessions-settings";
import "./settings-ios.css";
import type { SettingsPageProps, SettingsView as SettingsViewId } from "./types";
import { BASE_SETTINGS_VIEWS } from "./views";

export function SettingsView({
    connectionStatus,
    embedded,
    onClose,
    onConfigSaved,
    onMainModelChanged,
}: SettingsPageProps) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { hash, pathname, search } = useLocation();
    const kronTermSettingsHost = useKronTermSettingsHost();
    const settingsViews = useMemo(
        () => [
            ...BASE_SETTINGS_VIEWS,
            ...(kronTermSettingsHost?.sections.map((section) => makeKronTermSettingsViewId(section.id)) ?? []),
        ],
        [kronTermSettingsHost]
    );

    // MCP moved out of Settings into Capabilities (/skills?tab=mcp). Keep old
    // `/settings?tab=mcp` deep links working — `useRouteEnumParam` would silently
    // coerce the unknown tab to the default view otherwise. Preserve `server=` so
    // an old bookmark still lands on (and highlights) the selected server.
    useEffect(() => {
        const params = new URLSearchParams(search);

        if (params.get("tab") === "mcp") {
            const server = params.get("server");
            const suffix = server ? `&server=${encodeURIComponent(server)}` : "";
            navigate(`${SKILLS_ROUTE}?tab=mcp${suffix}`, { replace: true });
        }
    }, [navigate, search]);

    const [activeView, setActiveView] = useRouteEnumParam("tab", settingsViews, "config:model" as SettingsViewId);
    // Providers subnav (Accounts vs API keys) lives in its own param so each
    // sub-view is deep-linkable and survives a refresh.
    const [providerView, setProviderView] = useRouteEnumParam<ProviderView>("pview", PROVIDER_VIEWS, "accounts");
    const [keysView] = useRouteEnumParam<KeysView>("kview", KEYS_VIEWS, "tools");

    // Jump to a section + its sub-view in one navigate. Two sequential setters
    // would each read the same stale `search` and the second would clobber the
    // first's `tab` — so the sub-view never opened on narrow screens.
    const openSubView = useCallback(
        (tab: SettingsViewId, param: string, value: string, fallback: string) => {
            const params = new URLSearchParams(search);
            params.set("tab", tab);

            if (value === fallback) {
                params.delete(param);
            } else {
                params.set(param, value);
            }

            const qs = params.toString();
            navigate({ hash, pathname, search: qs ? `?${qs}` : "" }, { replace: true });
        },
        [hash, navigate, pathname, search]
    );

    const openProviderView = useCallback(
        (view: ProviderView) => openSubView("providers", "pview", view, "accounts"),
        [openSubView]
    );

    const openKeysView = useCallback((view: KeysView) => openSubView("keys", "kview", view, "tools"), [openSubView]);

    const importInputRef = useRef<HTMLInputElement | null>(null);

    const exportConfig = async () => {
        try {
            const cfg = await getHermesConfigRecord();
            const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "hermes-config.json";
            a.click();
            URL.revokeObjectURL(url);
            triggerHaptic("success");
        } catch (err) {
            notifyError(err, t.settings.exportFailed);
        }
    };

    const resetConfig = async () => {
        if (!window.confirm(t.settings.resetConfirm)) {
            return;
        }

        try {
            await saveHermesConfig(await getHermesConfigDefaults());
            triggerHaptic("success");
            onConfigSaved?.();
        } catch (err) {
            notifyError(err, t.settings.resetFailed);
        }
    };

    const navGroups: OverlayNavGroup[] = useMemo(
        () => [
            ...makeNativeSettingsNavigation(kronTermSettingsHost?.sections, activeView, setActiveView),
            {
                id: "integrations",
                label: "Integrations",
                icon: Network,
                active: activeView === "integrations",
                onSelect: () => setActiveView("integrations"),
            },
            {
                id: "quick-entry",
                label: "Quick entry",
                icon: Zap,
                active: activeView === "quick-entry",
                onSelect: () => setActiveView("quick-entry"),
            },
            {
                id: "companion",
                label: "Desktop companion",
                icon: PawPrint,
                active: activeView === "companion",
                onSelect: () => setActiveView("companion"),
            },
            ...WorkspaceTools.map((tool) => ({
                active: activeView === tool.id,
                icon: tool.icon,
                id: tool.id,
                label: tool.label,
                onSelect: () => setActiveView(tool.id),
            })),
            ...SECTIONS.map((s) => {
                const view = `config:${s.id}` as SettingsViewId;

                return {
                    active: activeView === view,
                    icon: s.icon,
                    id: view,
                    label: s.id === "voice" ? "KronVoice" : (t.settings.sections[s.id] ?? s.label),
                    onSelect: () => setActiveView(view),
                };
            }),
            {
                active: activeView === "notifications",
                icon: Bell,
                id: "notifications",
                label: t.settings.nav.notifications,
                onSelect: () => setActiveView("notifications"),
            },
            {
                active: activeView === "billing",
                icon: BarChart3,
                id: "billing",
                label: t.settings.nav.billing,
                onSelect: () => setActiveView("billing"),
            },
            {
                active: activeView === "providers",
                children: [
                    {
                        active: activeView === "providers" && providerView === "accounts",
                        icon: codiconIcon("account"),
                        id: "pview:accounts",
                        label: t.settings.nav.providerAccounts,
                        onSelect: () => openProviderView("accounts"),
                    },
                    {
                        active: activeView === "providers" && providerView === "keys",
                        icon: KeyRound,
                        id: "pview:keys",
                        label: t.settings.nav.providerApiKeys,
                        onSelect: () => openProviderView("keys"),
                    },
                    {
                        active: activeView === "providers" && providerView === "custom-endpoints",
                        icon: Globe,
                        id: "pview:custom-endpoints",
                        label: t.settings.nav.providerCustomEndpoints,
                        onSelect: () => openProviderView("custom-endpoints"),
                    },
                ],
                gapBefore: true,
                icon: Zap,
                id: "providers",
                label: t.settings.nav.providers,
                onSelect: () => setActiveView("providers"),
            },
            {
                active: activeView === "gateway",
                icon: Globe,
                id: "gateway",
                label: t.settings.nav.gateway,
                onSelect: () => setActiveView("gateway"),
            },
            {
                active: activeView === "connections",
                icon: Network,
                id: "connections",
                label: t.settings.nav.connections,
                onSelect: () => setActiveView("connections"),
            },
            {
                active: activeView === "keybinds",
                icon: Keyboard,
                id: "keybinds",
                label: t.settings.nav.keybinds,
                onSelect: () => setActiveView("keybinds"),
            },
            {
                active: activeView === "keys",
                children: [
                    {
                        active: activeView === "keys" && keysView === "tools",
                        icon: Wrench,
                        id: "kview:tools",
                        label: t.settings.nav.keysTools,
                        onSelect: () => openKeysView("tools"),
                    },
                    {
                        active: activeView === "keys" && keysView === "settings",
                        icon: Settings2,
                        id: "kview:settings",
                        label: t.settings.nav.keysSettings,
                        onSelect: () => openKeysView("settings"),
                    },
                ],
                icon: KeyRound,
                id: "keys",
                label: t.settings.nav.apiKeys,
                onSelect: () => setActiveView("keys"),
            },
            {
                active: activeView === "delegation",
                icon: Network,
                id: "delegation",
                label: "Delegation",
                onSelect: () => setActiveView("delegation"),
            },
            {
                active: activeView === "computers",
                icon: Monitor,
                id: "computers",
                label: "Virtual machines",
                onSelect: () => setActiveView("computers"),
            },
            {
                active: activeView === "plugins",
                icon: Package,
                id: "plugins",
                label: t.settings.nav.plugins,
                onSelect: () => setActiveView("plugins"),
            },
            {
                active: activeView === "skills",
                icon: Zap,
                id: "skills",
                label: "Skills installer",
                onSelect: () => setActiveView("skills"),
            },
            {
                active: activeView === "sessions",
                icon: Archive,
                id: "sessions",
                label: t.settings.nav.archivedChats,
                onSelect: () => setActiveView("sessions"),
            },
            {
                active: activeView === "about",
                gapBefore: true,
                icon: Info,
                id: "about",
                label: t.settings.nav.about,
                onSelect: () => setActiveView("about"),
            },
        ],
        [activeView, keysView, providerView, t, setActiveView, openProviderView, openKeysView, kronTermSettingsHost]
    );

    const navFooter = (
        <>
            <Tip label={t.settings.exportConfig}>
                <OverlayIconButton aria-label={t.settings.exportConfig} onClick={() => void exportConfig()}>
                    <Download />
                </OverlayIconButton>
            </Tip>
            <Tip label={t.settings.importConfig}>
                <OverlayIconButton
                    aria-label={t.settings.importConfig}
                    onClick={() => {
                        triggerHaptic("open");
                        importInputRef.current?.click();
                    }}
                >
                    <Upload />
                </OverlayIconButton>
            </Tip>
            <Tip label={t.settings.resetToDefaults}>
                <OverlayIconButton
                    aria-label={t.settings.resetToDefaults}
                    className="hover:text-destructive"
                    onClick={() => {
                        triggerHaptic("warning");
                        void resetConfig();
                    }}
                >
                    <RefreshCw />
                </OverlayIconButton>
            </Tip>
        </>
    );

    const content = (
        <OverlaySplitLayout className="kron-settings-ios grid-cols-[16rem_minmax(0,1fr)] bg-background max-[47.5rem]:grid-cols-1">
            <SettingsNavigation footer={connectionStatus ? undefined : navFooter} groups={navGroups} />

            <OverlayMain className="px-0 pb-0">
                <header
                    data-settings-page-header=""
                    className="mb-6 shrink-0 border-b border-border px-8 pb-6 pt-4 max-[47.5rem]:px-5"
                >
                    <p className="mb-2 text-[11px] font-medium text-muted-foreground">KronOS / Settings</p>
                    <h1 className="text-xl font-medium tracking-tight">
                        {navGroups.find((group) => group.active)?.children?.find((child) => child.active)?.label ??
                            navGroups.find((group) => group.active)?.label}
                    </h1>
                </header>
                {getKronTermSettingsSectionId(activeView) != null && kronTermSettingsHost ? (
                    kronTermSettingsHost.renderSection(getKronTermSettingsSectionId(activeView)!)
                ) : activeView === "kronrender" || activeView === "kronflow" ? (
                    <WorkspaceToolSettings key={activeView} toolId={activeView} />
                ) : activeView === "integrations" ? (
                    <IntegrationsSettings destinations={navGroups} />
                ) : activeView === "quick-entry" ? (
                    <QuickEntrySettingsPage />
                ) : connectionStatus ? (
                    connectionStatus
                ) : activeView === "companion" ? (
                    <CompanionSettingsPage />
                ) : activeView === "config:appearance" ? (
                    <AppearanceSettings />
                ) : activeView === "about" ? (
                    <AboutSettings />
                ) : activeView === "gateway" ? (
                    <GatewaySettings />
                ) : activeView === "connections" ? (
                    <ConnectionsSettings />
                ) : activeView === "keybinds" ? (
                    <KeybindSettings />
                ) : activeView.startsWith("config:") ? (
                    <ConfigSettings
                        activeSectionId={activeView.slice("config:".length)}
                        importInputRef={importInputRef}
                        onConfigSaved={onConfigSaved}
                        onMainModelChanged={onMainModelChanged}
                    />
                ) : activeView === "providers" ? (
                    <ProvidersSettings
                        onClose={onClose}
                        onConfigSaved={onConfigSaved}
                        onMainModelChanged={onMainModelChanged}
                        onViewChange={setProviderView}
                        view={providerView}
                    />
                ) : activeView === "keys" ? (
                    <KeysSettings view={keysView} />
                ) : activeView === "notifications" ? (
                    <NotificationsSettings />
                ) : activeView === "billing" ? (
                    <BillingSettings />
                ) : activeView === "delegation" ? (
                    <DelegationSettings />
                ) : activeView === "computers" ? (
                    <ComputersSettings />
                ) : activeView === "skills" ? (
                    <SkillsView embedded />
                ) : activeView === "plugins" ? (
                    <PluginsSettings />
                ) : (
                    <SessionsSettings />
                )}
            </OverlayMain>
        </OverlaySplitLayout>
    );

    return embedded ? (
        content
    ) : (
        <OverlayView compact closeLabel={t.settings.closeSettings} onClose={onClose}>
            {content}
        </OverlayView>
    );
}

export { SettingsView as SettingsPage };
