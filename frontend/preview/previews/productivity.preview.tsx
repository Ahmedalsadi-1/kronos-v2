// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0
import { ProductivityView, type ProductivityApi } from "@hermes/app/productivity";
import "@hermes/styles.css";
import { ThemeProvider } from "@hermes/themes/context";
import { useMemo } from "react";
import { emptyProductivityState } from "../../types/productivity";

export function ProductivityPreview() {
    const api = useMemo<ProductivityApi>(() => {
        const now = Date.now();
        const state = emptyProductivityState();
        state.tasks = [
            {
                id: "sample",
                title: "Review the new notch interaction",
                status: "open",
                dueAt: now + 3600000,
                createdAt: now,
                updatedAt: now,
            },
        ];
        state.habits = [
            {
                id: "walk",
                title: "Step away from the screen",
                target: 3,
                progress: {},
                archived: false,
                createdAt: now,
                updatedAt: now,
            },
        ];
        state.notes = [
            {
                id: "idea",
                title: "A calmer workspace",
                body: "Let the workspace stay quiet until something needs attention.",
                deleted: false,
                createdAt: now,
                updatedAt: now,
            },
        ];
        return {
            getProductivityState: async () => state,
            updateProductivity: async () => state,
            onProductivityState: () => () => {},
        };
    }, []);
    return (
        <ThemeProvider>
            <div className="h-screen">
                <ProductivityView api={api} />
            </div>
        </ThemeProvider>
    );
}
