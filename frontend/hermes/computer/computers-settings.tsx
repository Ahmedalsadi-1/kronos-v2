// Copyright 2026, KronTerm.
// SPDX-License-Identifier: Apache-2.0
import { ListRow, SettingsContent, SettingsSection, ToggleRow } from "@hermes/app/settings/primitives";
import { Button } from "@hermes/components/ui/button";
import { Input } from "@hermes/components/ui/input";
import { Monitor, Network, Settings2 } from "@hermes/lib/icons";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
    ComputerManagerState,
    ComputerProviderId,
    LinuxDesktop,
    LinuxDesktopAction,
} from "../../types/linux-desktops";

export function ComputersSettings() {
    const surfaces = window.hermesDesktop?.krontermSurfaces;
    const manager = surfaces?.computerManager;
    const [state, setState] = useState<ComputerManagerState>({ plugins: [], computers: [] });
    const [desktops, setDesktops] = useState<LinuxDesktop[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState("");
    const busyRef = useRef(false);
    const mounted = useRef(false);
    const [name, setName] = useState("");
    const [provider, setProvider] = useState<ComputerProviderId>("cua-qemu");
    const enabledProviders = state.plugins.filter((plugin) => plugin.enabled);
    const selectedProvider = enabledProviders.find((plugin) => plugin.id === provider)?.id ?? enabledProviders[0]?.id;
    const refresh = useCallback(async () => {
        if (!manager) return;
        const [next, machines] = await Promise.all([manager.list(), manager.desktops()]);
        if (!mounted.current) return;
        setState(next);
        setDesktops(machines);
    }, [manager]);
    useEffect(() => {
        mounted.current = true;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                if (!busyRef.current) await refresh();
            } catch (failure) {
                if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    timer = setTimeout(poll, 5000);
                }
            }
        };
        void poll();
        return () => {
            cancelled = true;
            mounted.current = false;
            clearTimeout(timer);
        };
    }, [refresh]);
    const run = async (id: string, operation: () => Promise<unknown>, success = "Changes saved.") => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(id);
        setError("");
        setNotice("");
        try {
            await operation();
            await refresh();
            if (mounted.current) setNotice(success);
        } catch (failure) {
            if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
        } finally {
            busyRef.current = false;
            if (mounted.current) setBusy("");
        }
    };
    const act = (desktop: LinuxDesktop, action: LinuxDesktopAction["action"]) =>
        run(
            desktop.id,
            () => manager.action({ desktopId: desktop.id, action, expectedGeneration: desktop.controlGeneration }),
            "Computer updated."
        );
    const open = (settings: boolean, id: string) =>
        run(
            `open:${id}`,
            async () => {
                if (!surfaces.openMachines) throw new Error("Computer viewer is unavailable in this host.");
                const result = await surfaces.openMachines("desktop", settings, id);
                if (!result.ok) throw new Error(result.error || "Could not open the computer.");
            },
            ""
        );
    if (!manager)
        return (
            <SettingsContent>
                <p className="text-sm text-muted-foreground">
                    Virtual machines are available in the KronOS desktop app.
                </p>
            </SettingsContent>
        );
    return (
        <SettingsContent>
            <p className="mb-6 max-w-xl text-sm leading-6 text-muted-foreground">
                Manage isolated computers for your work and your agents. Each computer has its own workspace files and
                browser profile.
            </p>
            <div className="mb-7 flex flex-wrap items-center gap-3 border-y border-border py-3 text-xs text-muted-foreground">
                <span>{state.computers.length} configured</span>
                <span aria-hidden="true">·</span>
                <span>{desktops.filter((desktop) => desktop.status === "running").length} running</span>
                <Button
                    className="ml-auto cursor-pointer"
                    size="sm"
                    variant="ghost"
                    disabled={Boolean(busy) || loading}
                    onClick={() => void run("refresh", refresh, "Status refreshed.")}
                >
                    Refresh
                </Button>
            </div>
            {loading && (
                <p role="status" className="mb-4 text-sm text-muted-foreground">
                    Loading computers...
                </p>
            )}
            {error && (
                <p
                    role="alert"
                    className="mb-5 border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                    {error}
                </p>
            )}
            <p role="status" className="mb-4 text-xs text-muted-foreground">
                {busy ? "Updating..." : notice}
            </p>
            <SettingsSection title="Your computers" icon={Monitor} meta={String(state.computers.length)}>
                {!loading && !state.computers.length && (
                    <div className="border border-dashed border-border p-6">
                        <h3 className="text-sm font-medium">Your first computer starts here</h3>
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            Enable a provider below, then add a computer. Preparing it downloads the desktop image.
                        </p>
                    </div>
                )}
                <div className="space-y-4">
                    {state.computers.map((config) => {
                        const desktop = desktops.find((item) => item.id === config.id);
                        return (
                            <section key={config.id} aria-label={config.name} className="border border-border p-4">
                                <div className="flex flex-wrap items-start gap-3">
                                    <div className="min-w-0 flex-1">
                                        <h3 className="break-words text-sm font-medium">{config.name}</h3>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {state.plugins.find((plugin) => plugin.id === config.provider)?.name ??
                                                config.provider}
                                        </p>
                                    </div>
                                    <span className="border border-border px-2 py-1 text-[11px]">
                                        {desktop?.status ?? "Provider disabled"}
                                    </span>
                                </div>
                                {desktop?.problem && <p className="mt-3 text-xs text-destructive">{desktop.problem}</p>}
                                {desktop && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        <Button
                                            className="cursor-pointer"
                                            size="sm"
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
                                            {busy === desktop.id
                                                ? "Working..."
                                                : desktop.status === "running"
                                                  ? "Stop computer"
                                                  : desktop.imagePrepared
                                                    ? "Start computer"
                                                    : "Prepare computer"}
                                        </Button>
                                        <Button
                                            className="cursor-pointer"
                                            size="sm"
                                            variant="outline"
                                            disabled={Boolean(busy) || !desktop.ready}
                                            onClick={() => void open(false, desktop.id)}
                                        >
                                            Open desktop
                                        </Button>
                                    </div>
                                )}
                                <details className="mt-4 border-t border-border pt-3">
                                    <summary className="cursor-pointer text-xs text-muted-foreground focus-visible:outline focus-visible:outline-ring">
                                        Configuration and storage
                                    </summary>
                                    <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-xs">
                                        <dt className="text-muted-foreground">Runtime</dt>
                                        <dd className="break-words">{desktop?.runtime || "Provider disabled"}</dd>
                                        <dt className="text-muted-foreground">Desktop image</dt>
                                        <dd>{desktop?.imagePrepared ? "Prepared" : "Not prepared"}</dd>
                                        <dt className="text-muted-foreground">Controlled by</dt>
                                        <dd>
                                            {desktop?.controlOwner === "agent"
                                                ? `Agent${desktop.assignedAgentId ? ` · ${desktop.assignedAgentId}` : ""}`
                                                : desktop
                                                  ? "You"
                                                  : "Unavailable"}
                                        </dd>
                                        <dt className="text-muted-foreground">Workspace</dt>
                                        <dd className="break-all font-mono text-[11px]">
                                            {desktop?.workspacePath || "Available after provider is enabled"}
                                        </dd>
                                    </dl>
                                    <ComputerName
                                        key={`${config.id}:${config.name}`}
                                        name={config.name}
                                        disabled={Boolean(busy)}
                                        save={(name) =>
                                            run(config.id, () =>
                                                manager.manage({ action: "rename", id: config.id, name })
                                            )
                                        }
                                    />
                                    {desktop && desktop.status === "stopped" && desktop.imagePrepared && (
                                        <div className="mt-5 border-t border-border pt-4">
                                            <p className="mb-3 text-xs text-muted-foreground">
                                                Remove the prepared desktop image and VM disk. This cannot be undone.
                                            </p>
                                            <Button
                                                className="cursor-pointer text-destructive"
                                                size="sm"
                                                variant="outline"
                                                disabled={Boolean(busy)}
                                                onClick={() => {
                                                    if (
                                                        window.confirm(
                                                            `Remove the prepared image and VM disk for ${config.name}? This cannot be undone.`
                                                        )
                                                    )
                                                        void act(desktop, "remove");
                                                }}
                                            >
                                                Remove VM disk
                                            </Button>
                                        </div>
                                    )}
                                </details>
                            </section>
                        );
                    })}
                </div>
            </SettingsSection>
            <SettingsSection title="Add a computer" icon={Monitor}>
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!selectedProvider || !name.trim()) return;
                        void run(
                            "create",
                            async () => {
                                await manager.manage({
                                    action: "create",
                                    provider: selectedProvider,
                                    name: name.trim(),
                                });
                                setName("");
                            },
                            "Computer added. Prepare it when you are ready."
                        );
                    }}
                >
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-2 text-xs">
                            Name
                            <Input
                                className="border-border bg-background/40"
                                aria-label="Computer name"
                                placeholder="e.g. Design workspace"
                                maxLength={80}
                                required
                                value={name}
                                disabled={Boolean(busy)}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </label>
                        <label className="space-y-2 text-xs">
                            Provider
                            <select
                                aria-label="Computer provider"
                                className="h-9 w-full cursor-pointer border border-border bg-background px-3 text-sm"
                                value={selectedProvider ?? ""}
                                disabled={Boolean(busy) || !enabledProviders.length}
                                onChange={(event) => setProvider(event.target.value as ComputerProviderId)}
                            >
                                {!enabledProviders.length && <option value="">Enable a provider below</option>}
                                {enabledProviders.map((plugin) => (
                                    <option key={plugin.id} value={plugin.id}>
                                        {plugin.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <Button
                        className="mt-4 cursor-pointer"
                        size="sm"
                        type="submit"
                        disabled={Boolean(busy) || loading || !selectedProvider || !name.trim()}
                    >
                        Add computer
                    </Button>
                </form>
            </SettingsSection>
            <SettingsSection title="Providers" icon={Settings2}>
                {state.plugins.map((plugin) => (
                    <div key={plugin.id} className="border-b border-border last:border-0">
                        <ToggleRow
                            label={plugin.name}
                            description={plugin.description}
                            checked={plugin.enabled}
                            disabled={Boolean(busy)}
                            onChange={(enabled) =>
                                void run(plugin.id, () =>
                                    manager.manage({ action: "plugin", provider: plugin.id, enabled })
                                )
                            }
                        />
                        {plugin.id === "openmaus-container" && plugin.enabled && (
                            <Button
                                className="mb-4 cursor-pointer"
                                size="sm"
                                variant="outline"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                    void run(
                                        "runtime",
                                        () => manager.manage({ action: "start-runtime", provider: plugin.id }),
                                        "Container service started."
                                    )
                                }
                            >
                                Start container service
                            </Button>
                        )}
                    </div>
                ))}
            </SettingsSection>
            <SettingsSection title="Remote computers" icon={Network}>
                <ListRow
                    title="Connect an external desktop"
                    description="Manage VNC and noVNC connections to computers you already run."
                    action={
                        <Button
                            className="cursor-pointer"
                            size="sm"
                            variant="outline"
                            disabled={Boolean(busy)}
                            onClick={() => void open(true, "external")}
                        >
                            Manage connections
                        </Button>
                    }
                />
            </SettingsSection>
            <p className="text-xs leading-5 text-muted-foreground">
                Container computers need a running Docker, Podman, or Apple Container service. Ubuntu VMs require QEMU
                on Apple Silicon. Agent computer control runs through the KronOS sandbox boundary.
            </p>
        </SettingsContent>
    );
}
function ComputerName({
    name,
    disabled,
    save,
}: {
    name: string;
    disabled: boolean;
    save: (name: string) => Promise<void>;
}) {
    const [draft, setDraft] = useState(name);
    return (
        <form
            className="mt-5 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim() && draft.trim() !== name) void save(draft.trim());
            }}
        >
            <label className="min-w-0 flex-1 space-y-2 text-xs">
                Computer name
                <Input
                    className="border-border bg-background/40"
                    aria-label={`Name for ${name}`}
                    value={draft}
                    disabled={disabled}
                    maxLength={80}
                    onChange={(event) => setDraft(event.target.value)}
                />
            </label>
            <Button
                className="cursor-pointer"
                type="submit"
                size="sm"
                variant="outline"
                disabled={disabled || !draft.trim() || draft.trim() === name}
            >
                Rename
            </Button>
        </form>
    );
}
