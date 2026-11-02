// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import type {
    ComputerManagerState,
    ComputerProviderId,
    LinuxDesktop,
    LinuxDesktopAction,
} from "../../types/linux-desktops";

export function ComputersSettings() {
    const manager = window.hermesDesktop?.krontermSurfaces?.computerManager;
    const [state, setState] = useState<ComputerManagerState>({ plugins: [], computers: [] });
    const [desktops, setDesktops] = useState<LinuxDesktop[]>([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState("");
    const [name, setName] = useState("");
    const [provider, setProvider] = useState<ComputerProviderId>("cua-qemu");
    const refresh = async () => {
        if (!manager) return;
        const [next, machines] = await Promise.all([manager.list(), manager.desktops()]);
        setState(next);
        setDesktops(machines);
    };
    useEffect(() => {
        let alive = true;
        const poll = async () => {
            try {
                if (alive) await refresh();
            } catch (failure) {
                if (alive) setError(String(failure));
            }
        };
        void poll();
        const timer = setInterval(() => void poll(), 5000);
        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [manager]);
    const run = async (id: string, operation: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(id);
        setError("");
        try {
            await operation();
            await refresh();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            setBusy("");
        }
    };
    const act = (desktop: LinuxDesktop, action: LinuxDesktopAction["action"]) =>
        run(desktop.id, () =>
            manager.action({ desktopId: desktop.id, action, expectedGeneration: desktop.controlGeneration })
        );
    const button =
        "cursor-pointer rounded-md border border-(--ui-stroke-secondary) px-3 py-1.5 text-xs hover:bg-(--chrome-action-hover) disabled:opacity-50";
    if (!manager) return <p className="p-6 text-sm">Computer providers are available in the KronTerm desktop app.</p>;
    return (
        <div className="space-y-6 p-6">
            <div>
                <h2 className="text-base font-semibold">Computers</h2>
                <p className="mt-1 text-sm text-(--ui-text-tertiary)">
                    Prepare, start and view independent sandbox computers. Each computer keeps its own workspace files
                    and browser profile.
                </p>
            </div>
            {error && (
                <p role="alert" className="rounded-md bg-red-500/10 p-3 text-sm text-red-500">
                    {error}
                </p>
            )}
            <section className="space-y-3" aria-label="Computer provider plugins">
                <h3 className="text-sm font-medium">Provider plugins</h3>
                {state.plugins.map((plugin) => (
                    <div
                        key={plugin.id}
                        className="flex items-start gap-3 rounded-lg border border-(--ui-stroke-secondary) p-3"
                    >
                        <div className="flex-1">
                            <p className="text-sm font-medium">{plugin.name}</p>
                            <p className="mt-1 text-xs text-(--ui-text-tertiary)">{plugin.description}</p>
                            {plugin.id === "openmaus-container" && plugin.enabled && (
                                <button
                                    type="button"
                                    className="mt-2 cursor-pointer text-xs underline"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                        void run("runtime", () =>
                                            manager.manage({ action: "start-runtime", provider: plugin.id })
                                        )
                                    }
                                >
                                    Start container service
                                </button>
                            )}
                        </div>
                        <label className="flex cursor-pointer gap-2 text-xs">
                            <input
                                type="checkbox"
                                checked={plugin.enabled}
                                disabled={Boolean(busy)}
                                onChange={(event) =>
                                    void run(plugin.id, () =>
                                        manager.manage({
                                            action: "plugin",
                                            provider: plugin.id,
                                            enabled: event.target.checked,
                                        })
                                    )
                                }
                            />
                            Enabled
                        </label>
                    </div>
                ))}
            </section>
            <button
                type="button"
                className={button}
                onClick={() => void window.hermesDesktop.krontermSurfaces.openMachines("desktop", true, "external")}
            >
                External VNC / noVNC computers…
            </button>
            <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void run("create", async () => {
                        await manager.manage({ action: "create", provider, name });
                        setName("");
                    });
                }}
            >
                <input
                    aria-label="Computer name"
                    placeholder="Computer name"
                    maxLength={80}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="min-w-32 flex-1 rounded-md border border-(--ui-stroke-secondary) bg-transparent px-3 py-2 text-sm"
                />
                <select
                    aria-label="Computer provider"
                    className="cursor-pointer rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg) px-2 text-sm"
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as ComputerProviderId)}
                >
                    {state.plugins
                        .filter((plugin) => plugin.enabled)
                        .map((plugin) => (
                            <option key={plugin.id} value={plugin.id}>
                                {plugin.name}
                            </option>
                        ))}
                </select>
                <button className={button} type="submit" disabled={Boolean(busy)}>
                    Add computer
                </button>
            </form>
            <section className="space-y-3" aria-label="Configured computers">
                {state.computers.map((config) => {
                    const desktop = desktops.find((item) => item.id === config.id);
                    return (
                        <div key={config.id} className="space-y-3 rounded-lg border border-(--ui-stroke-secondary) p-3">
                            <div>
                                <input
                                    aria-label={`Name for ${config.name}`}
                                    defaultValue={config.name}
                                    maxLength={80}
                                    className="w-full rounded bg-transparent text-sm font-medium"
                                    onBlur={(event) => {
                                        const name = event.target.value.trim();
                                        if (name && name !== config.name)
                                            void run(config.id, () =>
                                                manager.manage({ action: "rename", id: config.id, name })
                                            );
                                    }}
                                />
                                <p className="mt-1 text-xs text-(--ui-text-tertiary)">
                                    {desktop?.runtime || "Provider disabled"}
                                </p>
                                <p role="status" className="mt-1 text-xs">
                                    {busy === config.id
                                        ? "Updating computer…"
                                        : desktop?.problem ||
                                          desktop?.status ||
                                          "Enable this provider to manage its computers."}
                                </p>
                            </div>
                            {desktop && (
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        className={button}
                                        disabled={Boolean(busy) || desktop.status === "unavailable"}
                                        onClick={() =>
                                            void act(
                                                desktop,
                                                desktop.status === "running"
                                                    ? "stop"
                                                    : desktop.imagePrepared
                                                      ? "start"
                                                      : "prepare"
                                            )
                                        }
                                    >
                                        {desktop.status === "running"
                                            ? "Stop"
                                            : desktop.imagePrepared
                                              ? "Start"
                                              : "Prepare desktop"}
                                    </button>
                                    <button
                                        className={button}
                                        onClick={() =>
                                            void window.hermesDesktop.krontermSurfaces.openMachines(
                                                "desktop",
                                                false,
                                                desktop.id
                                            )
                                        }
                                    >
                                        View computer
                                    </button>
                                    {desktop.status !== "running" && desktop.imagePrepared && (
                                        <button
                                            className={button}
                                            disabled={Boolean(busy)}
                                            onClick={() => {
                                                if (
                                                    window.confirm(
                                                        `Remove ${config.name}'s VM disk? Its durable container workspace is kept.`
                                                    )
                                                )
                                                    void act(desktop, "remove");
                                            }}
                                        >
                                            Remove VM
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </section>
            <p className="text-xs text-(--ui-text-tertiary)">
                OpenMausBot computers require a running Docker, Podman or Apple Container service. Ubuntu VMs require
                QEMU on Apple Silicon. Preparing a desktop downloads its image; prepared computers start directly from
                KronTerm. Computer mode is limited to KronTerm Agent, whose tools are routed through the sandbox
                boundary.
            </p>
        </div>
    );
}
