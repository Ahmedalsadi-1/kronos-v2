// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { useSessionView } from "@hermes/app/chat/session-view";
import { Button } from "@hermes/components/ui/button";
import { Codicon } from "@hermes/components/ui/codicon";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@hermes/components/ui/dropdown-menu";
import { Tip } from "@hermes/components/ui/tooltip";
import { $sandboxComputerAccess } from "@hermes/computer/access-store";
import { $connection } from "@hermes/store/session";
import { useStore } from "@nanostores/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { LinuxDesktop } from "../../types/linux-desktops";

export function MachineLauncherButton({ disabled = false }: { disabled?: boolean }) {
    const [desktops, setDesktops] = useState<LinuxDesktop[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const access = useStore($sandboxComputerAccess);
    const sessionView = useSessionView();
    const runtimeId = useStore(sessionView.$runtimeId);
    const storedId = useStore(sessionView.$storedId);
    const navigate = useNavigate();
    const bridge = window.hermesDesktop?.krontermSurfaces;
    const manager = bridge?.computerManager;
    useEffect(() => {
        if (manager)
            void manager
                .access({ sessionIds: [...new Set([runtimeId, storedId].filter(Boolean))] })
                .then((value) => $sandboxComputerAccess.set(value))
                .catch(() => {});
    }, [manager, runtimeId, storedId]);
    if (!manager || !bridge.openMachines) return null;
    const refresh = async () => {
        setError("");
        try {
            setDesktops(await manager.desktops());
            $sandboxComputerAccess.set(await manager.access());
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Computers are unavailable.");
        }
    };
    const useComputer = async (desktop: LinuxDesktop) => {
        setBusy(true);
        setError("");
        try {
            const engine =
                runtimeId?.startsWith("kronoscode:") || runtimeId?.startsWith("openmausbot:")
                    ? "external"
                    : window.hermesDesktop?.agentBackends?.getActive?.() || "hermes";
            if ($connection.get()?.mode === "remote")
                throw new Error("Computer mode requires the local KronTerm Agent connection.");
            if (engine !== "hermes")
                throw new Error(
                    "Choose KronTerm Agent for a new chat to use Computer mode. External ACP engines can retain their own host tools."
                );
            if (desktop.imagePrepared && desktop.status !== "running" && desktop.status !== "unavailable")
                await manager.action({
                    desktopId: desktop.id,
                    action: "start",
                    expectedGeneration: desktop.controlGeneration,
                });
            $sandboxComputerAccess.set(
                await manager.access({
                    enabled: true,
                    desktopId: desktop.id,
                    sessionIds: [...new Set([runtimeId, storedId].filter(Boolean))],
                })
            );
            const result = await bridge.openMachines("desktop", false, desktop.id);
            if (!result.ok) throw new Error(result.error);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Could not open this computer.");
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="relative shrink-0">
            <DropdownMenu
                onOpenChange={(open) => {
                    if (open) void refresh();
                }}
            >
                <Tip label={access.enabled ? "Computer mode · sandbox and widgets" : "Use a sandbox computer"}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Open Computer widget"
                            aria-pressed={access.enabled}
                            disabled={disabled || busy}
                            className={`size-(--composer-control-size,2rem) cursor-pointer rounded-md ${access.enabled ? "bg-accent/15 text-accent" : "text-(--ui-text-tertiary)"}`}
                        >
                            <Codicon name="vm" size="0.95rem" />
                        </Button>
                    </DropdownMenuTrigger>
                </Tip>
                <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Sandbox computer</DropdownMenuLabel>
                    <p className="px-2 pb-2 text-xs text-(--ui-text-tertiary)">
                        Computer mode limits this workspace’s agent to supported widgets and the selected VM’s desktop,
                        terminal, files and browser.
                    </p>
                    {desktops.map((desktop) => (
                        <DropdownMenuItem
                            key={desktop.id}
                            disabled={desktop.status === "unavailable"}
                            onSelect={() => void useComputer(desktop)}
                        >
                            <Codicon name={access.desktopId === desktop.id ? "check" : "vm"} />
                            <span className="min-w-0 flex-1 truncate">{desktop.name}</span>
                            <span className="text-xs opacity-60">{desktop.status}</span>
                        </DropdownMenuItem>
                    ))}
                    {!desktops.length && <p className="px-2 py-2 text-xs">Add or enable a computer in Settings.</p>}
                    {access.enabled && (
                        <DropdownMenuItem
                            onSelect={() => {
                                void manager
                                    .access({ enabled: false })
                                    .then((value) => $sandboxComputerAccess.set(value))
                                    .catch((failure) => setError(String(failure)));
                            }}
                        >
                            Disable Computer mode
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => navigate("/settings?tab=computers")}>
                        Computer plugins and settings…
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            {error && (
                <p
                    role="alert"
                    className="absolute bottom-full right-0 z-50 mb-2 w-80 rounded-lg border border-(--ui-border) bg-(--ui-bg) p-3 text-xs"
                >
                    {error}
                </p>
            )}
        </div>
    );
}
