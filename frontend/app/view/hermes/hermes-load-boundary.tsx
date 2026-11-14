// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { ErrorBoundary } from "@/app/components/ui/ErrorBoundary";
import type { ReactNode } from "react";

export function HermesLoadBoundary({ children }: { children: ReactNode }) {
    return (
        <ErrorBoundary
            fallback={
                <div role="alert" className="flex h-full min-h-0 flex-col items-start justify-center gap-3 p-4 text-sm">
                    <p>KronOS Agent could not load. Your workspace is still available.</p>
                    <button
                        type="button"
                        className="cursor-pointer rounded bg-accent/80 px-3 py-2 text-primary transition-colors hover:bg-accent"
                        onClick={() => window.location.reload()}
                    >
                        Reload workspace
                    </button>
                </div>
            }
        >
            {children}
        </ErrorBoundary>
    );
}
