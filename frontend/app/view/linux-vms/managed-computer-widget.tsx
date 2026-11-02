// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { getApi } from "@/store/global";
import type { LinuxDesktop, LinuxDesktopAction } from "@/types/linux-desktops";
import { ComputerWidget } from "@hermes/computer/computer-widget";
import { useEffect, useState } from "react";
import { ManagedVncScreen } from "./managed-vnc-screen";

export function ManagedComputerWidget({
    settings = false,
    desktopId = "linux-vm:ubuntu",
}: {
    settings?: boolean;
    desktopId?: string;
}) {
    const [desktop, setDesktop] = useState<LinuxDesktop>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
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
                    setError("");
                }
            } catch (failure) {
                if (!stopped) setError(failure instanceof Error ? failure.message : "VM inventory unavailable.");
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
                    onTakeControl={takeControl}
                    busy={busy}
                    error={error}
                    onLifecycle={() =>
                        void act(desktop.status === "running" ? "stop" : desktop.imagePrepared ? "start" : "prepare")
                    }
                    onUpdate={() => void act("prepare")}
                />
            </div>
        </div>
    );
}
