import { BrowserSettings } from "@hermes/app/settings/browser-settings";
import { SettingsNavigation } from "@hermes/app/settings/settings-navigation";
import { ComputersSettings } from "@hermes/computer/computers-settings";
import { Globe, Layers3, Monitor, Network, Palette } from "@hermes/lib/icons";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./settings-preview.css";
window.hermesDesktop = {
    krontermSurfaces: {
        computerManager: {
            list: async () => ({
                plugins: [
                    {
                        id: "cua-qemu",
                        name: "Ubuntu VM",
                        enabled: true,
                        description: "A full Linux desktop powered by QEMU.",
                    },
                    {
                        id: "openmaus-container",
                        name: "Container desktop",
                        enabled: false,
                        description: "A lightweight desktop using your container service.",
                    },
                ],
                computers: [{ id: "demo", name: "Research workspace", provider: "cua-qemu", slot: 0 }],
            }),
            desktops: async () => [
                {
                    id: "demo",
                    name: "Research workspace",
                    status: "running",
                    ready: true,
                    imagePrepared: true,
                    provider: "cua-qemu",
                    runtime: "QEMU",
                    controlOwner: "user",
                    controlGeneration: 1,
                    workspacePath: "/workspace/research",
                },
            ],
            action: async () => {
                throw new Error("Preview only: no running computer is modified.");
            },
            manage: async () => {
                throw new Error("Preview only: no computer configuration is modified.");
            },
        },
    },
} as any;
function Preview() {
    const [view, setView] = useState("kronterm:browser");
    const entries = [
        { id: "config:appearance", label: "Appearance", icon: Palette },
        { id: "kronterm:browser", label: "Browser", icon: Globe },
        { id: "computers", label: "Virtual machines", icon: Monitor },
        { id: "kronrender", label: "KronRender", icon: Layers3 },
        { id: "kronflow", label: "KronFlow", icon: Network },
    ];
    return (
        <div className="preview-shell">
            <SettingsNavigation
                groups={entries.map((entry) => ({
                    ...entry,
                    active: entry.id === view,
                    onSelect: () => setView(entry.id),
                }))}
            />
            <main className="flex min-h-0 flex-col">
                <header className="mb-6 shrink-0 border-b border-border px-8 pb-6 pt-8">
                    <p className="mb-2 text-[11px] text-muted-foreground">KronOS / Settings</p>
                    <h1 className="text-xl font-medium tracking-tight">
                        {entries.find((entry) => entry.id === view)?.label}
                    </h1>
                </header>
                {view === "computers" ? (
                    <ComputersSettings />
                ) : (
                    <BrowserSettings
                        key={view}
                        initial={{
                            "web:defaulturl": "about:blank",
                            "web:defaultsearch": "https://www.google.com/search?q={query}",
                            "web:openlinksinternally": true,
                        }}
                        save={async () => {}}
                    />
                )}
            </main>
        </div>
    );
}
createRoot(document.getElementById("root")!).render(<Preview />);
