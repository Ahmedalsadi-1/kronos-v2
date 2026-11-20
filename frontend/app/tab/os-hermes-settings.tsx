// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, useSystemAppearance } from "@/app/components/system-ui";
import { X } from "@/app/components/system-ui/os-icons";
import { HermesLoadBoundary } from "@/app/view/hermes/hermes-load-boundary";
import { systemMaterialVariables } from "@/types/system-materials";
import {
    DesktopModalPortalContainerContext,
    DialogPortalContainerContext,
} from "@hermes/components/ui/dialog-portal-context";
import * as Dialog from "@radix-ui/react-dialog";
import { lazy, Suspense, useState } from "react";

import "./os-hermes-settings-theme.css";

const HermesSettingsContent = lazy(async () => ({
    default: (await import("./os-hermes-settings-content")).HermesSettingsContent,
}));

export function OSHermesSettings({
    tabId,
    onClose,
    initialSection,
}: {
    tabId: string;
    onClose: () => void;
    initialSection?: string;
}) {
    const appearance = useSystemAppearance();
    const [portalContainer, setPortalContainer] = useState<HTMLDivElement>(null);

    return (
        <Dialog.Portal>
            <Dialog.Overlay
                className="os-hermes-settings-backdrop"
                data-reduced-transparency={appearance.reducedTransparency || undefined}
            />
            <Dialog.Content
                ref={setPortalContainer}
                className="kt-system-ui os-hermes-settings-dialog"
                data-os-hermes-settings=""
                data-color-scheme={appearance.colorScheme}
                data-contrast={appearance.contrast}
                data-reduced-motion={appearance.reducedMotion || undefined}
                data-reduced-transparency={appearance.reducedTransparency || undefined}
                aria-describedby={undefined}
                style={systemMaterialVariables(appearance)}
            >
                <header className="os-hermes-settings-titlebar">
                    <Dialog.Title>Hermes Settings</Dialog.Title>
                    <Dialog.Close asChild>
                        <SystemButton type="button" size="small" aria-label="Close Hermes Settings">
                            <X aria-hidden="true" />
                        </SystemButton>
                    </Dialog.Close>
                </header>
                <div className="os-hermes-settings-body">
                    <DesktopModalPortalContainerContext.Provider value={portalContainer}>
                        <DialogPortalContainerContext.Provider value={portalContainer}>
                            <HermesLoadBoundary>
                                <Suspense
                                    fallback={
                                        <div role="status" className="m-auto">
                                            Loading Hermes Settings…
                                        </div>
                                    }
                                >
                                    <HermesSettingsContent
                                        tabId={tabId}
                                        onClose={onClose}
                                        initialSection={initialSection}
                                    />
                                </Suspense>
                            </HermesLoadBoundary>
                        </DialogPortalContainerContext.Provider>
                    </DesktopModalPortalContainerContext.Provider>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    );
}
