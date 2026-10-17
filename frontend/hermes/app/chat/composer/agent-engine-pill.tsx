import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";

import { useSessionView } from "@hermes/app/chat/session-view";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@hermes/components/ui/dropdown-menu";
import { Tip } from "@hermes/components/ui/tooltip";
import { cn } from "@hermes/lib/utils";

type EngineId = string;

type EngineInfo = { id: EngineId; label: string; description: string; available: boolean; logo?: string };

const KronosCodeSessionPrefix = "kronoscode:";

function useHostEngines(): {
    active: EngineId;
    engines: EngineInfo[];
    loading: boolean;
    error: boolean;
    refresh: () => void;
} | null {
    const backends = window.hermesDesktop?.agentBackends;
    const [active, setActive] = useState<EngineId>(() => backends?.getActive() ?? "hermes");
    const [engines, setEngines] = useState<EngineInfo[]>([]);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!backends) {
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(false);

        void backends
            .list()
            .then((list) => {
                if (!cancelled) {
                    setEngines(list);
                }
            })
            .catch(() => {
                if (!cancelled) setError(true);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        const off = backends.onActiveChange(setActive);

        return () => {
            cancelled = true;
            off();
        };
    }, [backends, revision]);

    return backends ? { active, engines, loading, error, refresh: () => setRevision((value) => value + 1) } : null;
}

function EngineMark({ engine }: { engine: EngineInfo }) {
    const [failedLogo, setFailedLogo] = useState<string>();
    return engine.logo && failedLogo !== engine.logo ? (
        <img
            src={engine.logo}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="size-5 shrink-0 object-contain"
            onError={() => setFailedLogo(engine.logo)}
        />
    ) : (
        <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded bg-(--chrome-action-hover) text-[11px] font-medium"
        >
            {engine.label.slice(0, 1).toUpperCase()}
        </span>
    );
}

export function AgentEnginePill({ compact = false, disabled }: { compact?: boolean; disabled: boolean }) {
    const hostEngines = useHostEngines();
    const view = useSessionView();
    const runtimeId = useStore(view.$runtimeId);

    if (!hostEngines) {
        return null;
    }

    const sessionEngine: EngineId | null = runtimeId
        ? runtimeId.startsWith(KronosCodeSessionPrefix)
            ? (window.hermesDesktop.agentBackends.getSessionBackend?.(runtimeId) ?? "kronoscode")
            : "hermes"
        : null;

    const shown = sessionEngine ?? hostEngines.active;
    const selectedEngine = hostEngines.engines.find((engine) => engine.id === shown) ?? {
        id: shown,
        label: shown === "hermes" ? "KronTerm Agent" : shown === "kronoscode" ? "KronosCode" : shown,
        description: "ACP agent",
        available: true,
    };
    const label = selectedEngine.label;

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (open) hostEngines.refresh();
            }}
        >
            <Tip label={sessionEngine ? "Agent for this chat · choose the agent for new chats" : "Choose the agent"}>
                <DropdownMenuTrigger asChild>
                    <button
                        aria-label={`Agent: ${label}`}
                        className={cn(
                            "flex cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-(--chrome-action-hover)",
                            compact && "size-(--composer-control-size)"
                        )}
                        disabled={disabled}
                        type="button"
                    >
                        <EngineMark engine={selectedEngine} />
                    </button>
                </DropdownMenuTrigger>
            </Tip>
            <DropdownMenuContent align="center" className="agent-engine-menu max-h-96 w-96 overflow-y-auto">
                <DropdownMenuLabel className="text-[0.6875rem] text-(--ui-text-tertiary)">
                    Agent for new chats
                </DropdownMenuLabel>
                {sessionEngine && (
                    <p className="px-2 pb-2 text-xs text-(--ui-text-tertiary)">This chat stays with {label}.</p>
                )}
                {hostEngines.loading && (
                    <p role="status" className="px-2 py-2 text-xs">
                        Detecting ACP agents...
                    </p>
                )}
                {hostEngines.error && (
                    <p role="alert" className="px-2 py-2 text-xs">
                        Could not detect agents. Reopen to retry.
                    </p>
                )}
                <DropdownMenuRadioGroup
                    onValueChange={(value) => window.hermesDesktop?.agentBackends?.setActive(value)}
                    value={hostEngines.active}
                >
                    {hostEngines.engines.map((engine) => (
                        <DropdownMenuRadioItem disabled={!engine.available} key={engine.id} value={engine.id}>
                            <EngineMark engine={engine} />
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
