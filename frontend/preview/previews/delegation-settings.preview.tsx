import { DelegationSettings } from "@hermes/app/settings/delegation-settings";
import "@hermes/styles.css";
import { useEffect, useState } from "react";

export function DelegationSettingsPreview() {
    const [ready, setReady] = useState(false);
    const [saved, setSaved] = useState(false);
    useEffect(() => {
        const previous = window.hermesDesktop;
        let config: any = {
            delegation: {
                backends: {
                    model_map: {
                        options: [
                            {
                                name: "research",
                                description: "Research specialist",
                                provider: "configured-provider",
                                model: "configured-model",
                                reasoning_effort: "high",
                            },
                        ],
                    },
                },
            },
        };
        window.hermesDesktop = {
            ...previous,
            api: async (request: any) => {
                if (request.path === "/api/delegation/routing") return { configured: "kronterm_smart" } as any;
                if (request.method === "PUT") {
                    config = request.body.config;
                    if (config.delegation.backends.model_map.options[0]?.reasoning_effort !== "high")
                        throw new Error("Existing route settings were lost");
                    setSaved(true);
                    return { ok: true } as any;
                }
                return structuredClone(config);
            },
        };
        setReady(true);
        return () => {
            window.hermesDesktop = previous;
        };
    }, []);
    return (
        <div className="h-full overflow-auto bg-background text-foreground">
            <div className="mx-auto max-w-3xl">
                {ready && <DelegationSettings />}
                {saved && <p role="status">Route configuration preserved</p>}
            </div>
        </div>
    );
}
