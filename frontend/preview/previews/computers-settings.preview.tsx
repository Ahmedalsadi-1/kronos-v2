import { ManagedVncScreen } from "@/app/view/linux-vms/managed-vnc-screen";
import { AgentEnginePill } from "@hermes/app/chat/composer/agent-engine-pill";
import { MachineLauncherButton } from "@hermes/components/machine-launcher-button";
import { RootTooltipProvider } from "@hermes/components/ui/tooltip";
import { ComputersSettings } from "@hermes/computer/computers-settings";
import { I18nProvider } from "@hermes/i18n";
import "@hermes/styles.css";
import { useEffect, useState } from "react";
import { MemoryRouter } from "react-router";

export function ComputersSettingsPreview() {
    const [ready, setReady] = useState(false);
    const [selected, setSelected] = useState("");
    const port = new URLSearchParams(location.search).get("vncPort");
    const [computers] = useState(
        () =>
            [
                { id: "linux-vm:ubuntu", name: "Ubuntu", provider: "cua-qemu", slot: 0 },
                { id: "linux-container:research", name: "Research", provider: "openmaus-container", slot: 1 },
            ] as any[]
    );
    const desktop = (config: any) => ({
        ...config,
        status: "running",
        ready: true,
        imagePrepared: true,
        controlGeneration: 0,
        controlOwner: "user",
        runtime: config.provider === "cua-qemu" ? "QEMU · 2 CPU · 2 GB" : "Docker · Cua 0.37 · 2 CPU · 4 GB",
        viewerUrl: port ? `ws://127.0.0.1:${port}/${config.slot}` : "",
        workspacePath: "/fixture/workspace",
    });
    useEffect(() => {
        const previous = window.hermesDesktop;
        let access = { enabled: false, desktopId: "" };
        const plugins = [
            {
                id: "cua-qemu",
                name: "Ubuntu VM",
                description: "Apple Silicon virtual machines · authenticated SSH and live VNC",
                enabled: true,
            },
            {
                id: "openmaus-container",
                name: "OpenMausBot local computers",
                description: "Docker, Podman or Apple Container · Cua 0.37 · persistent files and live desktop",
                enabled: true,
            },
        ];
        const state = () => ({ plugins: [...plugins], computers: [...computers] });
        window.hermesDesktop = {
            ...previous,
            agentBackends: {
                getActive: () => "hermes",
                onActiveChange: () => () => {},
                list: async () => [
                    { id: "hermes", label: "KronOS Agent", available: true, description: "Workspace agent" },
                ],
            },
            krontermSurfaces: {
                ...previous?.krontermSurfaces,
                openMachines: async (_kind, _settings, id) => {
                    setSelected(id);
                    return { ok: true };
                },
                computerManager: {
                    list: async () => state(),
                    desktops: async () => computers.map(desktop),
                    action: async (action) => ({
                        desktop: desktop(computers.find((config) => config.id === action.desktopId)),
                    }),
                    access: async (input) => {
                        if (input?.enabled != null)
                            access = { enabled: input.enabled, desktopId: input.desktopId || "" };
                        return access;
                    },
                    manage: async (command) => {
                        if (command.action === "create")
                            computers.push({
                                id: `fixture-${computers.length}`,
                                name: command.name,
                                provider: command.provider,
                                slot: computers.length,
                            });
                        if (command.action === "plugin")
                            plugins.find((plugin) => plugin.id === command.provider).enabled = command.enabled;
                        return state();
                    },
                },
            },
        } as any;
        setReady(true);
        return () => {
            window.hermesDesktop = previous;
        };
    }, []);
    return (
        <MemoryRouter>
            <I18nProvider>
                <RootTooltipProvider>
                    <div
                        data-hermes-app=""
                        className="fixed inset-x-0 bottom-0 top-10 flex flex-col bg-background text-foreground"
                    >
                        {ready && (
                            <>
                                <div className="flex items-center justify-end gap-2 border-b border-white/10 p-3">
                                    <span className="mr-auto text-xs">
                                        Computer settings preview {selected && `· opened ${selected}`}
                                    </span>
                                    <AgentEnginePill disabled={false} />
                                    <MachineLauncherButton />
                                </div>
                                <div className="grid min-h-0 flex-1 grid-cols-2">
                                    <div className="overflow-y-auto">
                                        <ComputersSettings />
                                    </div>
                                    <div className="grid min-h-0 grid-rows-2 gap-2 p-3">
                                        {computers.slice(0, 2).map((config) => (
                                            <div key={config.id} className="flex min-h-0 flex-col">
                                                <h3 className="pb-1 text-xs">{config.name}</h3>
                                                <div className="min-h-0 flex-1">
                                                    <ManagedVncScreen desktop={desktop(config)} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </RootTooltipProvider>
            </I18nProvider>
        </MemoryRouter>
    );
}
