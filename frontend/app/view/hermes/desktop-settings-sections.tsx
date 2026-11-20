// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0
import { KronOSAccountSettings } from "@/app/components/ui/kronos-account-settings";
import { KronSettingsBrowserContent } from "@/app/view/kronsettings/kronsettings-browser";
import { KronSettingsBrowserSessionsContent } from "@/app/view/kronsettings/kronsettings-browser-sessions";
import { KronSettingsBrowserSetup } from "@/app/view/kronsettings/kronsettings-browser-setup";
import { KronSettingsThemeContent } from "@/app/view/kronsettings/kronsettings-theme";
import { KronSettingsWorkspaceContent } from "@/app/view/kronsettings/kronsettings-workspace";
import "@/app/view/kronsettings/kronsettings.scss";
import { makeKronTermSettingsViewId } from "@hermes/app/settings/kronterm-settings-host";
import { PenCanvasSettings, type PenCanvasSettingsRequest } from "@hermes/app/settings/pen-canvas-settings";
import { SettingsContent } from "@hermes/app/settings/primitives";
import { useSearchParams } from "react-router";

export const DesktopSettingsSections = [
    { id: "user", label: "Profile" },
    { id: "browser", label: "Browser" },
    { id: "browser-sessions", label: "Browser profiles" },
    { id: "browser-setup", label: "Import & passwords" },
    { id: "widgets", label: "Workspace & widgets" },
    { id: "canvas", label: "KronCanvas" },
    { id: "theme", label: "Workspace themes" },
] as const;

export function isDesktopSettingsSection(sectionId: string) {
    return DesktopSettingsSections.some((section) => section.id === sectionId);
}

export function DesktopSettingsSection({
    sectionId,
    canvasRequest,
}: {
    sectionId: string;
    canvasRequest: PenCanvasSettingsRequest;
}) {
    const [params, setParams] = useSearchParams();
    const openBrowserProfiles = () => {
        const next = new URLSearchParams(params);
        next.set("tab", makeKronTermSettingsViewId("browser-sessions"));
        setParams(next);
    };
    if (sectionId === "user") return <KronOSAccountSettings />;
    if (sectionId === "browser") return <KronSettingsBrowserContent onOpenSessions={openBrowserProfiles} />;
    if (sectionId === "browser-sessions") return <KronSettingsBrowserSessionsContent />;
    if (sectionId === "browser-setup")
        return (
            <SettingsContent>
                <KronSettingsBrowserSetup />
            </SettingsContent>
        );
    if (sectionId === "widgets") return <KronSettingsWorkspaceContent />;
    if (sectionId === "canvas") return <PenCanvasSettings request={canvasRequest} />;
    if (sectionId === "theme")
        return (
            <SettingsContent>
                <div className="kron-settings kron-settings--embedded">
                    <KronSettingsThemeContent />
                </div>
            </SettingsContent>
        );
    return null;
}
