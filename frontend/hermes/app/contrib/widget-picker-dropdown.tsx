import { useState } from "react";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@hermes/components/ui/dropdown-menu";
import { Tip } from "@hermes/components/ui/tooltip";
import { useHermesShellMode } from "@hermes/lib/kronterm-host";
import { titlebarButtonClass } from "../shell/titlebar";
import { TitlebarIcon } from "../shell/titlebar-icon";
import { AgentCliProviders, makeAgentTerminalMeta } from "./agent-provider-catalog";
import { routeKronTermLauncherAction, WebModeLauncherWidgets } from "./web-pane-launcher";

interface WidgetDef {
    id: string;
    label: string;
    icon: string;
    view: string;
    description?: string;
}

const AVAILABLE_WIDGETS: WidgetDef[] = [
    { id: "terminal", label: "Terminal", icon: "terminal", view: "term", description: "New terminal" },
    { id: "browser", label: "Browser", icon: "globe", view: "web", description: "New browser" },
    { id: "files", label: "Files", icon: "folder", view: "preview", description: "New file explorer" },
    { id: "gittree", label: "Git Tree", icon: "code-branch", view: "preview", description: "Browse repository" },
    { id: "sandbox", label: "Computer", icon: "desktop", view: "sandbox", description: "Live computer viewer" },
    { id: "sysinfo", label: "Sysinfo", icon: "chart-line", view: "sysinfo", description: "System information" },
    { id: "apps", label: "Apps", icon: "shapes", view: "installedapps", description: "Installed applications" },
    {
        id: "warpagent",
        label: "Warp Agent",
        icon: "wand-magic-sparkles",
        view: "warpagent",
        description: "Warp-style agent",
    },
];

export function WidgetPickerDropdown() {
    const [open, setOpen] = useState(false);
    const { webMode } = useHermesShellMode();
    const widgets = webMode ? WebModeLauncherWidgets : AVAILABLE_WIDGETS;

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <Tip label="Add widget">
                <DropdownMenuTrigger asChild>
                    <button
                        className={`${titlebarButtonClass} bg-transparent select-none`}
                        type="button"
                        aria-label="Add widget"
                    >
                        <TitlebarIcon name="add" />
                    </button>
                </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent side="bottom" align="end" sideOffset={4}>
                <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                {widgets.map((w) => (
                    <DropdownMenuItem
                        key={w.id}
                        onSelect={() => {
                            routeKronTermLauncherAction(w.view, webMode);
                            setOpen(false);
                        }}
                    >
                        <TitlebarIcon name={w.icon} />
                        <span>{w.label}</span>
                        {w.description && (
                            <span className="ml-auto text-[0.65rem] text-(--ui-text-tertiary)">{w.description}</span>
                        )}
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <TitlebarIcon name="hubot" />
                        <span>Agent terminal</span>
                        <span className="ml-auto mr-1 text-[0.65rem] text-(--ui-text-tertiary)">
                            {AgentCliProviders.length}
                        </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="min-w-56">
                        <DropdownMenuLabel>Launch installed CLI</DropdownMenuLabel>
                        {AgentCliProviders.map((provider) => (
                            <DropdownMenuItem
                                key={provider.id}
                                onSelect={() => {
                                    window.dispatchEvent(
                                        new CustomEvent("kronterm:create-widget", {
                                            detail: { meta: makeAgentTerminalMeta(provider) },
                                        })
                                    );
                                    setOpen(false);
                                }}
                            >
                                <TitlebarIcon name="terminal" />
                                <span>{provider.label}</span>
                                <span className="ml-auto font-mono text-[0.65rem] text-(--ui-text-tertiary)">
                                    {provider.executable}
                                </span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
