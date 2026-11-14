// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { launchSystemApp, makeViewAppDescriptor } from "@/app/store/app-registry";
import { hermesSurfaceController } from "@/app/view/hermes/hermes-surface-controller";
import { atoms, createBlock, globalStore, refocusNode } from "@/store/global";
import * as WOS from "@/store/wos";
import { openCommandPalette } from "@hermes/store/command-palette";
import { $krontermSidebarOwner, $workspaceCanvasPanels } from "@hermes/lib/kronterm-sidebar";
import { useEffect } from "react";
import { CommandCenterToggleEvent } from "./command-center-events";
import { applyWorkspaceAppearance, readWorkspaceAppearance } from "./workspace-appearance";

const KronarchyEnabledStorageKey = "kronterm:kronarchy-enabled";
const CommandSpaceCompatibilityStorageKey = "kronterm:command-center-command-space-compat";

type StorageLike = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function migrateKronarchyPreference(storage: StorageLike): boolean {
    try {
        const compatibilityValue = storage.getItem(CommandSpaceCompatibilityStorageKey);
        const legacyValue = storage.getItem(KronarchyEnabledStorageKey);
        if (legacyValue != null) {
            storage.removeItem(KronarchyEnabledStorageKey);
            if (compatibilityValue == null && legacyValue === "true") {
                storage.setItem(CommandSpaceCompatibilityStorageKey, "true");
                return true;
            }
        }
        return compatibilityValue === "true";
    } catch {
        return false;
    }
}

function readKronarchyEnabled(): boolean {
    return migrateKronarchyPreference(window.localStorage);
}

function shouldOpenKronarchyLauncher(
    event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "metaKey" | "shiftKey">,
    legacyCommandSpace: boolean
): boolean {
    const isLauncherSpace = event.code === "Space" && !event.altKey && event.metaKey !== event.ctrlKey;
    return isLauncherSpace && (event.shiftKey || (event.metaKey && legacyCommandSpace));
}

export function shouldUseNativeLauncherActivation(target: Pick<HTMLElement, "closest">): boolean {
    return target.closest("button, a[href]") != null;
}

const WorkspacePaletteShortcuts = () => {
    useEffect(() => {
        applyWorkspaceAppearance(readWorkspaceAppearance());
        const legacyCommandSpace = readKronarchyEnabled();
        const onToggle = (event?: Event) => {
            if (event?.defaultPrevented) return;
            if (!$workspaceCanvasPanels.get() || !$krontermSidebarOwner.get()) {
                hermesSurfaceController.requestOpenChat();
            }
            openCommandPalette();
        };
        let openingReview: Promise<void>;
        const onReview = (event: CustomEvent<{ scopeCwd?: string }>) => {
            if (openingReview) return;
            const tabId = globalStore.get(atoms.staticTabId);
            const tab = globalStore.get(WOS.getWaveObjectAtom<Tab>(WOS.makeORef("tab", tabId)));
            const running = (tab?.blockids ?? []).filter((blockId) => {
                const block = globalStore.get(WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", blockId)));
                return block?.meta?.view === "review";
            });
            openingReview = launchSystemApp(makeViewAppDescriptor("review", running), {
                focusBlock: refocusNode,
                createView: async () => {
                    await createBlock({ meta: { view: "review", "review:cwd": event.detail?.scopeCwd } as MetaType });
                },
                createAppStream: async () => {},
            })
                .then(() => {})
                .catch((error) => console.warn("Could not open Review widget", error))
                .finally(() => {
                    openingReview = undefined;
                });
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.defaultPrevented || !shouldOpenKronarchyLauncher(event, legacyCommandSpace)) return;
            event.preventDefault();
            // The Hermes keybind listener also runs on window.
            event.stopImmediatePropagation();
            window.dispatchEvent(new CustomEvent(CommandCenterToggleEvent, { cancelable: true }));
        };
        window.addEventListener("keydown", onKey, true);
        window.addEventListener(CommandCenterToggleEvent, onToggle);
        window.addEventListener("kronterm:open-review", onReview);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener(CommandCenterToggleEvent, onToggle);
            window.removeEventListener("kronterm:open-review", onReview);
        };
    }, []);
    return null;
};

export {
    CommandSpaceCompatibilityStorageKey,
    KronarchyEnabledStorageKey,
    migrateKronarchyPreference,
    readKronarchyEnabled,
    shouldOpenKronarchyLauncher,
    WorkspacePaletteShortcuts,
};
