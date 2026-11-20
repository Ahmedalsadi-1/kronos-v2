// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import type { LinuxDesktop, LinuxDesktopAction } from "@/types/linux-desktops";
import { ComputerWidget } from "@hermes/computer/computer-widget";
import { useEffect, useState } from "react";
import { ManagedVncScreen } from "./managed-vnc-screen";
import { VmHistoryPanel } from "./vm-history-panel";

export function ManagedComputerWidget({
    settings = false,
    desktopId = "linux-vm:ubuntu",
}: {
    settings?: boolean;
    desktopId?: string;
}) {
    const [desktop, setDesktop] = useState<LinuxDesktop>();
    const [error, setError] = useState("");
    const [pollError, setPollError] = useState("");
    const [busy, setBusy] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                if (desktopId === "external") return;
                const result = await getApi().listLinuxDesktops();
                if (result.success === false) throw new Error(result.error.message);
                if (!stopped) {
                    setDesktop(
                        result.data.find(
                            (item) =>
                                item.id === desktopId ||
                                (desktopId === "linux-desktop:primary" && item.id === "linux-vm:ubuntu")
                        )
                    );
                    setPollError("");
                }
            } catch (failure) {
                if (!stopped) setPollError(failure instanceof Error ? failure.message : "VM inventory unavailable.");
            } finally {
                if (!stopped) timer = setTimeout(poll, 3000);
            }
        };
        void poll();
        return () => {
            stopped = true;
            clearTimeout(timer);
        };
    }, [desktopId]);
    const act = async (action: LinuxDesktopAction["action"]) => {
        if (!desktop || busy) return;
        setBusy(true);
        setError("");
        try {
            const result = await getApi().performLinuxDesktopAction({
                desktopId: desktop.id,
                action,
                expectedGeneration: desktop.controlGeneration,
            });
            if (result.success === false) throw new Error(result.error.message);
            setDesktop(result.data.desktop);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "VM action failed.");
        } finally {
            setBusy(false);
        }
    };
    const takeControl = async () => {
        const result = await getApi().takeOverLinuxDesktop(desktop.id);
        if (result.success === false) {
            setError(result.error.message);
            throw new Error(result.error.message);
        }
        setDesktop(result.data);
    };
    const returnControl = async () => {
        const api = getApi();
        if (desktop.assignedAgentId) {
            const resumed = await api.resumeLinuxDesktop(desktop.id, desktop.controlGeneration);
            if (resumed.success === false) throw new Error(resumed.error.message);
            setDesktop(resumed.data);
            return;
        }
        const access = await api.sandboxComputerAccess();
        await api.sandboxComputerAccess({ enabled: true, desktopId: desktop.id, mode: access.mode || "sandbox" });
        const result = await api.listLinuxDesktops();
        if (result.success === false) throw new Error(result.error.message);
        setDesktop(result.data.find((item) => item.id === desktop.id));
        window.dispatchEvent(new Event("kronterm:computer-wake"));
    };
    if (desktopId === "external") return <ComputerWidget settings={settings} />;
    return (
        <div className="flex h-full min-h-0 flex-col">
            {settings && (
                <p className="shrink-0 px-3 py-2 text-xs">
                    Manage provider plugins and additional computers in Settings → Computers.
                </p>
            )}
            <div className="min-h-0 flex-1">
                <ManagedVncScreen
                    desktop={desktop}
                    onHistory={desktop?.provider === "cua-qemu" ? () => setHistoryOpen(true) : undefined}
                    historyPanel={
                        historyOpen && desktop?.provider === "cua-qemu" ? (
                            <VmHistoryPanel
                                key={desktop.id}
                                desktop={desktop}
                                onUpdate={setDesktop}
                                onClose={() => setHistoryOpen(false)}
                            />
                        ) : undefined
                    }
                    onTakeControl={takeControl}
                    onReturnControl={returnControl}
                    busy={busy}
                    error={error || pollError}
                    onLifecycle={() =>
                        void act(
                            desktop.status === "running"
                                ? "stop"
                                : desktop.imagePrepared
                                  ? "start"
                                  : desktop.provider === "cua-qemu"
                                    ? "create"
                                    : "prepare"
                        )
                    }
                    onUpdate={() => void act("prepare")}
                />
            </div>
        </div>
    );
}
