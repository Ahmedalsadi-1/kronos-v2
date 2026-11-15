// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { requestPenEditor } from "@/app/tab/os-pen-editor-bridge";
import type { PaletteContribution } from "@hermes/app/command-palette/contrib";
import { registry } from "@hermes/contrib/registry";
import type { Contribution } from "@hermes/contrib/types";
import { useEffect, useRef } from "react";

export type PenCanvasCommand = {
    id: string;
    label: string;
    category: string;
    keywords: string[];
    shortcut: string[];
    enabled: boolean;
    unavailableHint?: string;
    checked?: boolean;
    keepOpen: boolean;
};

export function penCommandContributions(
    tabId: string,
    commands: PenCanvasCommand[],
    run: (id: string) => void
): Contribution[] {
    return commands.map((command) => {
        const id = `kronos.canvas.${tabId}.${command.id}`;
        const data: PaletteContribution = {
            id,
            label: command.label,
            keywords: ["canvas", "design", "pen", command.category, ...command.keywords],
            comboHint: command.shortcut.map((key) => key.toLowerCase().replace(/^arrow/, "")).join("+"),
            disabled: !command.enabled,
            active: command.checked,
            detail: () => command.unavailableHint || `Canvas / ${command.category}`,
            keepOpen: command.keepOpen,
            run: () => {
                if (command.enabled) run(command.id);
            },
        };
        return { id, area: "palette", source: "kronos:pen", order: 100, data };
    });
}

export function usePenPaletteCommands({
    tabId,
    visible,
    commands,
    onError,
}: {
    tabId: string;
    visible: boolean;
    commands: PenCanvasCommand[];
    onError: (error: unknown) => void;
}) {
    const failure = useRef(onError);
    failure.current = onError;
    useEffect(() => {
        if (!visible || !commands.length) return;
        return registry.registerMany(
            penCommandContributions(tabId, commands, (id) => {
                void requestPenEditor(tabId, "run_command", { id }).catch((error) => failure.current(error));
            })
        );
    }, [tabId, visible, commands]);
}
