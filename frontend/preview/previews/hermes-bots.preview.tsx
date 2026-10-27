import type { PluginContribution } from "@hermes/contrib/plugin";
import { createPluginContext } from "@hermes/contrib/plugin";
import { BotsPlugin } from "@hermes/plugins/bots/plugin";
import { host } from "@hermes/sdk";
import "@hermes/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

const PreviewProfiles = [
    { name: "default", title: "Hermes", description: "Workspace assistant", last_session: null },
    { name: "research", title: "Research", description: "Source review and investigation", last_session: null },
    { name: "builder", title: "Builder", description: "Implementation and verification", last_session: null },
];

export function HermesBotsPreview() {
    const [roster, setRoster] = useState<PluginContribution>();
    const [client] = useState(() => new QueryClient());
    useEffect(() => {
        const request = host.request;
        host.request = (async (method: string) => {
            if (method === "profiles.list") return { profiles: PreviewProfiles };
            throw new Error("Visual fixture only. Connect a Hermes gateway to use this action.");
        }) as typeof host.request;
        const disposers: (() => void)[] = [];
        const ctx = createPluginContext("bots-preview", (dispose) => disposers.push(dispose));
        BotsPlugin.register({
            ...ctx,
            register(item) {
                if (item.id === "workspace") setRoster(item);
                return () => {};
            },
            registerMany: () => () => {},
        });
        return () => {
            host.request = request;
            disposers.forEach((dispose) => dispose());
            client.clear();
        };
    }, [client]);
    return (
        <QueryClientProvider client={client}>
            <div
                data-hermes-app=""
                className="fixed inset-x-0 bottom-0 top-10 flex flex-col bg-background text-foreground"
            >
                <p className="border-b border-border p-3 text-xs">
                    Hermes Bot Mode · example profiles · no agent execution
                </p>
                <div className="min-h-0 flex-1" style={{ maxWidth: 420 }}>
                    {roster?.render?.()}
                </div>
            </div>
        </QueryClientProvider>
    );
}
