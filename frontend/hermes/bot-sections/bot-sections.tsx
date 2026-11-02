// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@hermes/components/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@hermes/components/ui/dialog";
import type { PluginContext } from "@hermes/contrib/plugin";
import type { HermesReadFileTextResult } from "@hermes/global";
import { $gateway } from "@hermes/store/gateway";
import { $activeGatewayProfile } from "@hermes/store/profile";
import { useStore } from "@nanostores/react";
import { useEffect, useState, type ReactNode } from "react";
import { $botSections, parseAssignments, saveSections, sectionRoster, UnassignedSection } from "./model";

const SectionEmojis = ["📁", "🏢", "🏠", "💻", "🔬", "🎨", "📊", "🛠️", "🚀", "🧠", "📝", "🌎", "💬", "🎯", "⚡", "🌱"];
type Bot = { name: string };
type Props = {
    bots: Bot[];
    allBots: Bot[];
    meta: Record<string, { group?: string }>;
    saveMeta: (name: string, patch: { group: string }) => unknown;
    renderBot: (bot: Bot) => ReactNode;
    renderGroupAction?: (name: string, bots: Bot[]) => ReactNode;
    context?: PluginContext;
    onRenameSection?: (previous: string, next: string) => void;
};

export function BotSections({
    bots,
    allBots,
    meta,
    saveMeta,
    renderBot,
    renderGroupAction,
    context,
    onRenameSection,
}: Props) {
    const state = useStore($botSections);
    const profile = useStore($activeGatewayProfile);
    const [editing, setEditing] = useState<{ original?: string; name: string }>();
    const [editError, setEditError] = useState("");
    const sections = sectionRoster(bots, meta, state);
    const allSections = sectionRoster(allBots, meta, state);
    useEffect(() => {
        if (!context) return;
        const stops = allBots.map((bot) =>
            context.register({
                id: `section-cycle:${bot.name}`,
                area: "palette",
                data: {
                    id: `bot-sections.cycle.${bot.name}`,
                    label: `Bot Sections: cycle ${bot.name}`,
                    keywords: ["move", "group", "section", bot.name],
                    run: () => {
                        const names = allSections.map((section) => section.name);
                        const current = meta[bot.name]?.group || UnassignedSection;
                        const next = names[(names.indexOf(current) + 1) % names.length];
                        saveMeta(bot.name, { group: next === UnassignedSection ? null : next });
                    },
                },
            })
        );
        return () => stops.forEach((stop) => stop());
    }, [allBots, meta, state.names, context]);
    useEffect(() => {
        let disposed = false;
        let busy = false;
        const poll = async () => {
            if (busy || !window.hermesDesktop?.api) return;
            busy = true;
            try {
                const gateway = $gateway.get();
                if (!gateway) return;
                const result = await gateway.request<{ home?: string }>("config.get", { key: "profile" });
                if (disposed || !result.home) return;
                const home = result.home.replace(/[\\/]profiles[\\/][^\\/]+[\\/]?$/, "");
                const file = await window.hermesDesktop.api<HermesReadFileTextResult>({
                    path: `/api/fs/read-text?path=${encodeURIComponent(`${home}/bot-sections.json`)}`,
                    profile,
                });
                if (disposed || file.truncated || file.binary || file.text === $botSections.get().assignmentsText)
                    return;
                const parsed = parseAssignments(file.text);
                const latest = $botSections.get();
                saveSections({ ...latest, names: [...latest.names, ...parsed.sections], assignmentsText: file.text });
                for (const bot of allBots) {
                    const section = parsed.assign[bot.name.toLowerCase()];
                    if (section) saveMeta(bot.name, { group: section === UnassignedSection ? null : section });
                }
            } catch {
                // Missing or malformed assignments leave the user's current organization intact.
            } finally {
                busy = false;
            }
        };
        void poll();
        const timer = setInterval(() => void poll(), 5000);
        return () => {
            disposed = true;
            clearInterval(timer);
        };
    }, [profile, allBots, saveMeta]);
    const beginEdit = (original?: string) => {
        setEditError("");
        setEditing({ original, name: original ?? "" });
    };
    const remove = (name: string) => {
        for (const bot of Object.keys(meta)) if (meta[bot]?.group === name) saveMeta(bot, { group: null });
        saveSections({
            ...state,
            names: allSections.map((section) => section.name).filter((item) => item !== name),
            collapsed: state.collapsed.filter((item) => item !== name),
        });
    };
    return (
        <>
            <button
                className="cursor-pointer px-2 py-1 text-left text-xs text-(--ui-text-tertiary) hover:text-foreground"
                onClick={() => beginEdit()}
            >
                + New section
            </button>
            {sections.map((section) => {
                const collapsed = state.collapsed.includes(section.name);
                return (
                    <section key={section.name} aria-label={section.name}>
                        <ContextMenu>
                            <ContextMenuTrigger asChild>
                                <div className="mt-2 flex min-w-0 items-center gap-1">
                                    <button
                                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1 py-1 text-left text-xs text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover)"
                                        aria-expanded={!collapsed}
                                        onClick={() =>
                                            saveSections({
                                                ...state,
                                                collapsed: collapsed
                                                    ? state.collapsed.filter((name) => name !== section.name)
                                                    : [...state.collapsed, section.name],
                                            })
                                        }
                                    >
                                        <span aria-hidden="true">{collapsed ? "▸" : "▾"}</span>
                                        <span className="truncate">{section.name}</span>
                                        <span className="ml-auto">{section.bots.length}</span>
                                    </button>
                                    {section.name !== UnassignedSection &&
                                        renderGroupAction?.(section.name, section.bots)}
                                </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                                <ContextMenuItem onSelect={() => beginEdit()}>New section</ContextMenuItem>
                                {section.name !== UnassignedSection && (
                                    <ContextMenuItem onSelect={() => beginEdit(section.name)}>
                                        Rename section
                                    </ContextMenuItem>
                                )}
                                {section.name !== UnassignedSection && (
                                    <ContextMenuItem onSelect={() => remove(section.name)}>
                                        Delete section
                                    </ContextMenuItem>
                                )}
                            </ContextMenuContent>
                        </ContextMenu>
                        {!collapsed && section.bots.map((bot) => <div key={bot.name}>{renderBot(bot)}</div>)}
                    </section>
                );
            })}
            <Dialog
                open={Boolean(editing)}
                onOpenChange={(open) => {
                    if (!open) setEditing(undefined);
                }}
            >
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>{editing?.original ? "Rename section" : "New section"}</DialogTitle>
                    </DialogHeader>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            const name = editing.name.trim();
                            if (
                                !name ||
                                name === UnassignedSection ||
                                allSections.some((section) => section.name === name && name !== editing.original)
                            ) {
                                setEditError("Choose a unique section name.");
                                return;
                            }
                            if (editing.original) {
                                onRenameSection?.(editing.original, name);
                                for (const bot of Object.keys(meta))
                                    if (meta[bot]?.group === editing.original) saveMeta(bot, { group: name });
                            }
                            saveSections({
                                ...state,
                                names: [
                                    ...allSections.map((section) =>
                                        section.name === editing.original ? name : section.name
                                    ),
                                    name,
                                ],
                                collapsed: state.collapsed.map((item) => (item === editing.original ? name : item)),
                            });
                            setEditing(undefined);
                        }}
                    >
                        <input
                            autoFocus
                            aria-label="Section name"
                            className="w-full rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-2 text-sm"
                            value={editing?.name ?? ""}
                            onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                        />
                        <div className="my-2 flex flex-wrap gap-1" aria-label="Section emojis">
                            {SectionEmojis.map((emoji) => (
                                <button
                                    key={emoji}
                                    type="button"
                                    aria-label={`Use ${emoji}`}
                                    className="cursor-pointer rounded p-1 hover:bg-(--chrome-action-hover)"
                                    onClick={() => setEditing({ ...editing, name: `${emoji} ${editing.name}` })}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                        {editError && (
                            <p role="alert" className="mb-2 text-xs">
                                {editError}
                            </p>
                        )}
                        <button
                            className="cursor-pointer rounded bg-accent/80 px-3 py-1 text-sm text-primary hover:bg-accent"
                            type="submit"
                        >
                            Save
                        </button>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
