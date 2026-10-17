// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { configureHermesDesktopShim, installHermesDesktopShim } from "@/app/view/hermes/hermes-desktop-shim";
import { getApi } from "@/store/global";
import { ReviewPane } from "@hermes/app/right-sidebar/review";
import { RootErrorBoundary } from "@hermes/components/error-boundary";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { I18nProvider } from "@hermes/i18n";
import { markKronTermWidgetHost } from "@hermes/lib/kronterm-host";
import { queryClient } from "@hermes/lib/query-client";
import { $reviewOpen, $reviewScopeCwd, refreshReview, refreshShipInfo } from "@hermes/store/review";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import type { ReviewViewModel } from "./review-model";

export function ReviewView({ model, contentRef }: ViewComponentProps<ReviewViewModel>) {
    const block = useAtomValue(model.blockAtom);
    const [error, setError] = useState("");
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let active = true;
        markKronTermWidgetHost();
        installHermesDesktopShim();
        const scope = block?.meta?.["review:cwd"];
        $reviewScopeCwd.set(typeof scope === "string" ? scope : null);
        $reviewOpen.set(true);
        const apply = (connection: HermesConnectionDescriptor) => {
            if (!active) return;
            configureHermesDesktopShim({ baseUrl: connection.baseUrl, token: connection.token });
            setReady(true);
            setError("");
            void refreshReview();
            void refreshShipInfo();
        };
        const unsubscribe = getApi().onHermesConnection(apply);
        void getApi()
            .hermesGetConnection({ tabId: model.tabId, blockId: model.blockId })
            .then(apply)
            .catch((reason) => {
                if (active) setError(reason instanceof Error ? reason.message : String(reason));
            });
        const rehome = (event: CustomEvent<{ scopeCwd?: string }>) => {
            $reviewScopeCwd.set(event.detail?.scopeCwd?.trim() || null);
            void refreshReview();
            void refreshShipInfo();
        };
        window.addEventListener("kronterm:open-review", rehome);
        return () => {
            active = false;
            unsubscribe();
            window.removeEventListener("kronterm:open-review", rehome);
            $reviewOpen.set(false);
        };
    }, [model]);

    return (
        <div
            ref={contentRef}
            data-hermes-app=""
            className="h-full w-full min-h-0 overflow-hidden"
            style={{ "--titlebar-height": "0px" } as React.CSSProperties}
        >
            {error ? (
                <div role="alert" className="p-4 text-sm">
                    {error}
                </div>
            ) : !ready ? (
                <div role="status" className="p-4 text-sm">
                    Loading review…
                </div>
            ) : (
                <RootErrorBoundary>
                    <QueryClientProvider client={queryClient}>
                        <I18nProvider>
                            <ThemeProvider>
                                <RootTooltipProvider>
                                    <ReviewPane standalone />
                                </RootTooltipProvider>
                            </ThemeProvider>
                        </I18nProvider>
                    </QueryClientProvider>
                </RootErrorBoundary>
            )}
        </div>
    );
}
