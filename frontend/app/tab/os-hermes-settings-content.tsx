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
import { PenCanvasSettings } from "@hermes/app/settings/pen-canvas-settings";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { I18nProvider } from "@hermes/i18n";
import { queryClient } from "@hermes/lib/query-client";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { MemoryRouter } from "react-router";
import { requestPenEditor } from "./os-pen-editor-bridge";
import { OSWorkspaceControls } from "./os-system-centers";

function notifySettingsSaved(model?: HermesSettingsSavedDetail) {
    window.dispatchEvent(new CustomEvent(HermesSettingsSavedEvent, { detail: model }));
    void queryClient.invalidateQueries({ queryKey: ["model-options"] });
}

export function HermesSettingsContent({
    tabId,
    onClose,
    initialSection,
}: {
    tabId: string;
    onClose: () => void;
    initialSection?: string;
}) {
    const { ready, error, retry } = useHermesConnection(tabId);
    useEffect(() => installHermesDesktopShim(), []);
    const workspaceSettingsHost = useMemo(() => {
        const request = (method: "get_settings" | "set_settings", params?: Record<string, unknown>) =>
            requestPenEditor(tabId, method, params);
        return {
            sections: [
                { id: "visual", label: "Workspace" },
                { id: "canvas", label: "Canvas" },
            ],
            renderSection: (sectionId: string) =>
                sectionId === "canvas" ? <PenCanvasSettings request={request} /> : <OSWorkspaceControls />,
            renderAppearance: () => <WorkspaceWallpaperSettings />,
        };
    }, [tabId]);

    return (
        <QueryClientProvider client={queryClient}>
            <I18nProvider>
                <ThemeProvider>
                    <RootTooltipProvider>
                        <KronTermSettingsHostProvider value={workspaceSettingsHost}>
                            <MemoryRouter
                                initialEntries={[
                                    initialSection
                                        ? `/settings?tab=kronterm:${encodeURIComponent(initialSection)}`
                                        : "/settings",
                                ]}
                            >
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
