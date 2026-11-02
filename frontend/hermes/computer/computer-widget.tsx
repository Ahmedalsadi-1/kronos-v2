// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { createPluginContext } from "@hermes/contrib/plugin";
import { I18nProvider } from "@hermes/i18n";
import "@hermes/styles.css";
import { useEffect, useState } from "react";
import {
    attachComputerViewer,
    ComputerPane,
    configureManagedComputer,
    showComputerSettings,
    wakeComputerViewer,
} from "./upstream/computer-viewer.js";

export const ComputerWakeEvent = "kronterm:computer-wake";

// The engine shares one live surface between the widget and its fullscreen overlay.
let widgetOwner: symbol;

export function ComputerWidget({
    settings = false,
    managedComputer,
}: {
    settings?: boolean;
    managedComputer?: { id: string; name: string; viewerUrl: string };
}) {
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        const owner = Symbol("computer-widget");
        if (widgetOwner) {
            setError("The Computer viewer is already open in another widget.");
            return;
        }
        widgetOwner = owner;
        const disposers: Array<() => void> = [];
        const context = createPluginContext("computer-viewer", (dispose) => disposers.push(dispose));
        attachComputerViewer(context);
        setReady(true);
        const wake = () => wakeComputerViewer();
        window.addEventListener(ComputerWakeEvent, wake);
        return () => {
            window.removeEventListener(ComputerWakeEvent, wake);
            for (const dispose of disposers.reverse()) dispose();
            if (widgetOwner === owner) widgetOwner = undefined;
        };
    }, []);
    useEffect(() => {
        if (ready && settings) showComputerSettings();
    }, [ready, settings]);
    useEffect(() => {
        if (ready && managedComputer?.viewerUrl) {
            configureManagedComputer(managedComputer.id, managedComputer.name, managedComputer.viewerUrl);
        }
    }, [ready, managedComputer?.id, managedComputer?.name, managedComputer?.viewerUrl]);
    return (
        <I18nProvider>
            <RootTooltipProvider>
                <div
                    data-hermes-app=""
                    className="flex h-full min-h-0 flex-col bg-[var(--kt-content)] text-[var(--kt-label)]"
                >
                    {error && (
                        <p role="alert" className="px-3 py-2 text-xs">
                            {error}
                        </p>
                    )}
                    {ready && <ComputerPane />}
                </div>
            </RootTooltipProvider>
        </I18nProvider>
    );
}
