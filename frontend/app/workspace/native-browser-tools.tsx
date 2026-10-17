// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { SystemButton, SystemToolbar } from "@/app/components/system-ui";
import type { WebViewModel } from "@/app/view/webview/webview";
import { getBlockComponentModel } from "@/store/global";
import { useAtomValue } from "jotai";
import { MessageSquare, MousePointer2, Paintbrush, X } from "lucide-react";
import { useEffect, useState } from "react";

export function NativeBrowserTools({ blockId }: { blockId: string }) {
    const [model, setModel] = useState<WebViewModel>();
    useEffect(() => {
        const lookup = () => {
            const next = getBlockComponentModel(blockId)?.viewModel as WebViewModel;
            if (next?.viewType === "web") setModel(next);
        };
        lookup();
        const timer = window.setInterval(lookup, 250);
        return () => clearInterval(timer);
    }, [blockId]);
    return model ? <BrowserTools model={model} /> : null;
}

function BrowserTools({ model }: { model: WebViewModel }) {
    const intent = useAtomValue(model.grabController.intent);
    useEffect(() => {
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && intent) model.setGrabIntent(null);
        };
        window.addEventListener("keydown", escape);
        return () => window.removeEventListener("keydown", escape);
    }, [model, intent]);
    return (
        <SystemToolbar
            aria-label="Browser element tools"
            className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-lg border border-border p-1"
        >
            {(
                [
                    { value: "grab", label: "Select element", Icon: MousePointer2 },
                    { value: "annotate", label: "Comment", Icon: MessageSquare },
                    { value: "style", label: "Style", Icon: Paintbrush },
                ] as const
            ).map(({ value, label, Icon }) => (
                <SystemButton
                    key={value}
                    type="button"
                    aria-pressed={intent === value}
                    onClick={() => model.setGrabIntent(intent === value ? null : value)}
                    size="small"
                    selected={intent === value}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                >
                    <Icon size={14} />
                    <span>{label}</span>
                </SystemButton>
            ))}
            {intent && (
                <SystemButton
                    aria-label="Cancel element selection"
                    title="Cancel selection (Escape)"
                    className="cursor-pointer"
                    size="small"
                    onClick={() => model.setGrabIntent(null)}
                >
                    <X size={14} />
                </SystemButton>
            )}
        </SystemToolbar>
    );
}
