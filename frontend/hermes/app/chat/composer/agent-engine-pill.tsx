import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";

import { useSessionView } from "@hermes/app/chat/session-view";
import { Button } from "@hermes/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@hermes/components/ui/dropdown-menu";
import { Tip } from "@hermes/components/ui/tooltip";
import { ChevronDown } from "@hermes/lib/icons";
import { cn } from "@hermes/lib/utils";

type EngineId = "hermes" | "kronoscode";

type EngineInfo = { id: EngineId; label: string; description: string; available: boolean };

const PILL = cn(
    "h-(--composer-control-size) max-w-36 shrink-0 gap-1 rounded-md px-2 text-xs font-normal",
    "text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground"
);

const KronosCodeSessionPrefix = "kronoscode:";

function useHostEngines(): { active: EngineId; engines: EngineInfo[] } | null {
    const backends = window.hermesDesktop?.agentBackends;
    const [active, setActive] = useState<EngineId>(() => backends?.getActive() ?? "hermes");
    const [engines, setEngines] = useState<EngineInfo[]>([]);

    useEffect(() => {
        if (!backends) {
            return;
        }

        let cancelled = false;

        void backends
            .list()
            .then((list) => {
                if (!cancelled) {
                    setEngines(list);
                }
            })
            .catch(() => undefined);

        const off = backends.onActiveChange(setActive);

        return () => {
            cancelled = true;
            off();
        };
    }, [backends]);

    return backends ? { active, engines } : null;
}

/**
 * Chooses which agent engine answers the next new chat: Hermes (KronTerm's
 * system agent) or KronosCode (the coding engine over ACP). An existing chat
 * keeps the engine it started with, so the pill shows that engine while it's open.
 */
export function AgentEnginePill({ disabled }: { disabled: boolean }) {
    const hostEngines = useHostEngines();
    const view = useSessionView();
    const runtimeId = useStore(view.$runtimeId);

    if (!hostEngines) {
        return null;
    }

    const sessionEngine: EngineId | null = runtimeId
        ? runtimeId.startsWith(KronosCodeSessionPrefix)
            ? "kronoscode"
            : "hermes"
        : null;

    const shown = sessionEngine ?? hostEngines.active;
    const label = shown === "kronoscode" ? "KronosCode" : "KronTerm Agent";

    return (
        <DropdownMenu>
            <Tip label={sessionEngine ? "Agent for this chat · choose the agent for new chats" : "Choose the agent"}>
                <DropdownMenuTrigger asChild>
                    <Button
                        aria-label={`Agent: ${label}`}
                        className={PILL}
                        disabled={disabled}
                        type="button"
                        variant="ghost"
                    >
                        <span className="truncate">{label}</span>
                        <ChevronDown className="size-3 shrink-0" />
                    </Button>
                </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-[0.6875rem] text-(--ui-text-tertiary)">
                    Agent for new chats
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    onValueChange={(value) => window.hermesDesktop?.agentBackends?.setActive(value as EngineId)}
                    value={hostEngines.active}
                >
                    {hostEngines.engines.map((engine) => (
                        <DropdownMenuRadioItem disabled={!engine.available} key={engine.id} value={engine.id}>
                            <span className="flex min-w-0 flex-col">
                                <span className="text-xs text-foreground">{engine.label}</span>
                                <span className="truncate text-[0.6875rem] text-(--ui-text-tertiary)">
                                    {engine.available ? engine.description : "Not installed"}
                                </span>
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
