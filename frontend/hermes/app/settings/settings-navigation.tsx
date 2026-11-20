// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import type { OverlayNavGroup } from "@hermes/app/overlays/overlay-split-layout";
import {
    Brain,
    ChevronRight,
    Cpu,
    CreditCard,
    Globe,
    Keyboard,
    LayoutDashboard,
    Lock,
    Mic,
    Palette,
    Pencil,
    SearchIcon,
    Settings2,
    Upload,
    Users,
} from "@hermes/lib/icons";
import { cn } from "@hermes/lib/utils";
import { useState, type ReactNode } from "react";

const SettingsIcons = {
    "config:appearance": Palette,
    "config:model": Cpu,
    "config:memory": Brain,
    "config:voice": Mic,
    "config:safety": Lock,
    "config:advanced": Settings2,
    "kronterm:user": Users,
    "kronterm:canvas": Pencil,
    "kronterm:browser": Globe,
    "kronterm:privacy": Lock,
    "kronterm:widgets": LayoutDashboard,
    "kronterm:theme": Palette,
    "kronterm:browser-sessions": Globe,
    "kronterm:browser-setup": Upload,
    keybinds: Keyboard,
    billing: CreditCard,
};

const Categories = ["General", "Browser", "Workspace", "Agent", "Integrations", "Account"] as const;
type Category = (typeof Categories)[number];
export function settingsCategory(id: string): Category {
    if (
        [
            "config:appearance",
            "notifications",
            "keybinds",
            "config:chat",
            "quick-entry",
            "companion",
            "kronterm:theme",
        ].includes(id)
    )
        return "General";
    if (["kronterm:browser", "kronterm:browser-sessions", "kronterm:browser-setup", "kronterm:privacy"].includes(id))
        return "Browser";
    if (
        [
            "kronrender",
            "kronflow",
            "computers",
            "workspace",
            "config:workspace",
            "kronterm:widgets",
            "kronterm:canvas",
            "kronterm:visual",
            "kronterm:shortcuts",
            "kronterm:sessions",
            "kronterm:desktop",
        ].includes(id)
    )
        return "Workspace";
    if (
        [
            "integrations",
            "providers",
            "gateway",
            "connections",
            "keys",
            "plugins",
            "skills",
            "kronterm:git",
            "kronterm:github",
        ].includes(id)
    )
        return "Integrations";
    if (["kronterm:user", "billing", "sessions", "about"].includes(id)) return "Account";
    return "Agent";
}
export function filterSettingsNavigation(groups: OverlayNavGroup[], search: string): OverlayNavGroup[] {
    const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = (id: string, label: string) => {
        const aliases =
            id === "computers"
                ? "vm virtual machines sandbox qemu docker container"
                : id === "kronterm:browser"
                  ? "web search tabs links startup privacy"
                  : id === "kronterm:browser-sessions"
                    ? "profiles work personal private cookies storage cache accounts browsing data"
                    : id === "kronterm:browser-setup"
                      ? "import bookmarks extensions passwords safari chrome firefox arc"
                      : id === "kronterm:widgets"
                        ? "layout widgets terminal windows restore tabs"
                        : id === "kronterm:canvas"
                          ? "canvas design snapping grid export"
                          : id === "kronrender"
                            ? "image media generation models workflows"
                            : id === "kronflow"
                              ? "automation workflows credentials executions"
                              : "";
        const text = `${label} ${id} ${settingsCategory(id)} ${aliases}`.toLowerCase();
        return terms.every((term) => text.includes(term));
    };
    return groups.flatMap((group) => {
        if (matches(group.id, group.label)) return [group];
        const children = group.children?.filter((child) => matches(child.id, child.label));
        return children?.length ? [{ ...group, children }] : [];
    });
}
export function SettingsNavigation({ groups, footer }: { groups: OverlayNavGroup[]; footer?: ReactNode }) {
    const [search, setSearch] = useState("");
    const filtered = filterSettingsNavigation(groups, search);
    const selected = groups
        .flatMap((group) => [group, ...(group.children ?? [])])
        .filter((item) => item.active)
        .at(-1);
    return (
        <aside
            data-settings-navigation=""
            className="flex min-h-0 flex-col border-r border-border bg-(--ui-sidebar-surface-background) max-[47.5rem]:border-r-0 max-[47.5rem]:border-b"
        >
            <div className="shrink-0 px-4 pb-3 pt-6 max-[47.5rem]:pt-3">
                <p className="mb-5 text-sm font-semibold tracking-tight max-[47.5rem]:hidden">Settings</p>
                <label className="flex h-9 items-center gap-2 border border-border bg-background/40 px-2.5 focus-within:ring-1 focus-within:ring-ring">
                    <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <input
                        aria-label="Search settings sections"
                        placeholder="Search settings"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="min-w-0 w-full bg-transparent text-xs outline-none"
                    />
                </label>
            </div>
            <nav
                aria-label="Settings sections"
                className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 max-[47.5rem]:hidden"
            >
                {Categories.map((category) => {
                    const entries = filtered.filter((group) => settingsCategory(group.id) === category);
                    if (!entries.length) return null;
                    return (
                        <div className="settings-category mb-4" data-category={category} key={category}>
                            <h2 className="px-3 py-2 text-[11px] font-medium text-muted-foreground">{category}</h2>
                            {entries.map((group) => (
                                <div key={group.id}>
                                    <NavigationItem item={group} />
                                    {(group.active || search.trim()) &&
                                        group.children?.map((child) => (
                                            <NavigationItem key={child.id} item={child} nested />
                                        ))}
                                </div>
                            ))}
                        </div>
                    );
                })}
                {!filtered.length && (
                    <p role="status" className="px-3 py-6 text-xs text-muted-foreground">
                        No matching sections.
                    </p>
                )}
            </nav>
            <div className="hidden px-4 pb-3 max-[47.5rem]:block">
                <select
                    aria-label="Settings section"
                    value={
                        filtered.some(
                            (group) =>
                                group.id === selected?.id || group.children?.some((child) => child.id === selected?.id)
                        )
                            ? selected?.id
                            : ""
                    }
                    onChange={(event) =>
                        filtered
                            .flatMap((group) => [group, ...(group.children ?? [])])
                            .find((item) => item.id === event.target.value)
                            ?.onSelect()
                    }
                    className="h-9 w-full cursor-pointer border border-border bg-background px-2 text-sm"
                >
                    <option value="" disabled>
                        {filtered.length ? "Choose a section" : "No matching sections"}
                    </option>
                    {filtered.map((group) => (
                        <optgroup key={group.id} label={group.label}>
                            {[group, ...(group.children ?? [])].map((item) => (
                                <option value={item.id} key={item.id}>
                                    {item.label}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            </div>
            {footer && (
                <div className="flex shrink-0 items-center gap-1 border-t border-border px-4 py-3 max-[47.5rem]:hidden">
                    {footer}
                </div>
            )}
        </aside>
    );
}
function NavigationItem({ item, nested = false }: { item: OverlayNavGroup; nested?: boolean }) {
    const Icon = SettingsIcons[item.id] ?? item.icon;
    return (
        <button
            type="button"
            aria-current={item.active ? "page" : undefined}
            onClick={item.onSelect}
            className={cn(
                "flex min-h-9 w-full cursor-pointer items-center gap-2.5 px-3 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                nested && "pl-8 text-xs",
                item.active
                    ? "bg-foreground/8 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            )}
        >
            <span className="settings-navigation-icon">
                <Icon className="size-3.5 shrink-0" />
            </span>
            <span className="truncate">{item.label}</span>
            <ChevronRight className="settings-navigation-chevron ml-auto size-3.5 shrink-0" aria-hidden="true" />
        </button>
    );
}
