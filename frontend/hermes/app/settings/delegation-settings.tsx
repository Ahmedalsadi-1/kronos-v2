import { getHermesConfigRecord, saveHermesConfig } from "@hermes/hermes";
import { useEffect, useState } from "react";

type Route = {
    originalName?: string;
    name: string;
    description: string;
    provider: string;
    model: string;
    base_url: string;
};

export function DelegationSettings() {
    const [routes, setRoutes] = useState<Route[]>([]);
    const [status, setStatus] = useState("Checking delegation runtime…");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(true);
    useEffect(() => {
        let live = true;
        void Promise.all([
            getHermesConfigRecord(),
            window.hermesDesktop.api<any>({ path: "/api/delegation/routing" }).catch(() => null),
        ])
            .then(([config, routing]) => {
                if (!live) return;
                const options = (config.delegation as any)?.backends?.model_map?.options;
                setRoutes(
                    Array.isArray(options)
                        ? options.map(({ name, description, provider, model, base_url }) => ({
                              originalName: name,
                              base_url: base_url || "",
                              name: name || "",
                              description: description || "",
                              provider: provider || "",
                              model: model || "",
                          }))
                        : []
                );
                setStatus(
                    routing?.blocked_reason
                        ? `Delegation unavailable: ${routing.blocked_reason}`
                        : routing
                          ? "Advanced Delegation available. New sessions use KronOS smart delegation."
                          : "Restart KronOS with the managed Hermes 0.22.5 runtime to enable Advanced Delegation."
                );
            })
            .catch((error) => live && setMessage(String(error)))
            .finally(() => live && setBusy(false));
        return () => {
            live = false;
        };
    }, []);
    const save = async () => {
        if (
            routes.some((route) => !route.name.trim() || !route.description.trim() || !route.model.trim()) ||
            new Set(routes.map((route) => route.name.trim())).size !== routes.length
        ) {
            setMessage("Each route needs a unique name, description and model.");
            return;
        }
        setBusy(true);
        try {
            const config = await getHermesConfigRecord();
            const delegation = (config.delegation || {}) as any;
            const previous = delegation.backends?.model_map || {};
            const options = routes.map((route) => ({
                ...(previous.options || []).find((entry) => entry.name === (route.originalName || route.name)),
                ...Object.fromEntries(
                    Object.entries(route)
                        .filter(([key]) => key !== "originalName")
                        .map(([key, value]) => [key, value.trim()])
                ),
            }));
            if (options.some((route) => !route.provider && !route.base_url))
                throw new Error("Each route needs a configured provider or an existing endpoint.");
            const modelMap = { ...previous, options };
            if (modelMap.default && !options.some((route) => route.name === modelMap.default)) delete modelMap.default;
            await saveHermesConfig({
                ...config,
                delegation: {
                    ...delegation,
                    backend: "kronterm_smart",
                    backends: { ...delegation.backends, model_map: modelMap },
                },
            });
            setRoutes((current) => current.map((route) => ({ ...route, originalName: route.name.trim() })));
            setMessage("Saved. Start a new chat session to refresh the delegation schema.");
        } catch (error) {
            setMessage(String(error));
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="space-y-5 p-6">
            <h2 className="text-lg font-semibold">Smart delegation</h2>
            <p className="text-sm text-muted-foreground">{status}</p>
            <p className="text-sm">
                Computer mode automatically assigns sandbox jobs to the selected VM. Workers receive only their job’s
                tools; required tools and computer readiness are checked before starting. One worker controls each
                sandbox at a time.
            </p>
            <p className="text-sm">
                Named model routes use your configured provider credentials. With no routes, workers inherit the parent
                model.
            </p>
            {routes.map((route, index) => (
                <fieldset key={index} className="space-y-2 rounded border p-3">
                    {(["name", "description", "provider", "model", "base_url"] as const).map((key) => (
                        <label key={key} className="block text-sm capitalize">
                            {key === "base_url" ? "Endpoint URL (optional)" : key}
                            <input
                                aria-label={`Route ${index + 1} ${key}`}
                                className="mt-1 block w-full rounded border bg-transparent p-2"
                                value={route[key]}
                                disabled={busy}
                                onChange={(event) =>
                                    setRoutes((current) =>
                                        current.map((item, position) =>
                                            position === index ? { ...item, [key]: event.target.value } : item
                                        )
                                    )
                                }
                            />
                        </label>
                    ))}
                    <button
                        type="button"
                        className="cursor-pointer text-sm underline"
                        disabled={busy}
                        onClick={() => setRoutes((current) => current.filter((_, position) => position !== index))}
                    >
                        Remove route
                    </button>
                </fieldset>
            ))}
            <div className="flex gap-3">
                <button
                    type="button"
                    className="cursor-pointer rounded border px-3 py-2"
                    disabled={busy}
                    onClick={() =>
                        setRoutes((current) => [
                            ...current,
                            { name: "", description: "", provider: "", model: "", base_url: "" },
                        ])
                    }
                >
                    Add model route
                </button>
                <button
                    type="button"
                    className="cursor-pointer rounded bg-accent/80 px-3 py-2 text-primary"
                    disabled={busy}
                    onClick={() => void save()}
                >
                    Save delegation
                </button>
            </div>
            {message && (
                <p role="status" className="text-sm">
                    {message}
                </p>
            )}
            <a
                className="cursor-pointer text-sm underline"
                href="https://hermes-agent.nousresearch.com/docs/plugins/advanced-delegation"
                target="_blank"
                rel="noreferrer"
            >
                Advanced Delegation documentation
            </a>
        </div>
    );
}
