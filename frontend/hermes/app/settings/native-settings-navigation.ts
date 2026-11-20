// Copyright 2026, KronOS.
// SPDX-License-Identifier: Apache-2.0
import type { OverlayNavGroup } from "@hermes/app/overlays/overlay-split-layout";
import {
    Archive,
    GitBranch,
    Globe,
    Keyboard,
    LayoutDashboard,
    Mic,
    Monitor,
    Palette,
    Pencil,
    Upload,
    Users,
} from "@hermes/lib/icons";
import { makeKronTermSettingsViewId, type KronTermSettingsSectionDescriptor } from "./kronterm-settings-host";
import type { SettingsView } from "./types";

const NativeSections = {
    user: { label: "Profile", icon: Users },
    browser: { label: "Browser", icon: Globe },
    "browser-sessions": { label: "Browser profiles", icon: Archive },
    "browser-setup": { label: "Import & passwords", icon: Upload },
    widgets: { label: "Workspace & widgets", icon: LayoutDashboard },
    canvas: { label: "KronCanvas", icon: Pencil },
    theme: { label: "Workspace themes", icon: Palette },
    visual: { label: "Desktop controls", icon: Monitor },
    shortcuts: { label: "Desktop shortcuts", icon: Keyboard },
    sessions: { label: "Terminal sessions", icon: Archive },
    git: { label: "Git", icon: GitBranch },
    github: { label: "GitHub", icon: GitBranch },
    voice: { label: "Desktop voice", icon: Mic },
    desktop: { label: "Desktop permissions", icon: Monitor },
};

export function makeNativeSettingsNavigation(
    sections: readonly KronTermSettingsSectionDescriptor[],
    activeView: SettingsView,
    onSelect: (view: SettingsView) => void
): OverlayNavGroup[] {
    return (sections ?? []).flatMap((section) => {
        const descriptor = NativeSections[section.id];
        if (!descriptor) return [];
        const id = makeKronTermSettingsViewId(section.id);
        return [{ ...descriptor, id, active: activeView === id, onSelect: () => onSelect(id) }];
    });
}
