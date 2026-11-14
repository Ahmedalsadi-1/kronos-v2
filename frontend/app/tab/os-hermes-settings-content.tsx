// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { installHermesDesktopShim } from "@/app/view/hermes/hermes-desktop-shim";
import { HermesConnectionState, useHermesConnection } from "@/app/view/hermes/use-hermes-connection";
import { WorkspaceWallpaperSettings } from "@/app/workspace/workspace-wallpaper";
import { SettingsView } from "@hermes/app/settings";
import {
    HermesSettingsSavedEvent,
    KronTermSettingsHostProvider,
    type HermesSettingsSavedDetail,
} from "@hermes/app/settings/kronterm-settings-host";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { I18nProvider } from "@hermes/i18n";
import { queryClient } from "@hermes/lib/query-client";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { MemoryRouter } from "react-router";
import { OSWorkspaceControls } from "./os-system-centers";

const WorkspaceSettingsHost = {
    sections: [{ id: "visual", label: "Workspace" }],
    renderSection: () => <OSWorkspaceControls />,
    renderAppearance: () => <WorkspaceWallpaperSettings />,
};

function notifySettingsSaved(model?: HermesSettingsSavedDetail) {
    window.dispatchEvent(new CustomEvent(HermesSettingsSavedEvent, { detail: model }));
    void queryClient.invalidateQueries({ queryKey: ["model-options"] });
}

export function HermesSettingsContent({ tabId, onClose }: { tabId: string; onClose: () => void }) {
    const { ready, error, retry } = useHermesConnection(tabId);
    useEffect(() => installHermesDesktopShim(), []);

    return (
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <ThemeProvider>
                    <RootTooltipProvider>
                        <KronTermSettingsHostProvider value={WorkspaceSettingsHost}>
                            <MemoryRouter initialEntries={["/settings"]}>
                                <SettingsView
                                    connectionStatus={!ready && <HermesConnectionState error={error} retry={retry} />}
                                    embedded
                                    onClose={onClose}
                                    onConfigSaved={notifySettingsSaved}
                                    onMainModelChanged={(provider, model) => notifySettingsSaved({ provider, model })}
                                />
                            </MemoryRouter>
                        </KronTermSettingsHostProvider>
                    </RootTooltipProvider>
                </ThemeProvider>
            </I18nProvider>
        </QueryClientProvider>
    );
}
