// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { ScreenSelectorToolbar, type ScreenSelectorAction } from "@/app/lib/screen-selector-toolbar";
import { AgentSurfaceCursor } from "@/app/view/agent-surface-cursor";
import { ComputerSelection, type VmSelectionSnapshot } from "@/app/view/computers/computer-selection-panel";
import { getApi } from "@/store/global";
import RFB from "@novnc/novnc";
import { useEffect, useRef, useState } from "react";
import type { MacVmConnection, MacVmInventory } from "../../../types/macos-vms";
import { macVmCharacterKeysym, registerMacVmTextTarget, sendMacVmKeyChord } from "./macos-vm-input";

export function MacVmScreen({
    blockId,
    targetName,
    appName,
}: {
    blockId: string;
    targetName?: string;
    appName?: string;
}) {
    const [inventory, setInventory] = useState<MacVmInventory>();
    const [name, setName] = useState(targetName ?? "");
    const [connection, setConnection] = useState<MacVmConnection>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [connected, setConnected] = useState(false);
    const [fit, setFit] = useState(true);
    const [selection, setSelection] = useState<
        Extract<VmSelectionSnapshot, { kind: "macos" }> & { action: ScreenSelectorAction }
    >();
    const host = useRef<HTMLDivElement>(null);
    const rfb = useRef<RFB>(null);
    const session = useRef<MacVmConnection>(null);
    const mounted = useRef(false);

    const refresh = async () => {
        if (!getApi().listMacVms) throw new Error("Restart KronOS to enable macOS VM support.");
        const result = await getApi().listMacVms();
        if (!mounted.current) return;
        if (result.success === false) {
            setError(result.error.message);
            return;
        }
        setInventory(result.data);
        setName((current) => current || result.data.machines[0]?.name || "");
    };
    useEffect(() => {
        mounted.current = true;
        void refresh().catch((error) => {
            if (mounted.current) setError(String(error));
        });
        return () => {
            mounted.current = false;
            if (session.current) void getApi().stopMacVm(session.current.sessionId);
        };
    }, []);
    useEffect(() => {
        if (!connection || !host.current) return;
        const client = new RFB(host.current, connection.url, {
            credentials: { password: connection.password },
            shared: false,
        });
        rfb.current = client;
        client.scaleViewport = true;
        client.resizeSession = false;
        client.qualityLevel = 9;
        client.compressionLevel = 1;
        client.addEventListener("connect", () => setConnected(true));
        client.addEventListener("disconnect", () => {
            setConnected(false);
            setSelection(undefined);
            setError("The macOS VM display disconnected. Stop and restart the VM to reconnect.");
        });
        client.addEventListener("securityfailure", () => setError("The macOS VM display could not authenticate."));
        return () => {
            client.disconnect();
            rfb.current = null;
        };
    }, [connection]);
    const selectionActive = connected && selection?.sessionId === connection?.sessionId && selection != null;
    const captureSelection = (action: ScreenSelectorAction) => {
        if (!connected || !connection) {
            setError("Connect to the VM to select a target.");
            return;
        }
        try {
            const imageDataUrl = rfb.current?.toDataURL("image/png");
            if (!imageDataUrl?.startsWith("data:image/png;base64,")) throw new Error("The VM screen is unavailable.");
            setError("");
            setSelection({
                kind: "macos",
                action,
                imageDataUrl,
                blockId,
                capturedAt: Date.now(),
                name: connection.name,
                sessionId: connection.sessionId,
            });
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not capture the VM screen.");
        }
    };
    useEffect(() => {
        if (rfb.current) rfb.current.scaleViewport = fit;
    }, [fit, connection]);
    useEffect(() => {
        if (!connected || !blockId) return;
        return registerMacVmTextTarget(
            blockId,
            async (text, delayMs) => {
                const client = rfb.current;
                if (!client) throw new Error("The macOS VM display is not connected");
                for (const character of text) {
                    if (rfb.current !== client) throw new Error("The macOS VM display disconnected during typing");
                    const keysym = macVmCharacterKeysym(character);
                    client.sendKey(keysym, "", true);
                    client.sendKey(keysym, "", false);
                    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
            },
            (keys) => {
                const client = rfb.current;
                if (!client) throw new Error("The macOS VM display is not connected");
                sendMacVmKeyChord(keys, (keysym, down) => client.sendKey(keysym, "", down));
            }
        );
    }, [connected, blockId]);

    const start = async () => {
        setBusy(true);
        setError("");
        try {
            const result = await getApi().startMacVm(name);
            if (result.success === false) throw new Error(result.error.message);
            if (!mounted.current) {
                await getApi().stopMacVm(result.data.sessionId);
                return;
            }
            session.current = result.data;
            setConnection(result.data);
        } catch (error) {
            if (mounted.current) setError(error instanceof Error ? error.message : String(error));
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    const stop = async () => {
        setBusy(true);
        try {
            const result = await getApi().stopMacVm(session.current.sessionId);
            if (result.success === false) throw new Error(result.error.message);
            session.current = null;
            setConnection(null);
            setConnected(false);
            setError("");
            await refresh();
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            data-macos-vm
            className="relative flex h-full min-h-0 flex-col bg-[var(--kt-content)] text-[var(--kt-label)]"
        >
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--kt-separator)] px-3 py-2 text-xs">
                <span className="mr-auto">
                    macOS VM <span className="opacity-60">Labs</span>
                </span>
                {connection ? (
                    <>
                        <span role="status">{connected ? connection.name : "Connecting display..."}</span>
                        <button
                            className="cursor-pointer rounded px-2 py-1 hover:bg-white/10 focus-visible:outline"
                            onClick={() => setFit(!fit)}
                        >
                            {fit ? "Actual size" : "Fit display"}
                        </button>
                        <button
                            disabled={busy}
                            className="cursor-pointer rounded px-2 py-1 hover:bg-white/10 focus-visible:outline disabled:opacity-50"
                            onClick={() => void stop()}
                        >
                            Stop VM
                        </button>
                    </>
                ) : (
                    <>
                        <select
                            aria-label="macOS guest"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            disabled={busy}
                            className="min-w-0 max-w-48 cursor-pointer rounded bg-[var(--kt-content)] px-2 py-1"
                        >
                            {!inventory?.machines.length && <option value="">No macOS guest</option>}
                            {inventory?.machines.map((machine) => (
                                <option key={machine.name} value={machine.name}>
                                    {machine.name}
                                    {machine.running ? " (running externally)" : ""}
                                </option>
                            ))}
                        </select>
                        <button
                            disabled={busy || !name || !inventory?.available}
                            className="cursor-pointer rounded px-2 py-1 hover:bg-white/10 focus-visible:outline disabled:opacity-50"
                            onClick={() => void start()}
                        >
                            {busy ? "Starting VM..." : "Start VM"}
                        </button>
                        <button
                            disabled={busy}
                            className="cursor-pointer rounded px-2 py-1 hover:bg-white/10 focus-visible:outline disabled:opacity-50"
                            onClick={() => void refresh().catch((error) => setError(String(error)))}
                        >
                            Refresh
                        </button>
                    </>
                )}
            </div>
            {error && (
                <p role="alert" className="px-3 py-2 text-xs">
                    {error}
                </p>
            )}
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div ref={host} className="h-full w-full" inert={selectionActive} />
                {selectionActive && (
                    <ComputerSelection
                        key={selection.action}
                        vm={selection}
                        action={selection.action}
                        onClose={() => setSelection(undefined)}
                    />
                )}
                <ScreenSelectorToolbar
                    title="macOS VM element selector"
                    onSelect={(action) => {
                        if (selectionActive)
                            setSelection(action === selection.action ? undefined : { ...selection, action });
                        else captureSelection(action);
                    }}
                />
                {!connection && (
                    <div className="absolute inset-0 flex items-center justify-center p-6">
                        <div className="max-w-md space-y-3 text-sm">
                            <p>
                                {appName
                                    ? `Run ${appName} inside an isolated macOS desktop.`
                                    : "Run Mac apps on a separate desktop inside KronOS."}
                            </p>
                            {appName && (
                                <p className="text-xs opacity-70">
                                    After starting and unlocking the guest, open {appName} inside it using Spotlight.
                                    The app must be installed in the guest.
                                </p>
                            )}
                            <p className="text-xs opacity-70">
                                {inventory?.problem ||
                                    (inventory
                                        ? "Choose a local macOS guest and start it. Install and sign in to apps inside the guest."
                                        : "Checking macOS VM availability...")}
                            </p>
                            {!inventory?.machines.length && (
                                <p className="text-xs opacity-70">
                                    Install Tart and create a local macOS guest on an Apple-silicon Mac, then refresh.
                                </p>
                            )}
                            <p className="text-xs opacity-60">
                                Host clipboard, host folders, and host audio are not shared. Shut down macOS inside the
                                guest before stopping the VM.
                            </p>
                        </div>
                    </div>
                )}
            </div>
            <AgentSurfaceCursor surface="browser" blockId={blockId} />
        </div>
    );
}
